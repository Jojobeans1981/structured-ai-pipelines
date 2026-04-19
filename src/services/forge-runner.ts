import { ScaffoldEngine } from './scaffold-engine';
import { DependencyPinner } from './dependency-pinner';
import { prisma } from '../lib/prisma';
import fs from 'fs/promises';
import path from 'path';

export class ForgeRunner {
  /**
   * Encapsulates your existing LLM loop with Scaffold injection, 
   * Dependency Pinning, and Database Telemetry.
   */
  static async execute(
    taskName: string,
    targetDir: string,
    agentName: string,
    runAgentLoop: () => Promise<{ success: boolean; iterations: number }>
  ) {
    console.log(`\n[ForgeRunner] Ì∫Ä Booting execution for: ${taskName}`);
    
    // 1. PRE-EXECUTION: Inject the Golden Scaffold
    await ScaffoldEngine.injectReactViteScaffold(targetDir);

    const startTime = Date.now();
    let result = { success: false, iterations: 1 };

    try {
      // 2. EXECUTION: Run your existing AI loop
      result = await runAgentLoop();
    } catch (error) {
      console.error(`[ForgeRunner] ‚ùå Agent loop failed:`, error);
    }

    // 3. POST-EXECUTION: Force known-good dependency versions
    const pkgPath = path.join(targetDir, 'package.json');
    try {
      const rawPkg = await fs.readFile(pkgPath, 'utf8');
      const safePkg = DependencyPinner.pin(rawPkg);
      await fs.writeFile(pkgPath, safePkg, 'utf8');
    } catch (e) {
      // Gracefully ignore if the LLM didn't output a package.json
    }

    // 4. TELEMETRY: Record the convergence rate to Neon
    await prisma.pipelineRun.create({
      data: {
        taskName,
        targetAgent: agentName,
        iterations: result.iterations || 1,
        success: result.success,
        durationMs: Date.now() - startTime,
      }
    });

    console.log(`[ForgeRunner] Ì≥ä Telemetry saved. Success: ${result.success} | Iterations: ${result.iterations}\n`);
    return result;
  }
}
