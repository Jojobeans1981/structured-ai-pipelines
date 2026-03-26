import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { routeTask } from '@/src/lib/model-router';
import { prisma } from '@/src/lib/prisma';
import { DAGExecutor } from '@/src/services/dag-executor';
import { BuildVerifier } from '@/src/services/build-verifier';
import { DockerSandbox } from '@/src/services/docker-sandbox';
import { TestGenerator } from '@/src/services/test-generator';
import { DockerfileGenerator } from '@/src/services/dockerfile-generator';
import { CompletenessPass, detectProjectType } from '@/src/services/completeness-pass';
import { CIGenerator } from '@/src/services/ci-generator';
import { SBOMScanner } from '@/src/services/sbom-scanner';
import { CostGuard } from '@/src/services/cost-guard';
import { LearningStore } from '@/src/services/learning-store';
import { ValidationAgent } from '@/src/services/validation-agent';

// Vercel serverless: max execution time (hobby=60s, pro=300s)
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: { runId: string; nodeId: string } }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.runId },
    include: {
      project: { select: { userId: true } },
    },
  });

  if (!run || run.project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const stage = await prisma.pipelineStage.findUnique({
    where: { id: params.nodeId },
  });

  if (!stage || stage.runId !== params.runId) {
    return NextResponse.json({ error: 'Node not found' }, { status: 404 });
  }

  if (stage.status !== 'running') {
    // If already approved (auto-approve beat the SSE connection), return gracefully
    if (stage.status === 'approved' || stage.status === 'awaiting_approval') {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'checkpoint', data: { stageId: stage.id, nodeId: stage.nodeId, artifact: stage.artifactContent || '' } })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      });
    }
    return NextResponse.json({ error: 'Node is not running' }, { status: 400 });
  }

  // Handle gate nodes — they just await approval, no LLM needed
  if (stage.nodeType === 'gate') {
    const isAutoApprove = run.autoApprove;
    const artifact = isAutoApprove
      ? `Auto-approved: ${stage.displayName}`
      : `Awaiting human approval for: ${stage.displayName}`;
    const result = await DAGExecutor.completeNode(stage.id, artifact, artifact);
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        if (isAutoApprove && result.readyNodes.length > 0) {
          // In auto-approve mode, tell frontend about newly running nodes
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'auto-fix', data: { cycle: false, runId: params.runId, message: 'Gate auto-approved, advancing' } })}\n\n`));
        } else {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'checkpoint', data: { stageId: stage.id, nodeId: stage.nodeId, artifact } })}\n\n`));
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  }

  // Handle verify nodes differently
  if (stage.nodeType === 'verify') {
    return handleVerifyNode(params.runId, stage.id, run.outputPath);
  }

  // Cost guard: check budget before running LLM nodes
  if (stage.nodeType === 'skill' || stage.nodeType === 'agent') {
    try {
      const budgetCheck = await CostGuard.checkBudget(params.runId, user.id);
      if (!budgetCheck.allowed) {
        console.warn(`[SSE /nodes/stream] Budget exceeded: ${budgetCheck.reason}`);
        await prisma.pipelineStage.update({
          where: { id: stage.id },
          data: {
            status: 'awaiting_approval',
            artifactContent: `**Budget Exceeded**\n\n${budgetCheck.reason}\n\nApprove this stage to continue anyway, or cancel the run.`,
          },
        });
        const budgetStream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'checkpoint', data: { stageId: stage.id, nodeId: stage.nodeId, artifact: budgetCheck.reason } })}\n\n`));
            controller.close();
          },
        });
        return new Response(budgetStream, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
        });
      }
    } catch (err) {
      console.error('[SSE /nodes/stream] Cost guard check failed (non-fatal):', err);
    }
  }

  // Route to optimal backend based on skill complexity
  let routingResult;
  try {
    routingResult = await routeTask(stage.skillName, user.id);
    console.log(`[SSE /nodes/stream] ${routingResult.reason}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 403 });
  }
  const anthropicClient = routingResult.client;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      let fullText = '';
      try {
        const generator = DAGExecutor.executeNode(
          params.runId,
          stage.id,
          anthropicClient,
          request.signal
        );

        for await (const token of generator) {
          fullText += token;
          send({ type: 'token', data: { text: token } });
        }

        await DAGExecutor.completeNode(stage.id, fullText, fullText);
        send({
          type: 'checkpoint',
          data: { stageId: stage.id, nodeId: stage.nodeId, artifact: fullText },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[SSE /nodes/stream] Node ${stage.id} error:`, message);

        // Reset stage to awaiting_approval with error so user can retry
        try {
          await prisma.pipelineStage.update({
            where: { id: stage.id },
            data: {
              status: 'awaiting_approval',
              artifactContent: `**Error during execution:**\n\n${message}\n\nYou can reject this stage to retry.`,
              streamContent: fullText || null,
            },
          });
        } catch {
          // If we can't even update the stage, log it
          console.error(`[SSE /nodes/stream] Failed to reset stage ${stage.id} after error`);
        }

        send({ type: 'error', data: { message, stageId: stage.id } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

async function handleVerifyNode(
  runId: string,
  stageId: string,
  outputPath: string | null
) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // --- Completeness Pass: scaffold missing config files before verification ---
        const verifyStage = await prisma.pipelineStage.findUnique({
          where: { id: stageId },
          include: { run: { select: { projectId: true } } },
        });
        const verifyProjectId = verifyStage?.run.projectId || '';

        let allProjectFiles = await prisma.projectFile.findMany({
          where: { runId },
          select: { filePath: true, content: true },
        });

        if (allProjectFiles.length > 0) {
          send({ type: 'token', data: { text: '## Completeness Pass\n\n' } });
          const projectType = detectProjectType(allProjectFiles);
          const completenessResult = CompletenessPass.run(allProjectFiles, projectType);

          if (completenessResult.files.length > 0) {
            for (const file of completenessResult.files) {
              await prisma.projectFile.upsert({
                where: { projectId_filePath: { projectId: verifyProjectId, filePath: file.filePath } },
                create: {
                  projectId: verifyProjectId,
                  runId,
                  filePath: file.filePath,
                  content: file.content,
                  language: file.language,
                  createdByStage: stageId,
                },
                update: { content: file.content, language: file.language, runId },
              });
            }

            send({ type: 'token', data: { text: completenessResult.report } });
            console.log(`[Verify] Completeness pass scaffolded ${completenessResult.files.length} files`);

            // Reload files so verification sees the scaffolded files
            allProjectFiles = await prisma.projectFile.findMany({
              where: { runId },
              select: { filePath: true, content: true },
            });
          } else {
            send({ type: 'token', data: { text: completenessResult.report } });
          }
        }

        // --- Build Verification ---
        // Strategy: Docker sandbox → filesystem verify → skip
        const dockerAvailable = DockerSandbox.isAvailable();

        if (dockerAvailable) {
          // Docker sandbox — full isolated verification
          send({ type: 'token', data: { text: '## Build Verification — Docker Sandbox\n\n' } });
          send({ type: 'token', data: { text: 'Starting isolated Docker container...\n\n' } });

          // Get all project files from DB
          const stage = await prisma.pipelineStage.findUnique({
            where: { id: stageId },
            include: { run: { select: { projectId: true } } },
          });
          const projectFiles = await prisma.projectFile.findMany({
            where: { runId: runId },
            select: { filePath: true, content: true },
          });

          if (projectFiles.length === 0) {
            const artifact = '## Build Verification — No Files\n\n' +
              '**Status:** SKIPPED\n\nNo files were generated to verify.';
            send({ type: 'token', data: { text: artifact } });
            await DAGExecutor.completeNode(stageId, artifact, artifact);
            send({ type: 'checkpoint', data: { stageId, artifact } });
            controller.close();
            return;
          }

          send({ type: 'token', data: { text: `Found ${projectFiles.length} files. Running in Docker...\n\n` } });

          const result = await DockerSandbox.verify(projectFiles);

          let output = `## Build Verification ${result.success ? '✅ PASSED' : '❌ FAILED'}\n\n`;
          output += `**Phase:** ${result.phase}\n`;
          output += `**Duration:** ${result.durationMs}ms\n`;
          output += `**Container:** ${result.containerId?.substring(0, 12) || 'N/A'}\n\n`;

          if (result.healthCheck) {
            output += `### Health Check\n`;
            output += `- **Reachable:** ${result.healthCheck.reachable ? 'Yes ✅' : 'No ❌'}\n`;
            if (result.healthCheck.statusCode) {
              output += `- **Status Code:** ${result.healthCheck.statusCode}\n`;
            }
            output += '\n';
          }

          if (result.stdout) {
            output += `### Output\n\`\`\`\n${result.stdout.substring(0, 3000)}\n\`\`\`\n\n`;
          }

          if (result.stderr) {
            output += `### Errors\n\`\`\`\n${result.stderr.substring(0, 3000)}\n\`\`\`\n\n`;
          }

          send({ type: 'token', data: { text: output } });

          // AUTO-FIX: If Docker build failed, try to auto-fix
          if (!result.success) {
            const errorForFix = [result.stderr, result.stdout].filter(Boolean).join('\n');
            const autoFixed = await tryAutoFix(runId, stageId, errorForFix, send);
            if (autoFixed) {
              send({ type: 'auto-fix', data: { cycle: true, runId, message: 'Auto-fix triggered — re-running failed stages' } });
              controller.close();
              return;
            }
          }

          // Scaffold tests + Docker after build verification
          const scaffoldOutput = await scaffoldTestsAndDocker(runId, stage?.run.projectId || '', stageId, send);
          output += scaffoldOutput;

          await DAGExecutor.completeNode(stageId, output, output);
          send({ type: 'checkpoint', data: { stageId, artifact: output } });
          controller.close();
          return;
        }

        if (outputPath) {
          // Filesystem verify (local dev without Docker)
          send({ type: 'token', data: { text: `Verifying build in ${outputPath}...\n\n` } });

          const result = await BuildVerifier.verify(outputPath);

          let output = '';
          output += `## Build Verification ${result.success ? 'PASSED' : 'FAILED'}\n\n`;
          output += `**Duration:** ${result.durationMs}ms\n\n`;

          if (result.installOutput) {
            output += `### Install Output\n\`\`\`\n${result.installOutput.substring(0, 2000)}\n\`\`\`\n\n`;
          }
          if (result.buildOutput) {
            output += `### Build Output\n\`\`\`\n${result.buildOutput.substring(0, 2000)}\n\`\`\`\n\n`;
          }
          if (result.errors.length > 0) {
            output += `### Errors\n${result.errors.map((e: string) => `- ${e}`).join('\n')}\n\n`;
          }
          if (result.warnings.length > 0) {
            output += `### Warnings\n${result.warnings.map((w: string) => `- ${w}`).join('\n')}\n\n`;
          }

          send({ type: 'token', data: { text: output } });

          // AUTO-FIX: If filesystem build failed, try to auto-fix
          if (!result.success) {
            const errorForFix = result.errors.join('\n');
            const autoFixed = await tryAutoFix(runId, stageId, errorForFix, send);
            if (autoFixed) {
              send({ type: 'auto-fix', data: { cycle: true, runId, message: 'Auto-fix triggered — re-running failed stages' } });
              controller.close();
              return;
            }
          }

          // Scaffold tests + Docker after filesystem verification
          const fsStage = await prisma.pipelineStage.findUnique({
            where: { id: stageId },
            include: { run: { select: { projectId: true } } },
          });
          const fsScaffoldOutput = await scaffoldTestsAndDocker(runId, fsStage?.run.projectId || '', stageId, send);
          output += fsScaffoldOutput;

          await DAGExecutor.completeNode(stageId, output, output);
          send({ type: 'checkpoint', data: { stageId, artifact: output } });
          controller.close();
          return;
        }

        // Serverless fallback — static file analysis (no Docker, no filesystem)
        {
          send({ type: 'token', data: { text: '## Build Verification — Static Analysis\n\n' } });

          const staticStage = await prisma.pipelineStage.findUnique({
            where: { id: stageId },
            include: { run: { select: { projectId: true } } },
          });
          const staticProjectId = staticStage?.run.projectId || '';

          const projectFiles = await prisma.projectFile.findMany({
            where: { runId },
            select: { filePath: true, content: true, language: true },
          });

          if (projectFiles.length === 0) {
            const artifact = '## Build Verification — No Files\n\n**Status:** FAILED\n\nNo files were generated.';
            send({ type: 'token', data: { text: artifact } });
            await DAGExecutor.completeNode(stageId, artifact, artifact);
            send({ type: 'checkpoint', data: { stageId, artifact } });
            controller.close();
            return;
          }

          let output = `Analyzing ${projectFiles.length} files...\n\n`;
          send({ type: 'token', data: { text: output } });

          const checks: string[] = [];
          const warnings: string[] = [];
          const errors: string[] = [];

          // Check 1: package.json exists
          const pkgFile = projectFiles.find((f) => f.filePath === 'package.json');
          if (pkgFile) {
            checks.push('package.json exists');
            try {
              const pkg = JSON.parse(pkgFile.content);
              if (pkg.dependencies) checks.push(`${Object.keys(pkg.dependencies).length} dependencies declared`);
              if (pkg.scripts?.build) checks.push('build script defined');
              else warnings.push('No build script in package.json');
              if (pkg.scripts?.dev || pkg.scripts?.start) checks.push('dev/start script defined');
              else warnings.push('No dev or start script');
            } catch {
              errors.push('package.json is not valid JSON');
            }
          } else {
            errors.push('No package.json found — app cannot be installed');
          }

          // Check 2: Entry point exists
          const entryFiles = ['src/main.tsx', 'src/main.ts', 'src/index.tsx', 'src/index.ts', 'src/App.tsx', 'src/app.tsx', 'index.html'];
          const hasEntry = entryFiles.some((e) => projectFiles.find((f) => f.filePath === e));
          if (hasEntry) checks.push('Entry point found');
          else warnings.push('No standard entry point found (src/main.tsx, index.html, etc.)');

          // Check 3: Import resolution
          const allPaths = new Set(projectFiles.map((f) => f.filePath));
          let resolvedImports = 0;
          let brokenImports = 0;
          for (const file of projectFiles) {
            const importMatches = file.content.matchAll(/(?:import|from)\s+['"]\.\/([^'"]+)['"]/g);
            for (const match of importMatches) {
              let importPath = match[1];
              // Try with extensions
              const dir = file.filePath.includes('/') ? file.filePath.substring(0, file.filePath.lastIndexOf('/')) + '/' : '';
              const candidates = [
                dir + importPath,
                dir + importPath + '.ts',
                dir + importPath + '.tsx',
                dir + importPath + '.js',
                dir + importPath + '.jsx',
                dir + importPath + '/index.ts',
                dir + importPath + '/index.tsx',
              ];
              if (candidates.some((c) => allPaths.has(c))) {
                resolvedImports++;
              } else {
                brokenImports++;
                if (brokenImports <= 5) {
                  warnings.push(`Unresolved import: "${match[1]}" in ${file.filePath}`);
                }
              }
            }
          }
          if (resolvedImports > 0) checks.push(`${resolvedImports} imports resolved`);
          if (brokenImports > 0) warnings.push(`${brokenImports} total unresolved imports`);

          // Check 4: No empty files
          const emptyFiles = projectFiles.filter((f) => f.content.trim().length === 0);
          if (emptyFiles.length > 0) warnings.push(`${emptyFiles.length} empty files: ${emptyFiles.map((f) => f.filePath).join(', ')}`);

          // Check 5: No TODO/stub code
          let todoCount = 0;
          for (const file of projectFiles) {
            const todos = (file.content.match(/TODO|FIXME|implement later|not implemented/gi) || []).length;
            todoCount += todos;
          }
          if (todoCount > 0) warnings.push(`${todoCount} TODO/FIXME markers found`);
          else checks.push('No TODO/FIXME markers');

          // Check 6: Config files
          const hasTs = projectFiles.some((f) => f.filePath.endsWith('.ts') || f.filePath.endsWith('.tsx'));
          if (hasTs) {
            const hasTsConfig = projectFiles.some((f) => f.filePath === 'tsconfig.json');
            if (hasTsConfig) checks.push('tsconfig.json exists');
            else warnings.push('TypeScript files found but no tsconfig.json');
          }

          // Build result
          const passed = errors.length === 0;
          let artifact = `## Build Verification — Static Analysis ${passed ? '✅ PASSED' : '❌ ISSUES FOUND'}\n\n`;
          artifact += `**Files analyzed:** ${projectFiles.length}\n\n`;

          if (checks.length > 0) {
            artifact += `### Checks Passed\n${checks.map((c) => `- ✅ ${c}`).join('\n')}\n\n`;
          }
          if (warnings.length > 0) {
            artifact += `### Warnings\n${warnings.map((w) => `- ⚠️ ${w}`).join('\n')}\n\n`;
          }
          if (errors.length > 0) {
            artifact += `### Errors\n${errors.map((e) => `- ❌ ${e}`).join('\n')}\n\n`;
          }

          send({ type: 'token', data: { text: artifact } });

          // AUTO-FIX: If static analysis found critical errors, try to auto-fix
          if (errors.length > 0) {
            const errorForFix = errors.join('\n') + '\n\nWarnings:\n' + warnings.join('\n');
            const autoFixed = await tryAutoFix(runId, stageId, errorForFix, send);
            if (autoFixed) {
              send({ type: 'auto-fix', data: { cycle: true, runId, message: 'Auto-fix triggered — re-running failed stages' } });
              controller.close();
              return;
            }
          }

          // Scaffold tests + Docker after static analysis
          const staticScaffoldOutput = await scaffoldTestsAndDocker(runId, staticProjectId, stageId, send);
          artifact += staticScaffoldOutput;

          // Run validation agent (lightweight on Vercel, full Docker locally)
          try {
            send({ type: 'token', data: { text: '\n## Validation Agent\n\n' } });
            const validationReport = await ValidationAgent.validate(runId, staticProjectId);
            const validationOutput = ValidationAgent.formatReport(validationReport);
            send({ type: 'token', data: { text: validationOutput } });
            artifact += '\n' + validationOutput;
          } catch (err) {
            console.error('[Verify] Validation agent failed (non-fatal):', err);
          }

          await DAGExecutor.completeNode(stageId, artifact, artifact);
          send({ type: 'checkpoint', data: { stageId, artifact } });
          controller.close();
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        try {
          await prisma.pipelineStage.update({
            where: { id: stageId },
            data: {
              status: 'awaiting_approval',
              artifactContent: `**Build verification error:**\n\n${message}\n\nReject to retry.`,
            },
          });
        } catch { /* non-fatal */ }
        send({ type: 'error', data: { message, stageId } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * Scaffold test files and Docker config for a completed project.
 * Saves generated files to DB and returns a markdown summary.
 */
async function scaffoldTestsAndDocker(
  runId: string,
  projectId: string,
  stageId: string,
  send: (event: object) => void
): Promise<string> {
  let output = '';

  const projectFiles = await prisma.projectFile.findMany({
    where: { runId },
    select: { filePath: true, content: true },
  });

  if (projectFiles.length === 0) return '';

  // Detect project type
  const projectType = projectFiles.some((f) => f.filePath === 'package.json')
    ? 'node' as const
    : projectFiles.some((f) => f.filePath === 'requirements.txt' || f.filePath === 'pyproject.toml')
      ? 'python' as const
      : projectFiles.some((f) => f.filePath === 'go.mod')
        ? 'go' as const
        : projectFiles.some((f) => f.filePath === 'index.html')
          ? 'static' as const
          : 'unknown' as const;

  // --- Test Scaffolding ---
  send({ type: 'token', data: { text: '\n---\n\n## Test Scaffolding\n\n' } });

  try {
    const testResult = TestGenerator.scaffold(projectFiles, projectType);

    if (testResult.files.length > 0 || testResult.configFiles.length > 0) {
      const allTestFiles = [...testResult.configFiles, ...testResult.files];

      // Save test files to DB
      for (const file of allTestFiles) {
        await prisma.projectFile.upsert({
          where: { projectId_filePath: { projectId, filePath: file.filePath } },
          create: {
            projectId,
            runId,
            filePath: file.filePath,
            content: file.content,
            language: file.language,
            createdByStage: stageId,
          },
          update: {
            content: file.content,
            language: file.language,
            runId,
          },
        });
      }

      // Update package.json with test deps if Node project
      if (projectType === 'node') {
        const pkgFile = projectFiles.find((f) => f.filePath === 'package.json');
        if (pkgFile) {
          const updatedPkg = TestGenerator.mergeTestDeps(pkgFile.content, projectType);
          await prisma.projectFile.update({
            where: { projectId_filePath: { projectId, filePath: 'package.json' } },
            data: { content: updatedPkg },
          });
        }
      }

      let testOutput = `**Framework:** ${testResult.framework}\n`;
      testOutput += `**Config files:** ${testResult.configFiles.map((f) => f.filePath).join(', ') || 'none'}\n`;
      testOutput += `**Test files generated:** ${testResult.files.length}\n`;
      for (const f of testResult.files) {
        testOutput += `- \`${f.filePath}\`\n`;
      }
      testOutput += '\n';

      output += testOutput;
      send({ type: 'token', data: { text: testOutput } });
      console.log(`[Verify] Scaffolded ${allTestFiles.length} test files (${testResult.framework})`);
    } else {
      output += 'No testable files found — skipped.\n\n';
      send({ type: 'token', data: { text: 'No testable files found — skipped.\n\n' } });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    output += `Test scaffolding failed (non-fatal): ${msg}\n\n`;
    console.error('[Verify] Test scaffolding failed:', err);
  }

  // --- Dockerfile Generation ---
  send({ type: 'token', data: { text: '## Docker Configuration\n\n' } });

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });
    const projectName = project?.name || 'app';

    const dockerResult = DockerfileGenerator.generate(projectFiles, {
      projectName,
      projectType,
    });

    if (dockerResult.files.length > 0) {
      for (const file of dockerResult.files) {
        await prisma.projectFile.upsert({
          where: { projectId_filePath: { projectId, filePath: file.filePath } },
          create: {
            projectId,
            runId,
            filePath: file.filePath,
            content: file.content,
            language: file.filePath.endsWith('.yml') ? 'yaml' : file.filePath === 'Dockerfile' ? 'dockerfile' : 'plaintext',
            createdByStage: stageId,
          },
          update: {
            content: file.content,
            runId,
          },
        });
      }

      let dockerOutput = `**Project type:** ${dockerResult.projectType}\n`;
      dockerOutput += `**Port:** ${dockerResult.port}\n`;
      dockerOutput += `**Image:** \`${dockerResult.imageName}\`\n`;
      dockerOutput += `**Files generated:**\n`;
      for (const f of dockerResult.files) {
        dockerOutput += `- \`${f.filePath}\`\n`;
      }
      dockerOutput += `\n**Quick start:**\n\`\`\`bash\ndocker compose up --build\n\`\`\`\n\n`;

      output += dockerOutput;
      send({ type: 'token', data: { text: dockerOutput } });
      console.log(`[Verify] Generated ${dockerResult.files.length} Docker files (${dockerResult.imageName})`);
    } else {
      output += 'Could not detect project type — Docker generation skipped.\n\n';
      send({ type: 'token', data: { text: 'Could not detect project type — Docker generation skipped.\n\n' } });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    output += `Docker generation failed (non-fatal): ${msg}\n\n`;
    console.error('[Verify] Docker generation failed:', err);
  }

  // --- CI/CD Pipeline Generation ---
  send({ type: 'token', data: { text: '## CI/CD Pipeline\n\n' } });

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });

    const ciResult = CIGenerator.generate(projectFiles, projectType, project?.name || 'app');

    if (ciResult.files.length > 0) {
      for (const file of ciResult.files) {
        await prisma.projectFile.upsert({
          where: { projectId_filePath: { projectId, filePath: file.filePath } },
          create: {
            projectId,
            runId,
            filePath: file.filePath,
            content: file.content,
            language: file.language,
            createdByStage: stageId,
          },
          update: { content: file.content, runId },
        });
      }

      let ciOutput = `**Provider:** ${ciResult.provider}\n`;
      ciOutput += `**Files generated:**\n`;
      for (const f of ciResult.files) {
        ciOutput += `- \`${f.filePath}\`\n`;
      }
      ciOutput += '\n';

      output += ciOutput;
      send({ type: 'token', data: { text: ciOutput } });
      console.log(`[Verify] Generated ${ciResult.files.length} CI files`);
    } else {
      output += 'Project type not supported for CI generation.\n\n';
      send({ type: 'token', data: { text: 'Project type not supported for CI generation.\n\n' } });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    output += `CI generation failed (non-fatal): ${msg}\n\n`;
    console.error('[Verify] CI generation failed:', err);
  }

  // --- SBOM & Dependency Security Scan ---
  send({ type: 'token', data: { text: '## SBOM & Dependency Scan\n\n' } });

  try {
    const sbomResult = SBOMScanner.scan(projectFiles);

    output += sbomResult.report + '\n';
    send({ type: 'token', data: { text: sbomResult.report + '\n' } });

    // Save CycloneDX SBOM as a project file
    if (sbomResult.components.length > 0) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      });
      const sbomJson = SBOMScanner.toCycloneDX(sbomResult, project?.name || 'app');

      await prisma.projectFile.upsert({
        where: { projectId_filePath: { projectId, filePath: 'sbom.cdx.json' } },
        create: {
          projectId,
          runId,
          filePath: 'sbom.cdx.json',
          content: sbomJson,
          language: 'json',
          createdByStage: stageId,
        },
        update: { content: sbomJson, runId },
      });

      send({ type: 'token', data: { text: '`sbom.cdx.json` saved to project files.\n\n' } });
      output += '`sbom.cdx.json` saved to project files.\n\n';
    }

    console.log(`[Verify] SBOM: ${sbomResult.totalDeps} deps, ${sbomResult.vulnerabilities.length} findings`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    output += `SBOM scan failed (non-fatal): ${msg}\n\n`;
    console.error('[Verify] SBOM scan failed:', err);
  }

  return output;
}

