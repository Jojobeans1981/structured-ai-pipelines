import { prisma } from '@/src/lib/prisma';

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', css: 'css', html: 'html', json: 'json', md: 'markdown',
  sql: 'sql', prisma: 'prisma', yaml: 'yaml', yml: 'yaml', sh: 'bash',
  go: 'go', rs: 'rust', java: 'java', rb: 'ruby', php: 'php',
  toml: 'toml', env: 'bash', mjs: 'javascript', cjs: 'javascript',
};

function inferLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return LANG_MAP[ext] || 'plaintext';
}

interface ExtractedFile {
  filePath: string;
  content: string;
  language: string;
}

/**
 * Extract file path from a heading or text line above a code block.
 * Handles patterns like:
 *   ### 1. Create Vite Configuration (vite.config.ts)
 *   ### `src/components/Board.tsx`
 *   **File: src/index.ts**
 *   Create `src/main.tsx`:
 *   #### src/utils/helpers.ts
 */
function extractFilePathFromContext(line: string): string | null {
  // Pattern: heading with (filename.ext) in parentheses
  const parenMatch = line.match(/\(([^)]+\.\w+)\)\s*$/);
  if (parenMatch && parenMatch[1].match(/\.\w{1,10}$/)) {
    return parenMatch[1].trim();
  }

  // Pattern: heading with `filename` in backticks
  const backtickMatch = line.match(/`([^`]+\.\w+)`/);
  if (backtickMatch && backtickMatch[1].match(/\.\w{1,10}$/)) {
    return backtickMatch[1].trim();
  }

  // Pattern: **File: path** or **file:** path
  const fileLabel = line.match(/\*?\*?(?:File|file|FILE):\s*(.+?\.\w+)/);
  if (fileLabel) {
    return fileLabel[1].replace(/\*+/g, '').trim();
  }

  // Pattern: heading that IS a file path (### src/utils/helpers.ts)
  const headingPath = line.match(/^#{1,6}\s+(\S+\.\w+)\s*$/);
  if (headingPath) {
    return headingPath[1].trim();
  }

  // Pattern: "Create path/file.ext:" or "Update path/file.ext"
  const actionMatch = line.match(/(?:Create|Update|Edit|Modify|Add|Write)\s+`?([^\s`]+\.\w+)`?/i);
  if (actionMatch) {
    return actionMatch[1].trim();
  }

  return null;
}

export function extractFilesFromArtifact(artifactContent: string): ExtractedFile[] {
  const files: ExtractedFile[] = [];
  const lines = artifactContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    // Pattern 1: ```language:path/to/file
    const infoStringMatch = lines[i].match(/^```(\w+):(.+)$/);
    if (infoStringMatch) {
      const language = infoStringMatch[1];
      const filePath = infoStringMatch[2].trim();
      i++;
      const contentLines: string[] = [];
      while (i < lines.length && lines[i] !== '```') {
        contentLines.push(lines[i]);
        i++;
      }
      files.push({ filePath, content: contentLines.join('\n'), language });
      continue;
    }

    // Pattern 2: Code block with first-line comment // file: or # file:
    const codeBlockMatch = lines[i].match(/^```(\w+)?$/);
    if (codeBlockMatch && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const fileCommentMatch = nextLine.match(/^(?:\/\/|#)\s*file:\s*(.+)$/);
      if (fileCommentMatch) {
        const filePath = fileCommentMatch[1].trim();
        i += 2; // skip ``` and comment line
        const contentLines: string[] = [];
        while (i < lines.length && lines[i] !== '```') {
          contentLines.push(lines[i]);
          i++;
        }
        files.push({ filePath, content: contentLines.join('\n'), language: inferLanguage(filePath) });
        continue;
      }
    }

    // Pattern 3: Previous line(s) contain a file path (backticks, parens, headings, etc.)
    if (codeBlockMatch && i > 0) {
      // Search up to 3 lines back for a file path reference
      let filePath: string | null = null;
      for (let lookback = 1; lookback <= Math.min(3, i); lookback++) {
        const prevLine = lines[i - lookback].trim();
        if (!prevLine) continue; // skip blank lines
        filePath = extractFilePathFromContext(prevLine);
        if (filePath) break;
      }

      if (filePath) {
        const language = codeBlockMatch[1] || inferLanguage(filePath);
        i++;
        const contentLines: string[] = [];
        while (i < lines.length && lines[i] !== '```') {
          contentLines.push(lines[i]);
          i++;
        }
        files.push({
          filePath,
          content: contentLines.join('\n'),
          language: typeof language === 'string' ? language : inferLanguage(filePath),
        });
        continue;
      }
    }
  }

  // Deduplicate: if same file path appears multiple times, keep the last occurrence
  const deduped = new Map<string, ExtractedFile>();
  for (const file of files) {
    deduped.set(file.filePath, file);
  }

  return Array.from(deduped.values());
}

export class FileManager {
  static async extractAndSaveFiles(
    stageId: string,
    runId: string,
    projectId: string,
    artifactContent: string
  ): Promise<number> {
    const extracted = extractFilesFromArtifact(artifactContent);

    for (const file of extracted) {
      await prisma.projectFile.upsert({
        where: {
          projectId_filePath: { projectId, filePath: file.filePath },
        },
        create: {
          projectId,
          runId,
          filePath: file.filePath,
          content: file.content,
          language: file.language,
          createdByStage: stageId,
        },
        update: {
          content: file.content,
          language: file.language,
          runId,
          createdByStage: stageId,
        },
      });
    }

    console.log(`[FileManager] Extracted ${extracted.length} files from stage ${stageId}`);
    return extracted.length;
  }

  static async getProjectFiles(projectId: string) {
    return prisma.projectFile.findMany({
      where: { projectId },
      select: { id: true, filePath: true, language: true, createdAt: true, updatedAt: true },
      orderBy: { filePath: 'asc' },
    });
  }

  static async getFileContent(fileId: string) {
    return prisma.projectFile.findUnique({
      where: { id: fileId },
    });
  }

  static async getProjectFilesWithContent(projectId: string) {
    return prisma.projectFile.findMany({
      where: { projectId },
      orderBy: { filePath: 'asc' },
    });
  }
}
