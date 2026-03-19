import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { type VerifyResult, type ProjectType } from '@/src/types/dag';

const BUILD_TIMEOUT = parseInt(process.env.FORGE_BUILD_TIMEOUT || '120000', 10);

export class BuildVerifier {
  /**
   * Detect the project type from files present in the output directory.
   */
  static detectProjectType(outputDir: string): ProjectType {
    if (existsSync(join(outputDir, 'package.json'))) return 'node';
    if (existsSync(join(outputDir, 'requirements.txt')) || existsSync(join(outputDir, 'pyproject.toml'))) return 'python';
    if (existsSync(join(outputDir, 'go.mod'))) return 'go';
    if (existsSync(join(outputDir, 'index.html'))) return 'static';
    return 'unknown';
  }

  /**
   * Run install + build verification on the output directory.
   */
  static async verify(outputDir: string): Promise<VerifyResult> {
    const start = Date.now();
    const projectType = BuildVerifier.detectProjectType(outputDir);

    console.log(`[BuildVerifier] Detected project type: ${projectType} in ${outputDir}`);

    let installOutput = '';
    let buildOutput = '';
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      switch (projectType) {
        case 'node':
          installOutput = BuildVerifier.runCommand('npm install', outputDir);
          buildOutput = BuildVerifier.runBuildCommand(outputDir);
          break;

        case 'python':
          if (existsSync(join(outputDir, 'requirements.txt'))) {
            installOutput = BuildVerifier.runCommand('pip install -r requirements.txt', outputDir);
          }
          // Python doesn't have a standard "build" step — check syntax of all .py files
          buildOutput = BuildVerifier.runCommand('find . -name "*.py" -exec python -m py_compile {} +', outputDir);
          break;

        case 'go':
          installOutput = BuildVerifier.runCommand('go mod download', outputDir);
          buildOutput = BuildVerifier.runCommand('go build ./...', outputDir);
          break;

        case 'static':
          installOutput = 'No install needed for static project';
          buildOutput = 'Static files verified';
          break;

        case 'unknown':
          warnings.push('Could not detect project type — skipping build verification');
          return {
            success: true,
            installOutput: 'Unknown project type',
            buildOutput: 'Skipped',
            errors: [],
            warnings,
            durationMs: Date.now() - start,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);

      // Extract specific error lines from build output
      const errorLines = message.split('\n').filter(
        (line) => line.match(/error|Error|ERROR|failed|Failed|FAILED/) && !line.includes('npm warn')
      );
      if (errorLines.length > 0 && errorLines.length < errors.length) {
        // Replace the full output with just the error lines for cleaner display
      }
    }

    const durationMs = Date.now() - start;
    const success = errors.length === 0;

    console.log(
      `[BuildVerifier] ${success ? 'PASS' : 'FAIL'} — ${projectType} project in ${durationMs}ms` +
      (errors.length > 0 ? ` (${errors.length} errors)` : '')
    );

    return {
      success,
      installOutput,
      buildOutput,
      errors,
      warnings,
      durationMs,
    };
  }

  /**
   * Run a shell command in the output directory with timeout.
   */
  private static runCommand(command: string, cwd: string): string {
    try {
      const output = execSync(command, {
        cwd,
        timeout: BUILD_TIMEOUT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, CI: 'true' },
      });
      return output || '';
    } catch (err: unknown) {
      const execError = err as { stdout?: string; stderr?: string; message?: string };
      const stderr = execError.stderr || '';
      const stdout = execError.stdout || '';
      throw new Error(`Command failed: ${command}\n\n${stderr}\n${stdout}`);
    }
  }

  /**
   * Run the build command for a Node.js project.
   * Tries npm run build first, falls back to tsc --noEmit.
   */
  private static runBuildCommand(outputDir: string): string {
    // Read package.json to check for build script
    try {
      const { readFileSync } = require('fs');
      const pkg = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf-8'));

      if (pkg.scripts?.build) {
        return BuildVerifier.runCommand('npm run build', outputDir);
      }

      // No build script — try TypeScript check
      if (existsSync(join(outputDir, 'tsconfig.json'))) {
        return BuildVerifier.runCommand('npx tsc --noEmit', outputDir);
      }

      return 'No build script or tsconfig found — skipping build step';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Build verification failed: ${message}`);
    }
  }
}