/** Max number of auto-fix cycles before escalating to the user. */
const MAX_AUTO_FIX_CYCLES = parseInt(process.env.FORGE_MAX_AUTO_FIX || '3', 10);

/**
 * When build verification fails, auto-reject the last phase-executor stages
 * with the error output injected, reset the verify node, and let the DAG
 * re-execute. Records failures in the learning store so future runs avoid
 * the same mistakes.
 *
 * Returns true if an auto-fix cycle was triggered (caller should NOT call
 * completeNode — the pipeline will re-run). Returns false if max retries
 * exceeded or no executor stages found (caller should proceed normally).
 */
async function tryAutoFix(
  runId: string,
  stageId: string,
  errorOutput: string,
  send: (event: object) => void
): Promise<boolean> {
  // Check how many times the verify node has already retried
  const verifyStage = await prisma.pipelineStage.findUnique({
    where: { id: stageId },
    select: { retryCount: true, maxRetries: true, runId: true },
  });

  if (!verifyStage) return false;

  const cycleCount = verifyStage.retryCount;
  if (cycleCount >= MAX_AUTO_FIX_CYCLES) {
    send({ type: 'token', data: { text: `\n\n---\n\n**Auto-fix limit reached (${cycleCount}/${MAX_AUTO_FIX_CYCLES} cycles).** Presenting to you for manual review.\n\n` } });
    console.log(`[AutoFix] Max cycles (${MAX_AUTO_FIX_CYCLES}) reached — escalating to human`);
    return false;
  }

  // Find all phase-executor stages that produced code for this run
  const executorStages = await prisma.pipelineStage.findMany({
    where: {
      runId,
      skillName: { in: ['phase-executor', 'fix-executor'] },
      status: 'approved',
    },
    orderBy: { stageIndex: 'desc' },
    select: {
      id: true,
      displayName: true,
      nodeId: true,
      retryCount: true,
      maxRetries: true,
      artifactContent: true,
    },
  });

  if (executorStages.length === 0) {
    send({ type: 'token', data: { text: '\n\nNo executor stages found to retry.\n\n' } });
    return false;
  }

  // Truncate error for prompt injection (keep the most useful part)
  const errorTruncated = errorOutput.substring(0, 3000);

  // Build a feedback message that tells the executor what went wrong
  const feedback =
    `BUILD VERIFICATION FAILED (auto-fix cycle ${cycleCount + 1}/${MAX_AUTO_FIX_CYCLES}):\n\n` +
    `The code you generated previously did not compile or run successfully.\n` +
    `Here is the error output from the build verification:\n\n` +
    '```\n' + errorTruncated + '\n```\n\n' +
    `FIX THESE ERRORS. Regenerate the files that are broken. Do NOT regenerate files that are working.\n` +
    `Pay special attention to:\n` +
    `- Missing imports or wrong import paths\n` +
    `- Missing dependencies in package.json\n` +
    `- TypeScript type errors\n` +
    `- Missing or mismatched exports\n` +
    `- Syntax errors\n\n` +
    `Output ONLY the fixed files with complete contents.`;

  send({ type: 'token', data: { text: `\n\n---\n\n## Auto-Fix Cycle ${cycleCount + 1}/${MAX_AUTO_FIX_CYCLES}\n\n` } });
  send({ type: 'token', data: { text: `Build failed — automatically re-running executor stages with error feedback...\n\n` } });

  // Record failure pattern in learning store for future runs
  try {
    // Extract the core error type
    const errorType = extractErrorType(errorOutput);
    for (const stage of executorStages) {
      await LearningStore.recordRejection(
        'build-verifier',
        'phase-executor',
        `Build failed: ${errorType}`,
        runId,
        stage.id
      );
    }
    console.log(`[AutoFix] Recorded build failure pattern: "${errorType}"`);
  } catch { /* non-fatal */ }

  // Reset the executor stages that need fixing
  // Strategy: reset the LAST executor stage (most likely to contain the bug)
  // If it fails again, we'll reset more stages on the next cycle
  const stagesToReset = cycleCount === 0
    ? executorStages.slice(0, 1) // First cycle: just the last executor
    : executorStages.slice(0, Math.min(cycleCount + 1, executorStages.length)); // Widen on subsequent cycles

  for (const stage of stagesToReset) {
    if (stage.retryCount >= (stage.maxRetries || 2)) {
      send({ type: 'token', data: { text: `- "${stage.displayName}" — max retries exhausted, skipping\n` } });
      continue;
    }

    // Reset executor stage with error feedback
    await prisma.pipelineStage.update({
      where: { id: stage.id },
      data: {
        status: 'running',
        startedAt: new Date(),
        completedAt: null,
        approvedAt: null,
        durationMs: null,
        artifactContent: null,
        streamContent: stage.artifactContent, // preserve previous output
        userFeedback: feedback,
        retryCount: stage.retryCount + 1,
      },
    });

    send({ type: 'token', data: { text: `- Resetting "${stage.displayName}" with build errors (retry ${stage.retryCount + 1})\n` } });
    console.log(`[AutoFix] Reset "${stage.displayName}" with error feedback (retry ${stage.retryCount + 1})`);
  }

  // Reset the verify node itself to pending so it re-runs after executors complete
  await prisma.pipelineStage.update({
    where: { id: stageId },
    data: {
      status: 'pending',
      startedAt: null,
      completedAt: null,
      approvedAt: null,
      durationMs: null,
      artifactContent: null,
      streamContent: errorOutput, // preserve the error for context
      retryCount: cycleCount + 1,
    },
  });

  send({ type: 'token', data: { text: `\nVerify node reset — pipeline will re-execute failed stages and re-verify.\n\n` } });
  console.log(`[AutoFix] Verify node reset to pending (cycle ${cycleCount + 1})`);

  return true;
}

