import { execFileSync, execSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

interface SandboxResult {
  success: boolean;
  phase: string; // which phase failed: 'setup' | 'install' | 'build' | 'start' | 'health'
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  containerId: string | null;
  healthCheck?: { reachable: boolean; statusCode?: number };
}

interface SandboxFile {
  filePath: string;
  content: string;
}

const DOCKER_IMAGE = 'node:20-slim';
const CONTAINER_PREFIX = 'forge-sandbox-';
const INSTALL_TIMEOUT = 120; // seconds
const BUILD_TIMEOUT = 120;
const START_TIMEOUT = 15;
const HEALTH_TIMEOUT = 10;

interface DockerAvailability {
  available: boolean;
  reason: string | null;
}

function normalizeDockerError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('permission denied') && lower.includes('docker api')) {
    return 'Docker is installed, but this app process does not have permission to access the Docker daemon.';
  }

  if (lower.includes('the system cannot find the file specified') || lower.includes('is not recognized')) {
    return 'Docker CLI is not installed or is not on PATH for this server process.';
  }

  if (lower.includes('server version')) {
    return 'Docker CLI responded, but the Docker daemon did not return a server version.';
  }

  return `Docker check failed: ${message}`;
}

export class DockerSandbox {
  private static availabilityCache: { expiresAt: number; value: DockerAvailability } | null = null;

