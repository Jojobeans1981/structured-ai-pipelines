import { notFound } from 'next/navigation';
import { getSessionOrDemo } from '@/src/lib/auth-helpers';
import { prisma } from '@/src/lib/prisma';
import { Header } from '@/src/components/layout/header';
import { PageContainer } from '@/src/components/layout/page-container';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { ExternalLink, Eye, FileCode2, FileText } from 'lucide-react';

function buildHtmlPreviewDocument(
  htmlContent: string,
  cssFiles: Array<{ filePath: string; content: string }>
): string {
  const styles = cssFiles
    .slice(0, 5)
    .map((file) => `/* ${file.filePath} */\n${file.content}`)
    .join('\n\n');

  if (!styles) return htmlContent;

  if (htmlContent.includes('</head>')) {
    return htmlContent.replace('</head>', `<style>\n${styles}\n</style>\n</head>`);
  }

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
${styles}
    </style>
  </head>
  <body>
${htmlContent}
  </body>
</html>`;
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

  const htmlFile =
    project.files.find((file) => /(^|\/)index\.html?$/i.test(file.filePath)) ||
    project.files.find((file) => file.language === 'html');
  const cssFiles = project.files.filter((file) => file.language === 'css');
  const readmeFile = project.files.find((file) => /(^|\/)readme\.md$/i.test(file.filePath));
  const entryFiles = project.files.filter((file) =>
    /(^|\/)(page|layout|app|main|index)\.(tsx?|jsx?)$/i.test(file.filePath)
  ).slice(0, 6);
  const previewDocument = htmlFile ? buildHtmlPreviewDocument(htmlFile.content, cssFiles) : null;

  return (
    <>
      <Header title={`${project.name} Preview`} />
      <PageContainer>
        <div className="space-y-6">
          <Card className="border-orange-500/20 bg-orange-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
                <Eye className="h-4 w-4 text-orange-400" />
                Fallback Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-300">
              <p>
                This host does not support Docker live preview, so this page renders the stored project artifacts directly.
              </p>
              <p className="text-zinc-500">
                Best for reviewing generated HTML, entry files, README guidance, and the overall output footprint without launching a container.
              </p>
            </CardContent>
          </Card>

          {previewDocument ? (
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ExternalLink className="h-4 w-4 text-emerald-400" />
                  Rendered HTML Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <iframe
                  title="Fallback project preview"
                  srcDoc={previewDocument}
                  className="h-[720px] w-full rounded-lg border border-zinc-800 bg-white"
                  sandbox="allow-scripts allow-same-origin"
                />
                <p className="mt-3 text-xs text-zinc-500">
                  Source: {htmlFile?.filePath || 'HTML entry'}{cssFiles.length > 0 ? ` + ${cssFiles.length} CSS file(s)` : ''}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileCode2 className="h-4 w-4 text-cyan-400" />
                  App Structure Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-zinc-400">
                  No standalone HTML entry was found, so this fallback shows the primary generated entry files instead.
                </p>
                {entryFiles.length > 0 ? (
                  entryFiles.map((file) => (
                    <div key={file.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60">
                      <div className="border-b border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200">
                        {file.filePath}
                      </div>
                      <pre className="max-h-[360px] overflow-auto p-4 text-xs text-zinc-300 whitespace-pre-wrap">
                        {file.content.slice(0, 4000)}
                      </pre>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">No obvious entry files were found in the stored output.</p>
                )}
              </CardContent>
            </Card>
          )}

          {readmeFile && (
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-purple-400" />
                  README / Setup Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-300">
                  {readmeFile.content}
                </pre>
              </CardContent>
            </Card>
          )}

          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader>
              <CardTitle className="text-base">Stored Files</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2">
                {project.files.slice(0, 24).map((file) => (
                  <div key={file.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
                    <div className="truncate text-sm text-zinc-200">{file.filePath}</div>
                    <div className="text-xs text-zinc-500">{file.language}</div>
                  </div>
                ))}
              </div>
              {project.files.length > 24 && (
                <p className="mt-3 text-xs text-zinc-500">Showing 24 of {project.files.length} stored files.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
