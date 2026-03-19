import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const DEFAULT_OUTPUT_DIR = process.env.FORGE_OUTPUT_DIR || join(homedir(), 'forge-output');

export class DiskWriter {
  /**
   * Create the output directory for a project run.
   * Returns the absolute path to the output directory.
   */
  static initOutputDir(projectName: string, runId: string): string {
    const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    const shortId = runId.slice(-8);
    const outputDir = join(DEFAULT_OUTPUT_DIR, `${safeName}-${shortId}`);

    mkdirSync(outputDir, { recursive: true });
    console.log(`[DiskWriter] Initialized output dir: ${outputDir}`);
    return outputDir;
  }

  /**
   * Write a single file to disk, creating parent directories as needed.
   */
  static writeFile(outputDir: string, filePath: string, content: string): void {
    // Sanitize: prevent path traversal
    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.includes('..')) {
      console.warn(`[DiskWriter] Skipping file with path traversal: ${filePath}`);
      return;
    }

    const fullPath = join(outputDir, normalized);
    const dir = dirname(fullPath);

    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  }

  /**
   * Write multiple files extracted from an artifact to disk.
   * Uses the same extraction logic as FileManager.
   */
  static writeArtifactFiles(
    outputDir: string,
    files: Array<{ filePath: string; content: string }>
  ): number {
    let written = 0;
    for (const file of files) {
      try {
        DiskWriter.writeFile(outputDir, file.filePath, file.content);
        written++;
      } catch (err) {
        console.error(`[DiskWriter] Failed to write ${file.filePath}:`, err);
      }
    }

    console.log(`[DiskWriter] Wrote ${written} files to ${outputDir}`);
    return written;
  }

  /**
   * List all files in the output directory recursively.
   * Returns relative paths.
   */
  static listFiles(outputDir: string): string[] {
    if (!existsSync(outputDir)) return [];

    const files: string[] = [];

    function walk(dir: string, prefix: string) {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        // Skip node_modules, .git, dist
        if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;

        const fullPath = join(dir, entry);
        const relativePath = prefix ? `${prefix}/${entry}` : entry;
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          walk(fullPath, relativePath);
        } else {
          files.push(relativePath);
        }
      }
    }

    walk(outputDir, '');
    return files.sort();
  }

  /**
   * Read a file from the output directory.
   */
  static readFile(outputDir: string, filePath: string): string | null {
    const fullPath = join(outputDir, filePath);
    if (!existsSync(fullPath)) return null;
    const { readFileSync } = require('fs');
    return readFileSync(fullPath, 'utf-8');
  }

  /**
   * Get the default output base directory.
   */
  static getBaseDir(): string {
    return DEFAULT_OUTPUT_DIR;
  }
}