  private static runDockerCommand(args: string[], timeoutMs: number): string {
    return execFileSync('docker', args, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: timeoutMs,
    }).trim();
  }

  static getAvailability(): DockerAvailability {
    const cached = DockerSandbox.availabilityCache;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    let value: DockerAvailability;
    try {
      const serverVersion = DockerSandbox.runDockerCommand(['version', '--format', '{{.Server.Version}}'], 15000);
      value = serverVersion
        ? { available: true, reason: null }
        : { available: false, reason: 'Docker CLI is installed, but the Docker daemon did not report a server version.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      value = {
        available: false,
        reason: normalizeDockerError(message),
      };
    }

    DockerSandbox.availabilityCache = {
      expiresAt: Date.now() + 10_000,
      value,
    };

    return value;
  }

  /**
   * Check if Docker is available on this machine.
   */
  static isAvailable(): boolean {
    return DockerSandbox.getAvailability().available;
  }

  /**
   * Run a full build verification in a Docker container.
   * 1. Create temp dir with project files
   * 2. Start container mounting the dir
   * 3. Run npm install
   * 4. Run npm run build (if script exists)
   * 5. Run npm run dev / npm start briefly to check it boots
   * 6. Cleanup
   */
  static async verify(files: SandboxFile[]): Promise<SandboxResult> {
    const startTime = Date.now();
    const sandboxId = randomBytes(4).toString('hex');
    const containerName = `${CONTAINER_PREFIX}${sandboxId}`;
    const projectDir = join(tmpdir(), `forge-sandbox-${sandboxId}`);
    let containerId: string | null = null;

    try {
      // 1. Write files to temp directory
      mkdirSync(projectDir, { recursive: true });
      for (const file of files) {
        const fullPath = join(projectDir, file.filePath);
        const dir = dirname(fullPath);
        if (dir && dir !== projectDir) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(fullPath, file.content, 'utf-8');
      }

      // Check if package.json exists
      if (!existsSync(join(projectDir, 'package.json'))) {
        return {
          success: false,
          phase: 'setup',
          stdout: '',
          stderr: 'No package.json found in generated files',
          exitCode: 1,
          durationMs: Date.now() - startTime,
          containerId: null,
        };
      }

      console.log(`[DockerSandbox] Created ${files.length} files in ${projectDir}`);

      // 2. Start container
      try {
        containerId = execSync(
          `docker run -d --name ${containerName} ` +
          `-v "${projectDir}:/app" ` +
          `-w /app ` +
          `-p 0:3000 -p 0:5173 ` +
          `${DOCKER_IMAGE} sleep 600`,
          { encoding: 'utf-8', timeout: 30000 }
        ).trim();
        console.log(`[DockerSandbox] Container started: ${containerId.substring(0, 12)}`);
      } catch (err) {
        return {
          success: false,
          phase: 'setup',
          stdout: '',
          stderr: `Failed to start Docker container: ${err instanceof Error ? err.message : 'unknown'}`,
          exitCode: 1,
          durationMs: Date.now() - startTime,
          containerId: null,
        };
      }

      // 3. npm install
      const installResult = DockerSandbox.execInContainer(containerName, 'npm install --no-audit --no-fund 2>&1', INSTALL_TIMEOUT);
      if (installResult.exitCode !== 0) {
        return {
          ...installResult,
          phase: 'install',
          durationMs: Date.now() - startTime,
          containerId,
        };
      }
      console.log(`[DockerSandbox] npm install succeeded`);

      // 4. npm run build (if build script exists)
      const hasBuildScript = DockerSandbox.execInContainer(
        containerName,
        'node -e "const p=require(\'./package.json\'); process.exit(p.scripts && p.scripts.build ? 0 : 1)"',
        5
      );

      let buildResult: { success: boolean; stdout: string; stderr: string; exitCode: number } = {
        success: true, stdout: 'No build script — skipped', stderr: '', exitCode: 0,
      };

      if (hasBuildScript.exitCode === 0) {
        buildResult = DockerSandbox.execInContainer(containerName, 'npm run build 2>&1', BUILD_TIMEOUT);
        if (buildResult.exitCode !== 0) {
          return {
            ...buildResult,
            phase: 'build',
            durationMs: Date.now() - startTime,
            containerId,
          };
        }
        console.log(`[DockerSandbox] npm run build succeeded`);
      }

      // 5. Try to start the app briefly
      const hasDevScript = DockerSandbox.execInContainer(
        containerName,
        'node -e "const p=require(\'./package.json\'); process.exit(p.scripts && (p.scripts.dev || p.scripts.start) ? 0 : 1)"',
        5
      );

      let healthCheck = { reachable: false, statusCode: undefined as number | undefined };

      if (hasDevScript.exitCode === 0) {
        // Start in background, wait a few seconds, check if it's listening
        const startCmd = 'node -e "const p=require(\'./package.json\'); process.exit(p.scripts.dev ? 0 : 1)"';
        const hasDev = DockerSandbox.execInContainer(containerName, startCmd, 5).exitCode === 0;
        const script = hasDev ? 'npm run dev' : 'npm start';

        // Start in background
        DockerSandbox.execInContainer(containerName, `${script} &`, 3);

        // Wait for it to boot
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Check if port 3000 or 5173 is listening
        const portCheck = DockerSandbox.execInContainer(
          containerName,
          'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null || echo "000"',
          HEALTH_TIMEOUT
        );

        const statusCode = parseInt(portCheck.stdout.trim(), 10);
        healthCheck = {
          reachable: statusCode >= 200 && statusCode < 500,
          statusCode: statusCode || undefined,
        };

        console.log(`[DockerSandbox] Health check: ${healthCheck.reachable ? 'REACHABLE' : 'NOT REACHABLE'} (${statusCode})`);
      }

      return {
        success: true,
        phase: 'health',
        stdout: buildResult.stdout,
        stderr: '',
        exitCode: 0,
        durationMs: Date.now() - startTime,
        containerId,
        healthCheck,
      };

    } finally {
      // Cleanup
      try {
        execSync(`docker rm -f ${containerName} 2>/dev/null`, { stdio: 'pipe', timeout: 10000 });
      } catch { /* container may not exist */ }
      try {
        rmSync(projectDir, { recursive: true, force: true });
      } catch { /* dir may not exist */ }
    }
  }

  /**
   * Launch a live preview container that stays running for a specified duration.
   * Returns the mapped host port so the user can access the app.
   * The container auto-stops after `ttlSeconds` (default 30 minutes).
   */
  static async launchPreview(
    files: SandboxFile[],
    ttlSeconds: number = 1800
  ): Promise<{
    success: boolean;
    url: string | null;
    containerId: string | null;
    port: number | null;
    expiresAt: string | null;
    error: string | null;
  }> {
    const availability = DockerSandbox.getAvailability();
    if (!availability.available) {
      return {
        success: false,
        url: null,
        containerId: null,
        port: null,
        expiresAt: null,
        error: availability.reason || 'Docker not available',
      };
    }

    const sandboxId = randomBytes(4).toString('hex');
    const containerName = `forge-preview-${sandboxId}`;
    const projectDir = join(tmpdir(), `forge-preview-${sandboxId}`);

    try {
      // Write files to temp dir
      mkdirSync(projectDir, { recursive: true });
      for (const file of files) {
        const fullPath = join(projectDir, file.filePath);
        const dir = dirname(fullPath);
        if (dir && dir !== projectDir) mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, file.content, 'utf-8');
      }

      if (!existsSync(join(projectDir, 'package.json'))) {
        return { success: false, url: null, containerId: null, port: null, expiresAt: null, error: 'No package.json — cannot preview' };
      }

      // Start container with port mapping (random host port)
      const containerId = execSync(
        `docker run -d --name ${containerName} ` +
        `-v "${projectDir}:/app" -w /app ` +
        `-p 0:3000 -p 0:5173 -p 0:4173 -p 0:8080 ` +
        `${DOCKER_IMAGE} sh -c "npm install --no-audit --no-fund && (npm run dev || npm start)" 2>&1`,
        { encoding: 'utf-8', timeout: 30000 }
      ).trim();

      // Wait for app to boot
      await new Promise((resolve) => setTimeout(resolve, 8000));

      // Find the mapped host port
      let hostPort: number | null = null;
      try {
        const portOutput = execSync(
          `docker port ${containerName} 2>/dev/null`,
          { encoding: 'utf-8', timeout: 5000 }
        );
        // Parse output like "3000/tcp -> 0.0.0.0:49152" or "3000/tcp -> [::]:49152"
        const portMatch = portOutput.match(/:(\d+)\s*$/m);
        if (portMatch) hostPort = parseInt(portMatch[1], 10);
      } catch { /* ignore */ }

      // Schedule auto-cleanup inside the running Node process instead of using a Unix shell.
      setTimeout(() => {
        try {
          execSync(`docker rm -f ${containerName} 2>/dev/null`, { stdio: 'pipe', timeout: 10000 });
        } catch { /* container may already be gone */ }
        try {
          rmSync(projectDir, { recursive: true, force: true });
        } catch { /* dir may already be gone */ }
      }, ttlSeconds * 1000);

      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      const url = hostPort ? `http://localhost:${hostPort}` : null;

      console.log(`[DockerSandbox] Preview launched: ${url} (expires: ${expiresAt})`);

      return {
        success: !!url,
        url,
        containerId,
        port: hostPort,
        expiresAt,
        error: url ? null : 'Container started but no port mapped',
      };
    } catch (err) {
      // Cleanup on error
      try { execSync(`docker rm -f ${containerName} 2>/dev/null`, { stdio: 'pipe' }); } catch { /* */ }
      try { rmSync(projectDir, { recursive: true, force: true }); } catch { /* */ }
      return {
        success: false,
        url: null,
        containerId: null,
        port: null,
        expiresAt: null,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Stop a running preview container.
   */
  static stopPreview(containerId: string): void {
    try {
      execSync(`docker rm -f ${containerId} 2>/dev/null`, { stdio: 'pipe', timeout: 10000 });
      console.log(`[DockerSandbox] Preview stopped: ${containerId}`);
    } catch { /* container may already be gone */ }
  }

  /**
   * Execute a command inside a running container.
   */
  private static execInContainer(
    containerName: string,
    command: string,
    timeoutSeconds: number
  ): { success: boolean; stdout: string; stderr: string; exitCode: number } {
    try {
      const stdout = execSync(
        `docker exec ${containerName} sh -c "${command.replace(/"/g, '\\"')}"`,
        { encoding: 'utf-8', timeout: timeoutSeconds * 1000, maxBuffer: 10 * 1024 * 1024 }
      );
      return { success: true, stdout, stderr: '', exitCode: 0 };
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; status?: number };
      return {
        success: false,
        stdout: execErr.stdout || '',
        stderr: execErr.stderr || (err instanceof Error ? err.message : 'unknown error'),
        exitCode: execErr.status ?? 1,
      };
    }
  }
}
