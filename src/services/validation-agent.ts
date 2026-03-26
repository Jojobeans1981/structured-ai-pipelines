import { execSync } from 'child_process';
import { prisma } from '@/src/lib/prisma';
import { TraceLogger } from '@/src/services/trace-logger';

/**
 * Validation Agent — runs lint/test/coverage/security checks on generated code.
 * Uses Docker when available (full Python agent), falls back to lightweight
 * structural validation when Docker is not present (e.g. Vercel).
 */

interface ValidationPhase {
  name: string;
  status: 'pass' | 'fail' | 'skip' | 'warn';
  output: string;
  errors: number;
}

export interface ValidationReport {
  ready: boolean;
  languages: string[];
  phases: ValidationPhase[];
  coveragePercent: number | null;
  lintErrors: number;
  securityFindings: number;
  summary: string;
  durationMs: number;
}

export class ValidationAgent {
  /**
   * Run validation on a completed build.
   * Checks Docker availability and routes accordingly.
   */
  static async validate(runId: string, projectId: string): Promise<ValidationReport> {
    const startTime = Date.now();

    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      select: { traceId: true, outputPath: true },
    });
    const traceId = run?.traceId || 'unknown';
    const spanId = await TraceLogger.stageStart(runId, traceId, runId, 'Validation Agent');

    let report: ValidationReport;

    if (run?.outputPath && ValidationAgent.isDockerAvailable()) {
      report = await ValidationAgent.runDockerValidation(run.outputPath);
    } else {
      report = await ValidationAgent.runLightweightValidation(runId, projectId);
    }

    report.durationMs = Date.now() - startTime;

    await TraceLogger.log({
      runId,
      traceId,
      spanId,
      eventType: report.ready ? 'stage_complete' : 'gate_rejected',
      source: 'validation-agent',
      message: `Validation: ${report.ready ? 'READY' : 'NOT READY'} — ${report.languages.join(', ')}`,
      metadata: {
        ready: report.ready,
        languages: report.languages,
        lintErrors: report.lintErrors,
        securityFindings: report.securityFindings,
        coveragePercent: report.coveragePercent,
      },
      durationMs: report.durationMs,
    });

    console.log(`[ValidationAgent] ${report.ready ? 'READY' : 'NOT READY'}: ${report.summary} (${report.durationMs}ms)`);
    return report;
  }

  private static isDockerAvailable(): boolean {
    try {
      execSync('docker info', { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Full Docker-based validation using the Python validation agent.
   */
  private static async runDockerValidation(outputPath: string): Promise<ValidationReport> {
    try {
      const result = execSync(
        `docker run --rm -v "${outputPath}:/workspace" validation-agent --repo /workspace --output /dev/stdout`,
        { timeout: 120_000, encoding: 'utf-8' }
      );

      const parsed = JSON.parse(result);
      return {
        ready: parsed.ready ?? false,
        languages: parsed.languages ?? [],
        phases: (parsed.phases ?? []).map((p: Record<string, unknown>) => ({
          name: String(p.name || ''),
          status: String(p.status || 'skip') as ValidationPhase['status'],
          output: String(p.output || ''),
          errors: Number(p.errors || 0),
        })),
        coveragePercent: parsed.coverage_percent ?? null,
        lintErrors: parsed.lint_errors ?? 0,
        securityFindings: parsed.security_findings ?? 0,
        summary: parsed.summary ?? 'Docker validation complete',
        durationMs: 0,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Docker validation failed';
      console.error('[ValidationAgent] Docker validation failed:', message);
      return ValidationAgent.fallbackReport('Docker validation error: ' + message);
    }
  }

  /**
   * Lightweight validation when Docker is not available.
   * Checks file structure, detects languages, validates basic integrity.
   */
  private static async runLightweightValidation(
    runId: string,
    projectId: string
  ): Promise<ValidationReport> {
    const files = await prisma.projectFile.findMany({
      where: { runId },
      select: { filePath: true, content: true },
    });

    if (files.length === 0) {
      return ValidationAgent.fallbackReport('No files found to validate');
    }

    // Detect languages
    const extMap: Record<string, string> = {
      '.ts': 'node', '.tsx': 'node', '.js': 'node', '.jsx': 'node',
      '.py': 'python', '.go': 'go', '.java': 'java',
      '.cs': 'dotnet', '.csproj': 'dotnet',
    };
    const languages = new Set<string>();
    for (const file of files) {
      const ext = file.filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
      if (extMap[ext]) languages.add(extMap[ext]);
    }

    const phases: ValidationPhase[] = [];

    // Structure check
    const hasPackageJson = files.some((f) => f.filePath === 'package.json' || f.filePath.endsWith('/package.json'));
    const hasEntryPoint = files.some((f) =>
      /^(src\/)?(index|main|app)\.(ts|tsx|js|jsx|py|go)$/.test(f.filePath) ||
      f.filePath.includes('page.tsx') || f.filePath.includes('layout.tsx')
    );
    const hasConfig = files.some((f) =>
      /(tsconfig|next\.config|vite\.config|webpack\.config|\.eslintrc|tailwind\.config)/.test(f.filePath)
    );

    phases.push({
      name: 'structure',
      status: hasPackageJson && hasEntryPoint ? 'pass' : hasPackageJson || hasEntryPoint ? 'warn' : 'fail',
      output: `${files.length} files, package.json: ${hasPackageJson ? 'yes' : 'no'}, entry point: ${hasEntryPoint ? 'yes' : 'no'}, config: ${hasConfig ? 'yes' : 'no'}`,
      errors: (hasPackageJson ? 0 : 1) + (hasEntryPoint ? 0 : 1),
    });

    // Stub/TODO check
    let stubCount = 0;
    const stubFiles: string[] = [];
    for (const file of files) {
      const stubs = (file.content.match(/TODO|FIXME|implement later|throw new Error\(['"]not implemented/gi) || []).length;
      if (stubs > 0) {
        stubCount += stubs;
        stubFiles.push(file.filePath);
      }
    }

    phases.push({
      name: 'completeness',
      status: stubCount === 0 ? 'pass' : stubCount <= 3 ? 'warn' : 'fail',
      output: stubCount === 0
        ? 'No stubs or TODOs found'
        : `${stubCount} stubs/TODOs in: ${stubFiles.slice(0, 5).join(', ')}`,
      errors: stubCount,
    });

    // Import consistency check (for Node projects)
    if (languages.has('node')) {
      const fileSet = new Set(files.map((f) => f.filePath));
      let brokenImports = 0;
      for (const file of files) {
        const imports = file.content.matchAll(/(?:import|require)\s*\(?['"]\.\/([^'"]+)['"]\)?/g);
        for (const match of imports) {
          const importPath = match[1].replace(/\.(ts|tsx|js|jsx)$/, '');
          const possiblePaths = [
            `${importPath}.ts`, `${importPath}.tsx`, `${importPath}.js`,
            `${importPath}/index.ts`, `${importPath}/index.tsx`, `${importPath}/index.js`,
          ];
          const base = file.filePath.includes('/') ? file.filePath.replace(/\/[^/]+$/, '/') : '';
          const exists = possiblePaths.some((p) => fileSet.has(base + p) || fileSet.has(p));
          if (!exists) brokenImports++;
        }
      }

      phases.push({
        name: 'imports',
        status: brokenImports === 0 ? 'pass' : brokenImports <= 3 ? 'warn' : 'fail',
        output: brokenImports === 0
          ? 'All relative imports resolve to existing files'
          : `${brokenImports} broken relative imports detected`,
        errors: brokenImports,
      });
    }

    // Dependencies check (package.json)
    if (hasPackageJson) {
      const pkgFile = files.find((f) => f.filePath === 'package.json' || f.filePath.endsWith('/package.json'));
      if (pkgFile) {
        try {
          const pkg = JSON.parse(pkgFile.content);
          const hasDeps = Object.keys(pkg.dependencies || {}).length > 0;
          const hasScripts = pkg.scripts && (pkg.scripts.build || pkg.scripts.start || pkg.scripts.dev);
          phases.push({
            name: 'dependencies',
            status: hasDeps && hasScripts ? 'pass' : 'warn',
            output: `${Object.keys(pkg.dependencies || {}).length} deps, scripts: ${Object.keys(pkg.scripts || {}).join(', ') || 'none'}`,
            errors: hasScripts ? 0 : 1,
          });
        } catch {
          phases.push({
            name: 'dependencies',
            status: 'fail',
            output: 'package.json is not valid JSON',
            errors: 1,
          });
        }
      }
    }

    const totalErrors = phases.reduce((sum, p) => sum + p.errors, 0);
    const hasFail = phases.some((p) => p.status === 'fail');

    return {
      ready: !hasFail,
      languages: Array.from(languages),
      phases,
      coveragePercent: null, // Can't measure without running tests
      lintErrors: stubCount,
      securityFindings: 0,
      summary: hasFail
        ? `${totalErrors} issues found across ${phases.length} checks`
        : `All ${phases.length} checks passed (${files.length} files, ${Array.from(languages).join('/')})`,
      durationMs: 0,
    };
  }

  private static fallbackReport(reason: string): ValidationReport {
    return {
      ready: false,
      languages: [],
      phases: [{ name: 'error', status: 'fail', output: reason, errors: 1 }],
      coveragePercent: null,
      lintErrors: 0,
      securityFindings: 0,
      summary: reason,
      durationMs: 0,
    };
  }

  /**
   * Format a validation report as markdown for display in the pipeline.
   */
  static formatReport(report: ValidationReport): string {
    const lines: string[] = [
      `## Validation Report\n`,
      `**Status:** ${report.ready ? '✅ READY' : '❌ NOT READY'}`,
      `**Languages:** ${report.languages.join(', ') || 'None detected'}`,
      `**Duration:** ${(report.durationMs / 1000).toFixed(1)}s\n`,
    ];

    for (const phase of report.phases) {
      const icon = phase.status === 'pass' ? '✅' : phase.status === 'warn' ? '⚠️' : phase.status === 'fail' ? '❌' : '⏭️';
      lines.push(`### ${icon} ${phase.name}`);
      lines.push(phase.output);
      if (phase.errors > 0) lines.push(`*${phase.errors} issue(s)*`);
      lines.push('');
    }

    if (report.coveragePercent !== null) {
      lines.push(`**Coverage:** ${report.coveragePercent}%`);
    }

    lines.push(`\n---\n**Summary:** ${report.summary}`);
    return lines.join('\n');
  }
}
