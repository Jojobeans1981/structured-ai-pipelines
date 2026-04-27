import { ScaffoldEngine } from './scaffold-engine';
import { DependencyPinner } from './dependency-pinner';
import { GitTracker } from './git-tracker';
import fs from 'fs/promises';
import path from 'path';

export class ForgeRunner {
  static async execute(
    taskName: string,
    targetDir: string,
    agentName: string,
    runAgentLoop: () => Promise<{ success: boolean; iterations: number }>,
  ) {
    console.log(`\n[ForgeRunner] Booting execution for: ${taskName}`);

    GitTracker.init(targetDir);

    await ScaffoldEngine.injectReactViteScaffold(targetDir);
    GitTracker.commit(targetDir, 'chore(forge): inject golden React/Vite scaffold');

    let result = { success: false, iterations: 1 };

    try {
      result = await runAgentLoop();
    } catch (error) {
      console.error('[ForgeRunner] Agent loop failed:', error);
    }

    const pkgPath = path.join(targetDir, 'package.json');
    try {
      const rawPkg = await fs.readFile(pkgPath, 'utf8');
      const safePkg = DependencyPinner.pin(rawPkg);
      await fs.writeFile(pkgPath, safePkg, 'utf8');
      GitTracker.commit(targetDir, 'chore(forge): pin dependencies to known-good versions');
    } catch {
      // package.json may not exist for non-node outputs.
    }

    console.log(`[ForgeRunner] Completed ${taskName} with ${agentName}. Success: ${result.success} | Iterations: ${result.iterations}\n`);
    return result;
  }
}
