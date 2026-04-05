import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { type ProjectType, type VerifyResult } from '@/src/types/dag';

const BUILD_TIMEOUT = parseInt(process.env.FORGE_BUILD_TIMEOUT || '120000', 10);

export class BuildVerifier {
  private static hasAnyFile(outputDir: string, relativePaths: string[]): boolean {
    return relativePaths.some((relativePath) => existsSync(join(outputDir, relativePath)));
  }

  private static hasRootFileWithExtension(outputDir: string, extension: string): boolean {
    try {
      return readdirSync(outputDir).some((entry) => entry.endsWith(extension));
    } catch {
      return false;
    }
  }

  /**
   * Detect the project type from files present in the output directory.
   */
  static detectProjectType(outputDir: string): ProjectType {
    if (BuildVerifier.hasAnyFile(outputDir, ['project.godot'])) return 'godot';
    if (BuildVerifier.hasAnyFile(outputDir, ['Assets', 'ProjectSettings'])) return 'unity';
    if (
      BuildVerifier.hasRootFileWithExtension(outputDir, '.uproject') ||
      BuildVerifier.hasAnyFile(outputDir, ['Config', 'Content'])
    ) {
      return 'unreal';
    }
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

        case 'godot':
          installOutput = 'Godot project detected - no npm install required';
          if (!existsSync(join(outputDir, 'project.godot'))) {
            errors.push('Godot project is missing project.godot');
          }
          buildOutput = errors.length === 0
            ? 'Godot project structure verified. Runtime requires the Godot editor or export toolchain.'
            : 'Godot project structure check failed';
          warnings.push('Live runtime verification for Godot requires a worker image with the Godot toolchain installed');
          break;

        case 'unity':
          installOutput = 'Unity project detected - no npm install required';
          if (!BuildVerifier.hasAnyFile(outputDir, ['Assets', 'ProjectSettings'])) {
            errors.push('Unity project is missing Assets/ or ProjectSettings/');
          }
          buildOutput = errors.length === 0
            ? 'Unity project structure verified. Runtime requires a Unity-capable build agent.'
            : 'Unity project structure check failed';
          warnings.push('Live runtime verification for Unity requires a worker image with Unity installed');
          break;

        case 'unreal':
          installOutput = 'Unreal project detected - no npm install required';
          if (!BuildVerifier.hasAnyFile(outputDir, ['Config', 'Content'])) {
            errors.push('Unreal project is missing Config/ or Content/');
          }
          buildOutput = errors.length === 0
            ? 'Unreal project structure verified. Runtime requires an Unreal-capable build agent.'
            : 'Unreal project structure check failed';
          warnings.push('Live runtime verification for Unreal requires a worker image with Unreal Engine installed');
          break;

        case 'unknown':
          warnings.push('Could not detect project type - skipping build verification');
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
    }

    const durationMs = Date.now() - start;
    const success = errors.length === 0;

    console.log(
      `[BuildVerifier] ${success ? 'PASS' : 'FAIL'} - ${projectType} project in ${durationMs}ms` +
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
      const execError = err as { stdout?: string; stderr?: string };
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
    try {
      const pkg = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf-8'));

      if (pkg.scripts?.build) {
        return BuildVerifier.runCommand('npm run build', outputDir);
      }

      if (existsSync(join(outputDir, 'tsconfig.json'))) {
        return BuildVerifier.runCommand('npx tsc --noEmit', outputDir);
      }

      return 'No build script or tsconfig found - skipping build step';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Build verification failed: ${message}`);
    }
  }
}
