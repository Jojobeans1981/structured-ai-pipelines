'use client';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ArtifactViewer } from '@/src/components/pipeline/artifact-viewer';

interface FixDiffViewerProps {
  artifactContent: string;
}

interface CodeChange {
  filePath: string;
  language: string;
  before: string;
  after: string;
}

function parseChanges(content: string): { changes: CodeChange[]; remainder: string } {
  const changes: CodeChange[] = [];
  const lines = content.split('\n');
  let remainder = '';
  let i = 0;

  while (i < lines.length) {
    const beforeMatch = lines[i]?.match(/^```(\w+)?(?::(.+))?/);
    const prevLine = lines[i - 1]?.toLowerCase() || '';
    const prevPrevLine = lines[i - 2]?.toLowerCase() || '';

    if (beforeMatch && (prevLine.includes('before') || prevPrevLine.includes('before'))) {
      const language = beforeMatch[1] || 'plaintext';
      const filePath = beforeMatch[2] || '';
      i++;
      const beforeLines: string[] = [];
      while (i < lines.length && lines[i] !== '```') {
        beforeLines.push(lines[i]);
        i++;
      }
      i++;

      while (i < lines.length && !lines[i]?.startsWith('```')) {
        i++;
      }
      const afterPrevLine = lines[i - 1]?.toLowerCase() || '';
      const afterPrevPrevLine = lines[i - 2]?.toLowerCase() || '';

      if (i < lines.length && (afterPrevLine.includes('after') || afterPrevPrevLine.includes('after'))) {
        i++;
        const afterLines: string[] = [];
        while (i < lines.length && lines[i] !== '```') {
          afterLines.push(lines[i]);
          i++;
        }
        i++;

        changes.push({
          filePath: filePath || `change-${changes.length + 1}`,
          language,
          before: beforeLines.join('\n'),
          after: afterLines.join('\n'),
        });
        continue;
      }
    }
    remainder += (lines[i] || '') + '\n';
    i++;
  }

  return { changes, remainder: remainder.trim() };
}

export function FixDiffViewer({ artifactContent }: FixDiffViewerProps) {
  const { changes, remainder } = parseChanges(artifactContent);

  if (changes.length === 0) {
    return <ArtifactViewer content={artifactContent} />;
  }

  return (
    <div className="space-y-6">
      {remainder && <ArtifactViewer content={remainder} />}

      {changes.map((change, index) => (
        <div key={index} className="rounded-md border overflow-hidden">
          <div className="bg-muted px-3 py-1.5 text-sm font-mono font-medium border-b">
            {change.filePath}
          </div>
          <div className="grid grid-cols-2 divide-x">
            <div>
              <div className="bg-red-500/10 px-3 py-1 text-xs font-medium text-red-600 border-b">Before</div>
              <SyntaxHighlighter
                style={oneDark}
                language={change.language}
                customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.8rem' }}
              >
                {change.before}
              </SyntaxHighlighter>
            </div>
            <div>
              <div className="bg-green-500/10 px-3 py-1 text-xs font-medium text-green-600 border-b">After</div>
              <SyntaxHighlighter
                style={oneDark}
                language={change.language}
                customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.8rem' }}
              >
                {change.after}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
