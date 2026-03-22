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
 * Very forgiving — handles many Llama/GPT output formats.
 */
function extractFilePathFromContext(line: string): string | null {
  // Strip markdown formatting for easier matching
  const clean = line.replace(/\*\*/g, '').replace(/^#+\s*/, '').replace(/^\d+\.\s*/, '').trim();

  // Pattern: (filename.ext) in parentheses
  const parenMatch = clean.match(/\(([^)]*\/[^)]+\.\w+)\)/) || clean.match(/\(([^)]+\.\w+)\)\s*$/);
  if (parenMatch && parenMatch[1].match(/\.\w{1,10}$/)) {
    return parenMatch[1].trim();
  }

  // Pattern: `filename` in backticks — most common Llama format
  const backtickMatch = clean.match(/`([^`]+\.\w{1,10})`/);
  if (backtickMatch) {
    return backtickMatch[1].trim();
  }

  // Pattern: **File: path** or **file:** path or File: path
  const fileLabel = clean.match(/(?:File|file|FILE|Path|path)[:\s]+([^\s,*]+\.\w{1,10})/);
  if (fileLabel) {
    return fileLabel[1].replace(/[*:`]/g, '').trim();
  }

  // Pattern: line IS a file path (with or without heading markers)
  const barePathMatch = clean.match(/^((?:[\w.@/-]+\/)?[\w.-]+\.\w{1,10})\s*[:)]?\s*$/);
  if (barePathMatch) {
    return barePathMatch[1].trim();
  }

  // Pattern: "Create/Update/Here is path/file.ext" or similar action verbs
  const actionMatch = clean.match(/(?:Create|Update|Edit|Modify|Add|Write|Here\s+is|Open|Save|Generating)\s+(?:the\s+)?(?:file\s+)?`?([^\s`"',:]+\.\w{1,10})`?/i);
  if (actionMatch) {
    return actionMatch[1].trim();
  }

  // Pattern: heading with filename anywhere in it (loose match)
  const anyFileMatch = clean.match(/((?:src|lib|app|pages|components|styles|public|config|utils|hooks|stores|types|services)\/[\w/.-]+\.\w{1,10})/);
  if (anyFileMatch) {
    return anyFileMatch[1].trim();
  }

  // Pattern: just a filename with common web extensions anywhere in the line
  const webFileMatch = clean.match(/([\w.-]+\.(?:tsx?|jsx?|css|scss|html|json|svg|md|prisma|env|toml|yaml|yml))\b/);
  if (webFileMatch && !clean.match(/^(?:npm|yarn|pnpm|node|import|from|export|const|let|var|function|class|interface|type)\b/)) {
    return webFileMatch[1].trim();
  }

  return null;
}

/**
 * Infer a file path from the code content itself when no filename is found
 * in the surrounding context. Uses heuristics based on imports/exports.
 */
function inferFilePathFromContent(content: string, language: string): string | null {
  // React component — look for export default function/const ComponentName
  const componentMatch = content.match(/export\s+(?:default\s+)?(?:function|const)\s+(\w+)/);
  if (componentMatch && language === 'tsx') {
    return `src/components/${componentMatch[1]}.tsx`;
  }
  if (componentMatch && language === 'jsx') {
    return `src/components/${componentMatch[1]}.jsx`;
  }

  // Vite config
  if (content.includes('defineConfig') && content.includes('vite')) {
    return 'vite.config.ts';
  }

  // Tailwind config
  if (content.includes('tailwind') && content.includes('content:')) {
    return 'tailwind.config.js';
  }

  // PostCSS config
  if (content.includes('tailwindcss') && content.includes('autoprefixer')) {
    return 'postcss.config.js';
  }

  // Main entry point
  if (content.includes('ReactDOM') || content.includes('createRoot')) {
    return language === 'tsx' ? 'src/main.tsx' : 'src/main.jsx';
  }

  // App component
  if (content.includes('function App') || content.includes('const App')) {
    return language === 'tsx' ? 'src/App.tsx' : 'src/App.jsx';
  }

  // index.html
  if (content.includes('<!DOCTYPE') || content.includes('<html')) {
    return 'index.html';
  }

  // CSS with @tailwind directives
  if (content.includes('@tailwind')) {
    return 'src/index.css';
  }

  // tsconfig
  if (content.includes('"compilerOptions"') && content.includes('"target"')) {
    return 'tsconfig.json';
  }

  // package.json
  if (content.includes('"dependencies"') && content.includes('"name"')) {
    return 'package.json';
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

    // Pattern 2: Code block with first-line comment containing a file path
    // Matches: // file: src/App.tsx  OR  // src/App.tsx  OR  # src/app.py  OR  /* src/styles.css */
    const codeBlockMatch = lines[i].match(/^```(\w+)?$/);
    if (codeBlockMatch && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      // Try explicit "file:" prefix first
      const fileCommentMatch = nextLine.match(/^(?:\/\/|#|\/\*)\s*(?:file:\s*)?([^\s*]+\.\w{1,10})\s*\*?\/?$/);
      if (fileCommentMatch && fileCommentMatch[1].match(/\.\w{1,10}$/)) {
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
      // Search up to 5 lines back for a file path reference (Llama can be verbose)
      let filePath: string | null = null;
      for (let lookback = 1; lookback <= Math.min(5, i); lookback++) {
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

    // Pattern 4: No filename found anywhere — infer from code content
    if (codeBlockMatch) {
      const lang = codeBlockMatch[1] || '';
      const startIdx = i + 1;
      i++;
      const contentLines: string[] = [];
      while (i < lines.length && lines[i] !== '```') {
        contentLines.push(lines[i]);
        i++;
      }
      const content = contentLines.join('\n');

      // Only infer for substantial code blocks (>5 lines)
      if (contentLines.length > 5) {
        const inferredPath = inferFilePathFromContent(content, lang);
        if (inferredPath) {
          files.push({
            filePath: inferredPath,
            content,
            language: lang || inferLanguage(inferredPath),
          });
          continue;
        }
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
