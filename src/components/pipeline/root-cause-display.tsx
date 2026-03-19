'use client';

import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Badge } from '@/src/components/ui/badge';
import { ArtifactViewer } from '@/src/components/pipeline/artifact-viewer';

interface RootCauseDisplayProps {
  artifactContent: string;
}

type Verdict = 'confirmed' | 'strong_hypothesis' | 'insufficient';

function detectVerdict(content: string): Verdict | null {
  const upper = content.toUpperCase();
  if (upper.includes('CONFIRMED')) return 'confirmed';
  if (upper.includes('STRONG HYPOTHESIS')) return 'strong_hypothesis';
  if (upper.includes('INSUFFICIENT EVIDENCE')) return 'insufficient';
  return null;
}

const verdictConfig: Record<Verdict, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ComponentType<{ className?: string }> }> = {
  confirmed: { label: 'Confirmed', color: 'text-green-600', bgColor: 'bg-green-500/10', borderColor: 'border-green-500', icon: CheckCircle2 },
  strong_hypothesis: { label: 'Strong Hypothesis', color: 'text-yellow-600', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500', icon: AlertTriangle },
  insufficient: { label: 'Insufficient Evidence', color: 'text-red-600', bgColor: 'bg-red-500/10', borderColor: 'border-red-500', icon: XCircle },
};

export function RootCauseDisplay({ artifactContent }: RootCauseDisplayProps) {
  const verdict = detectVerdict(artifactContent);

  if (!verdict) {
    return <ArtifactViewer content={artifactContent} />;
  }

  const config = verdictConfig[verdict];
  const Icon = config.icon;

  const lines = artifactContent.split('\n').filter((l) => l.trim());
  const summaryEnd = lines.findIndex((l, i) => i > 0 && (l.startsWith('#') || l.startsWith('---')));
  const summary = lines.slice(0, summaryEnd > 0 ? summaryEnd : 3).join('\n');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge className={`${config.bgColor} ${config.color} border-0 text-sm px-3 py-1`}>
          <Icon className="mr-1.5 h-4 w-4" />
          Verdict: {config.label}
        </Badge>
      </div>

      <div className={`border-l-4 ${config.borderColor} ${config.bgColor} rounded-r-md p-4`}>
        <p className="text-sm font-medium">{summary}</p>
      </div>

      <ArtifactViewer content={artifactContent} />
    </div>
  );
}
