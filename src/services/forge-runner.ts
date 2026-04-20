import { ScaffoldEngine } from './scaffold-engine';
import { DependencyPinner } from './dependency-pinner';
import { GitTracker } from './git-tracker';
import { prisma } from '../lib/prisma';
import fs from 'fs/promises';
import path from 'path';

export class ForgeRunner {
  static async execute(
    taskName: string,
    targetDir: string,
    agentName: string,
    runAgentLoop: () => Promise<{ success: boolean; iterations: number }>
  ) {
    console.log(`\n[ForgeRunner] Ì∫Ä Booting execution for: ${taskName}`);
    
    // 1. Time-Travel Start: Initialize Git
    GitTracker.init(targetDir);

    // 2. Inject Scaffold & Commit
    await ScaffoldEngine.injectReactViteScaffold(targetDir);
    GitTracker.commit(targetDir, "chore(forge): inject golden React/Vite scaffold");

    const startTime = Date.now();
    let result = { success: false, iterations: 1 };

    try {
      // 3. Run AI Loop
      result = await runAgentLoop();
    } catch (error) {
      console.error(`[ForgeRunner] ‚ùå Agent loop failed:`, error);
    }

    // 4. Pin Dependencies & Commit
    const pkgPath = path.join(targetDir, 'package.json');
    try {
      const rawPkg = await fs.readFile(pkgPath, 'utf8');
      const safePkg = DependencyPinner.pin(rawPkg);
      await fs.writeFile(pkgPath, safePkg, 'utf8');
      GitTracker.commit(targetDir, "chore(forge): pin dependencies to known-good versions");
    } catch (e) {}

    // 5. Finalize Telemetry
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
