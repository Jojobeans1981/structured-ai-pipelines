import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { routeTask } from '@/src/lib/model-router';
import { prisma } from '@/src/lib/prisma';
import { DAGExecutor } from '@/src/services/dag-executor';
import { BuildVerifier } from '@/src/services/build-verifier';
import { DockerSandbox } from '@/src/services/docker-sandbox';

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
    return NextResponse.json({ error: 'Node is not running' }, { status: 400 });
  }

  // Handle gate nodes — they just await approval, no LLM needed
  if (stage.nodeType === 'gate') {
    const artifact = `Awaiting human approval for: ${stage.displayName}`;
    await DAGExecutor.completeNode(stage.id, artifact, artifact);
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'checkpoint', data: { stageId: stage.id, nodeId: stage.nodeId, artifact } })}\n\n`));
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
          await DAGExecutor.completeNode(stageId, output, output);
          send({ type: 'checkpoint', data: { stageId, artifact: output } });
          controller.close();
          return;
        }

        // Serverless fallback — static file analysis (no Docker, no filesystem)
        {
          send({ type: 'token', data: { text: '## Build Verification — Static Analysis\n\n' } });

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
