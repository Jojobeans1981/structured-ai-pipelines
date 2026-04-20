import { execSync } from 'child_process';

export class GitTracker {
  /**
   * Initializes a Git repository and sets the AI as the author.
   */
  static init(targetDir: string) {
    try {
      execSync('git init', { cwd: targetDir, stdio: 'ignore' });
      execSync('git config user.name "Forge AI"', { cwd: targetDir, stdio: 'ignore' });
      execSync('git config user.email "forge@ai.local"', { cwd: targetDir, stdio: 'ignore' });
      console.log(`[GitTracker] â±ï¸ Initialized Time-Travel Git Repo`);
    } catch (e) {
      console.warn('[GitTracker] Failed to init git repo. Is git installed?');
    }
  }

  /**
   * Commits current changes with a specific message detailing the AI's thought process.
   */
  static commit(targetDir: string, message: string) {
    try {
      execSync('git add .', { cwd: targetDir, stdio: 'ignore' });
      const status = execSync('git status --porcelain', { cwd: targetDir }).toString();
      
      // Only commit if there are actual changes
      if (status.trim().length > 0) {
        // Escape double quotes in the message
        const safeMessage = message.replace(/"/g, '\\"');
        execSync(`git commit -m "${safeMessage}"`, { cwd: targetDir, stdio: 'ignore' });
        console.log(`[GitTracker] í²¾ Committed: "${message}"`);
      }
    } catch (e) {
      console.warn(`[GitTracker] Failed to commit: ${message}`);
    }
  }
}
