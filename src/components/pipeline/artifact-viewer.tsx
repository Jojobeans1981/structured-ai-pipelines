'use client';

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button } from '@/src/components/ui/button';
import { Copy, Check, ChevronDown, ChevronUp, FileCode } from 'lucide-react';

interface ArtifactViewerProps {
  content: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="absolute top-2 right-2 h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-orange-400"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function CollapsibleCode({ language, code }: { language: string; code: string }) {
  const [collapsed, setCollapsed] = useState(code.split('\n').length > 40);
  const lineCount = code.split('\n').length;
  const displayCode = collapsed ? code.split('\n').slice(0, 20).join('\n') : code;

  // Try to extract filename from first comment
  const firstLine = code.split('\n')[0];
  const fileHint = firstLine?.match(/(?:\/\/|#)\s*(?:file:?\s*)?(\S+\.\w+)/)?.[1];

  return (
    <div className="relative group not-prose my-3">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/80 rounded-t-lg border border-zinc-700/50 border-b-0">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <FileCode className="h-3 w-3" />
          <span className="font-medium">{fileHint || language}</span>
          <span className="text-zinc-600">{lineCount} lines</span>
        </div>
        <CopyButton text={code} />
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        className="rounded-t-none rounded-b-lg text-sm !mt-0 border border-zinc-700/50 border-t-0"
        customStyle={{ margin: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
      >
        {displayCode}
      </SyntaxHighlighter>
      {lineCount > 40 && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-zinc-500 hover:text-orange-400 bg-zinc-900/50 border border-t-0 border-zinc-700/50 rounded-b-lg transition-colors -mt-[1px]"
        >
          {collapsed ? (
            <>
              <ChevronDown className="h-3 w-3" />
              Show all {lineCount} lines
            </>
          ) : (
            <>
              <ChevronUp className="h-3 w-3" />
              Collapse
            </>
          )}
        </button>
      )}
    </div>
  );
}

export function ArtifactViewer({ content }: ArtifactViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const lineCount = content.split('\n').length;
  const isLong = lineCount > 150;
  const displayContent = isLong && !expanded
    ? content.split('\n').slice(0, 80).join('\n') + '\n\n...'
    : content;

  return (
    <div className="prose prose-sm prose-invert max-w-none prose-headings:text-zinc-200 prose-p:text-zinc-300 prose-strong:text-zinc-200 prose-a:text-orange-400 prose-li:text-zinc-300 prose-code:text-orange-300 prose-code:bg-zinc-800/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');

            if (match) {
              return <CollapsibleCode language={match[1]} code={codeString} />;
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {displayContent}
      </ReactMarkdown>
      {isLong && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-zinc-400 hover:text-orange-400"
        >
          {expanded ? (
            <>
              <ChevronUp className="mr-1 h-4 w-4" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="mr-1 h-4 w-4" /> Show all ({lineCount} lines)
            </>
          )}
        </Button>
      )}
    </div>
  );
}