/**
 * Extract a concise error type from build output for learning store.
 */
function extractErrorType(errorOutput: string): string {
  // Check for common error patterns
  if (errorOutput.includes('Cannot find module')) {
    const match = errorOutput.match(/Cannot find module '([^']+)'/);
    return match ? `Missing module: ${match[1]}` : 'Missing module import';
  }
  if (errorOutput.includes('is not a function')) {
    return 'Runtime: called non-function';
  }
  if (errorOutput.includes('SyntaxError')) {
    return 'Syntax error in generated code';
  }
  if (errorOutput.match(/TS\d{4}/)) {
    const match = errorOutput.match(/(TS\d{4}): (.+?)[\r\n]/);
    return match ? `TypeScript ${match[1]}: ${match[2].substring(0, 80)}` : 'TypeScript compilation error';
  }
  if (errorOutput.includes('Module not found')) {
    const match = errorOutput.match(/Module not found: (.+?)[\r\n]/);
    return match ? `Module not found: ${match[1].substring(0, 80)}` : 'Module not found';
  }
  if (errorOutput.includes('ENOENT')) {
    return 'File not found (ENOENT)';
  }
  if (errorOutput.includes('npm ERR!')) {
    return 'npm install failed';
  }
  if (errorOutput.includes('package.json')) {
    return 'package.json issue';
  }

  // Generic fallback — first error-ish line
  const errorLine = errorOutput.split('\n').find(
    (l) => l.match(/error|Error|ERROR|failed|Failed/) && l.trim().length > 10
  );
  return errorLine ? errorLine.trim().substring(0, 100) : 'Unknown build error';
}
