import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import JSZip from 'jszip';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

interface Props {
  params: { id: string };
}

// Max upload size: 50MB
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

// Files/dirs to skip during import
const SKIP_PATTERNS = [
  'node_modules/',
  '.git/',
  '.next/',
  'dist/',
  'build/',
  '__pycache__/',
  '.venv/',
  'venv/',
  '.DS_Store',
  'Thumbs.db',
  '.env',
  '.env.local',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

// File extensions to import (skip binaries)
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi', '.go', '.rs', '.java', '.rb', '.php', '.cs', '.swift', '.kt',
  '.css', '.scss', '.less', '.sass',
  '.html', '.htm', '.svg',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.md', '.txt', '.csv',
  '.sql', '.prisma', '.graphql', '.gql',
  '.sh', '.bash', '.zsh', '.fish',
  '.dockerfile', '.dockerignore', '.gitignore', '.editorconfig', '.eslintrc',
  '.env.example', '.prettierrc',
]);

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', css: 'css', html: 'html', json: 'json', md: 'markdown',
  sql: 'sql', prisma: 'prisma', yaml: 'yaml', yml: 'yaml', sh: 'bash',
  go: 'go', rs: 'rust', java: 'java', rb: 'ruby', php: 'php',
  toml: 'toml', mjs: 'javascript', cjs: 'javascript', svg: 'html',
  scss: 'css', less: 'css', graphql: 'graphql', gql: 'graphql',
};

function inferLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return LANG_MAP[ext] || 'plaintext';
}

function shouldSkip(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return SKIP_PATTERNS.some((pattern) => {
    if (pattern.endsWith('/')) {
      return normalized.includes(pattern) || normalized.startsWith(pattern);
    }
    const filename = normalized.split('/').pop() || '';
    return filename === pattern;
  });
}

function isTextFile(filePath: string): boolean {
  // No extension = might be Dockerfile, Makefile, etc.
  const lastSegment = filePath.split('/').pop() || '';
  if (!lastSegment.includes('.')) {
    const knownNames = ['Dockerfile', 'Makefile', 'Procfile', 'Gemfile', 'Rakefile'];
    return knownNames.includes(lastSegment);
  }
  const ext = '.' + (filePath.split('.').pop()?.toLowerCase() || '');
  return TEXT_EXTENSIONS.has(ext);
}

/**
 * POST /api/projects/[id]/upload — Upload a ZIP of project files.
 * Extracts text files and stores them as ProjectFile records.
 */
export async function POST(request: Request, { params }: Props) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const contentType = request.headers.get('content-type') || '';

  let files: Array<{ filePath: string; content: string; language: string }> = [];

  if (contentType.includes('multipart/form-data')) {
    // ZIP file upload
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: `File too large. Max ${MAX_UPLOAD_SIZE / 1024 / 1024}MB.` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (file.name.endsWith('.zip')) {
      files = await extractZip(buffer);
    } else if (file.name.endsWith('.pdf')) {
      // PDF spec file — extract text content
      try {
        const pdfData = await pdfParse(buffer);
        const content = pdfData.text || '';
        if (content.trim().length === 0) {
          return NextResponse.json({ error: 'PDF contains no extractable text (may be image-only)' }, { status: 400 });
        }
        files = [{
          filePath: file.name.replace(/\.pdf$/, '.md'),
          content: `# ${file.name.replace(/\.pdf$/, '')}\n\n*Extracted from PDF (${pdfData.numpages} pages)*\n\n---\n\n${content}`,
          language: 'markdown',
        }];
      } catch (err) {
        const message = err instanceof Error ? err.message : 'PDF parsing failed';
        return NextResponse.json({ error: `Failed to parse PDF: ${message}` }, { status: 400 });
      }
    } else {
      // Single file upload (text)
      const content = buffer.toString('utf-8');
      files = [{
        filePath: file.name,
        content,
        language: inferLanguage(file.name),
      }];
    }
  } else if (contentType.includes('application/json')) {
    // JSON body with files array (for programmatic uploads)
    const body = await request.json();
    if (!Array.isArray(body.files)) {
      return NextResponse.json({ error: 'Expected { files: [{ filePath, content }] }' }, { status: 400 });
    }
    files = body.files.map((f: { filePath: string; content: string }) => ({
      filePath: f.filePath,
      content: f.content,
      language: inferLanguage(f.filePath),
    }));
  } else {
    return NextResponse.json({ error: 'Unsupported content type. Use multipart/form-data or application/json.' }, { status: 400 });
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No importable files found in upload' }, { status: 400 });
  }

  // Save files to database
  let imported = 0;
  for (const file of files) {
    await prisma.projectFile.upsert({
      where: {
        projectId_filePath: { projectId: params.id, filePath: file.filePath },
      },
      create: {
        projectId: params.id,
        filePath: file.filePath,
        content: file.content,
        language: file.language,
      },
      update: {
        content: file.content,
        language: file.language,
      },
    });
    imported++;
  }

  console.log(`[Upload] Imported ${imported} files into project ${params.id}`);

  return NextResponse.json({
    imported,
    files: files.map((f) => ({ filePath: f.filePath, language: f.language, size: f.content.length })),
  });
}

async function extractZip(buffer: Buffer): Promise<Array<{ filePath: string; content: string; language: string }>> {
  const zip = await JSZip.loadAsync(buffer);
  const files: Array<{ filePath: string; content: string; language: string }> = [];

  for (const [rawPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;

    // Strip the top-level folder if the zip has one (common with GitHub downloads)
    let filePath = rawPath;
    const parts = rawPath.split('/');
    if (parts.length > 1) {
      // Check if all files share the same top-level directory
      const allPaths = Object.keys(zip.files);
      const firstDir = parts[0];
      const allShareRoot = allPaths.every((p) => p.startsWith(firstDir + '/') || p === firstDir + '/');
      if (allShareRoot) {
        filePath = parts.slice(1).join('/');
      }
    }

    if (!filePath || filePath.endsWith('/')) continue;
    if (shouldSkip(filePath)) continue;
    if (!isTextFile(filePath)) continue;

    try {
      const content = await entry.async('string');
      // Skip files that look binary (contain null bytes)
      if (content.includes('\0')) continue;
      // Skip very large files (>2MB)
      if (content.length > 2 * 1024 * 1024) continue;

      files.push({
        filePath,
        content,
        language: inferLanguage(filePath),
      });
    } catch {
      // Skip files that can't be read as text
    }
  }

  return files;
}
