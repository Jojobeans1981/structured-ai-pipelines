import { notFound } from 'next/navigation';
import { getSessionOrDemo } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { Header } from '@/src/components/layout/header';
import { PageContainer } from '@/src/components/layout/page-container';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { ArtifactViewer } from '@/src/components/pipeline/artifact-viewer';
import {
  Boxes,
  Component,
  Eye,
  ExternalLink,
  FileCode2,
  FileText,
  FlaskConical,
  FolderGit2,
  Rocket,
  Settings2,
  Wrench,
} from 'lucide-react';

interface StoredFile {
  id: string;
  filePath: string;
  content: string;
  language: string;
  updatedAt: Date;
}

interface ProjectPreviewData {
  framework: string;
  packageName: string | null;
  scripts: string[];
  builtArtifactAvailable: boolean;
  builtArtifactReason: string | null;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function getPackageData(files: StoredFile[]): { packageName: string | null; scripts: string[]; raw: Record<string, unknown> | null } {
  const packageFile = files.find((file) => normalizePath(file.filePath) === 'package.json');
  if (!packageFile) {
    return { packageName: null, scripts: [], raw: null };
  }

  try {
    const parsed = JSON.parse(packageFile.content) as {
      name?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      packageName: parsed.name || null,
      scripts: Object.keys(parsed.scripts || {}),
      raw: parsed as unknown as Record<string, unknown>,
    };
  } catch {
    return { packageName: null, scripts: [], raw: null };
  }
}

function detectFramework(files: StoredFile[]): string {
  const packageData = getPackageData(files);
  const packageJson = packageData.raw || {};
  const deps = {
    ...(packageJson.dependencies as Record<string, string> | undefined),
    ...(packageJson.devDependencies as Record<string, string> | undefined),
  };
  const paths = files.map((file) => normalizePath(file.filePath).toLowerCase());

  if (deps.next || paths.some((path) => path.startsWith('app/') || path.startsWith('pages/'))) return 'Next.js';
  if (deps.vite) return 'Vite';
  if (deps.react || deps['react-dom']) return 'React';
  if (deps.vue) return 'Vue';
  if (deps.svelte) return 'Svelte';
  if (deps.express) return 'Express';
  if (paths.some((path) => path.endsWith('.py'))) return 'Python';
  if (paths.some((path) => path.endsWith('.go'))) return 'Go';
  return 'Web App';
}

function canRenderStandaloneHtml(htmlContent: string): boolean {
  const lower = htmlContent.toLowerCase();

  if (
    lower.includes('/_next/') ||
    lower.includes('__next') ||
    lower.includes('/src/main.') ||
    lower.includes('./src/main.') ||
    lower.includes('/src/index.') ||
    lower.includes('vite/client')
  ) {
    return false;
  }

  const stripped = lower
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return stripped.length > 0;
}

function findAssetFile(files: StoredFile[], assetRef: string, htmlPath: string): StoredFile | null {
  const normalizedRef = assetRef.replace(/^\.\//, '').replace(/^\//, '');
  const normalizedHtmlPath = normalizePath(htmlPath);
  const htmlDir = normalizedHtmlPath.includes('/') ? normalizedHtmlPath.slice(0, normalizedHtmlPath.lastIndexOf('/')) : '';
  const candidates = [
    normalizedRef,
    htmlDir ? `${htmlDir}/${normalizedRef}` : normalizedRef,
  ].map((candidate) => normalizePath(candidate));

  return files.find((file) => candidates.includes(normalizePath(file.filePath))) || null;
}

function hasExternalModuleGraph(scriptContent: string): boolean {
  return /\bimport\s+[^('"]/.test(scriptContent) || /\bimport\s*\(['"]/.test(scriptContent) || /\bexport\s+/.test(scriptContent);
}

function buildRenderableArtifactDocument(htmlFile: StoredFile, files: StoredFile[]): { document: string | null; reason: string | null } {
  let html = htmlFile.content;
  const linkRefs = Array.from(html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi));
  const scriptRefs = Array.from(html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi));

  for (const match of linkRefs) {
    const href = match[1];
    if (/^(https?:)?\/\//i.test(href)) continue;
    const asset = findAssetFile(files, href, htmlFile.filePath);
    if (!asset) return { document: null, reason: `Missing CSS asset ${href}` };
    html = html.replace(match[0], `<style data-source="${asset.filePath}">\n${asset.content}\n</style>`);
  }

  for (const match of scriptRefs) {
    const src = match[1];
    if (/^(https?:)?\/\//i.test(src)) continue;
    const asset = findAssetFile(files, src, htmlFile.filePath);
    if (!asset) return { document: null, reason: `Missing JS asset ${src}` };
    if (hasExternalModuleGraph(asset.content)) {
      return { document: null, reason: `Built asset ${asset.filePath} still depends on a module graph` };
    }
    const isModule = /type=["']module["']/i.test(match[0]);
    html = html.replace(
      match[0],
      `<script${isModule ? ' type="module"' : ''} data-source="${asset.filePath}">\n${asset.content}\n</script>`
    );
  }

  return { document: html, reason: null };
}

function findBestRenderableArtifact(files: StoredFile[]): { file: StoredFile | null; document: string | null; reason: string | null } {
  const candidates = files.filter((file) => {
    const path = normalizePath(file.filePath).toLowerCase();
    return path === 'index.html' || path.endsWith('/index.html');
  }).sort((left, right) => {
    const leftPath = normalizePath(left.filePath).toLowerCase();
    const rightPath = normalizePath(right.filePath).toLowerCase();
    const leftBuilt = /(dist|build|out|public)\//.test(leftPath) ? 0 : 1;
    const rightBuilt = /(dist|build|out|public)\//.test(rightPath) ? 0 : 1;
    return leftBuilt - rightBuilt || leftPath.localeCompare(rightPath);
  });

  let fallbackReason: string | null = null;

  for (const file of candidates) {
    const path = normalizePath(file.filePath).toLowerCase();
    const isBuiltArtifact = /(dist|build|out|public)\//.test(path);

    if (isBuiltArtifact) {
      const rendered = buildRenderableArtifactDocument(file, files);
      if (rendered.document) {
        return { file, document: rendered.document, reason: null };
      }
      fallbackReason = rendered.reason || fallbackReason;
      continue;
    }

    if (canRenderStandaloneHtml(file.content)) {
      return { file, document: file.content, reason: null };
    }

    fallbackReason = fallbackReason || `HTML shell ${file.filePath} depends on framework runtime assets`;
  }

  return { file: null, document: null, reason: fallbackReason };
}

function rankFiles(files: StoredFile[], patterns: RegExp[], limit: number): StoredFile[] {
  return files
    .filter((file) => patterns.some((pattern) => pattern.test(normalizePath(file.filePath))))
    .slice(0, limit);
}

function buildPreviewData(files: StoredFile[]): ProjectPreviewData {
  const framework = detectFramework(files);
  const packageData = getPackageData(files);
  const artifact = findBestRenderableArtifact(files);

  return {
    framework,
    packageName: packageData.packageName,
    scripts: packageData.scripts,
    builtArtifactAvailable: !!artifact.document,
    builtArtifactReason: artifact.reason,
  };
}

export default async function ProjectFallbackPreviewPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSessionOrDemo();
  if (!session?.user?.id) notFound();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      description: true,
      userId: true,
      files: {
        orderBy: { filePath: 'asc' },
        select: { id: true, filePath: true, content: true, language: true, updatedAt: true },
      },
    },
  });

  if (!project || project.userId !== session.user.id) notFound();

  const files = project.files as StoredFile[];
  const packageData = getPackageData(files);
  const previewData = buildPreviewData(files);
  const artifact = findBestRenderableArtifact(files);
  const readmeFile = files.find((file) => /(^|\/)readme\.md$/i.test(normalizePath(file.filePath)));
  const entryFiles = rankFiles(files, [/(^|\/)(main|index|app|page|layout)\.(tsx?|jsx?|html)$/i], 6);
  const componentFiles = rankFiles(files, [/(^|\/)(components?|ui)\/.+\.(tsx?|jsx?)$/i, /[A-Z][A-Za-z0-9_-]*\.(tsx?|jsx?)$/], 8);
  const testFiles = rankFiles(files, [/\.(test|spec)\.(tsx?|jsx?|ts|js)$/i, /vitest\.config/i], 6);
  const configFiles = rankFiles(files, [/package\.json$/i, /vite\.config/i, /tsconfig/i, /docker-compose\.yml$/i, /dockerfile$/i, /nginx\.conf$/i], 8);
  const serviceFiles = rankFiles(files, [/(service|store|state|machine|api|client)\.(tsx?|jsx?|ts|js)$/i], 6);

  return (
    <>
      <Header title={`${project.name} Preview`} />
      <PageContainer>
        <div className="space-y-6">
          <Card className="border-orange-500/20 bg-orange-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
                <Eye className="h-4 w-4 text-orange-400" />
                Hosted Preview Review
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-zinc-300">
              <p>
                This host does not support Docker live preview, so Forge is showing the strongest review surface it can build from stored project artifacts.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{previewData.framework}</Badge>
                <Badge variant="outline">{files.length} files</Badge>
                <Badge variant="outline">{previewData.builtArtifactAvailable ? 'Built artifact renderable' : 'Code review mode'}</Badge>
                {previewData.packageName && <Badge variant="outline">{previewData.packageName}</Badge>}
              </div>
              {packageData.scripts.length > 0 && (
                <p className="text-zinc-500">
                  Scripts detected: {packageData.scripts.join(', ')}
                </p>
              )}
            </CardContent>
          </Card>

          {artifact.document ? (
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ExternalLink className="h-4 w-4 text-emerald-400" />
                  Best-Effort Built Artifact Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <iframe
                  title="Built artifact preview"
                  srcDoc={artifact.document}
                  className="h-[720px] w-full rounded-lg border border-zinc-800 bg-white"
                  sandbox="allow-scripts allow-same-origin"
                />
                <p className="mt-3 text-xs text-zinc-500">
                  Rendering stored artifact from {artifact.file?.filePath || 'generated HTML'}.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileCode2 className="h-4 w-4 text-cyan-400" />
                  Code-Based Fallback Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-zinc-400">
                <p>
                  No self-contained built artifact was found, so this fallback is showing the app structure, critical files, and setup path instead of a blank shell.
                </p>
                {previewData.builtArtifactReason && (
                  <p className="text-zinc-500">Best artifact check: {previewData.builtArtifactReason}.</p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Rocket className="h-4 w-4 text-orange-400" />
                  Entry Surface
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {entryFiles.length > 0 ? (
                  entryFiles.map((file) => (
                    <div key={file.id}>
                      <div className="mb-2 text-sm font-medium text-zinc-200">{file.filePath}</div>
                      <ArtifactViewer content={`\`\`\`${file.language}\n${file.content.slice(0, 3000)}\n\`\`\``} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">No primary entry files were detected in the stored output.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Component className="h-4 w-4 text-emerald-400" />
                  Key Components
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {componentFiles.length > 0 ? (
                  componentFiles.map((file) => (
                    <div key={file.id}>
                      <div className="mb-2 text-sm font-medium text-zinc-200">{file.filePath}</div>
                      <ArtifactViewer content={`\`\`\`${file.language}\n${file.content.slice(0, 2200)}\n\`\`\``} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">No major component files were detected.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wrench className="h-4 w-4 text-cyan-400" />
                  Services & State
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {serviceFiles.length > 0 ? (
                  serviceFiles.map((file) => (
                    <div key={file.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                      <div className="truncate text-sm text-zinc-200">{file.filePath}</div>
                      <div className="mt-1 text-xs text-zinc-500">{file.language}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">No obvious service or state files were detected.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FlaskConical className="h-4 w-4 text-purple-400" />
                  Tests
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {testFiles.length > 0 ? (
                  testFiles.map((file) => (
                    <div key={file.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                      <div className="truncate text-sm text-zinc-200">{file.filePath}</div>
                      <div className="mt-1 text-xs text-zinc-500">{file.language}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">No test files were detected.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings2 className="h-4 w-4 text-yellow-400" />
                  Config
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {configFiles.length > 0 ? (
                  configFiles.map((file) => (
                    <div key={file.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                      <div className="truncate text-sm text-zinc-200">{file.filePath}</div>
                      <div className="mt-1 text-xs text-zinc-500">{file.language}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">No major config files were detected.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {readmeFile && (
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-orange-400" />
                  README / Setup Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ArtifactViewer content={readmeFile.content} />
              </CardContent>
            </Card>
          )}

          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="h-4 w-4 text-zinc-300" />
                Stored Files
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {files.slice(0, 36).map((file) => (
                  <div key={file.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                    <div className="truncate text-sm text-zinc-200">{file.filePath}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                      <span>{file.language}</span>
                      <span>•</span>
                      <span>{new Date(file.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
              {files.length > 36 && (
                <p className="mt-3 text-xs text-zinc-500">Showing 36 of {files.length} stored files.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderGit2 className="h-4 w-4 text-zinc-300" />
                What This Still Cannot Do
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-400">
              <p>Hosted fallback preview can review files and render self-contained artifacts, but it still cannot replace a real Docker or worker-backed runtime.</p>
              <p>Projects that require TypeScript/JSX compilation, dev servers, API backends, databases, or multi-file browser module graphs still need a Docker-capable preview worker to become truly live.</p>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
