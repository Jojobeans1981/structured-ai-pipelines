'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { ArrowDown, ArrowUp, DollarSign, Zap } from 'lucide-react';

interface StageCost {
  input: number;
  output: number;
  cost: number;
  costFormatted: string;
  model: string;
  backend: string;
  pricing: {
    inputPerMTok: number;
    outputPerMTok: number;
    source: string;
    note: string;
    billable: boolean;
  };
}

interface RunCost {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  costFormatted: string;
  pricingSource: string;
  stageTokens: Record<string, StageCost>;
}

interface CostDisplayProps {
  runId: string;
}

function formatTokens(count: number): string {
  if (count === 0) return '0';
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}

function estimateEquivalentHours(totalTokens: number): string {
  const hours = (totalTokens / 1000) * 2;
  if (hours < 1) return '< 1 hour';
  if (hours < 8) return `~${Math.round(hours)} hours`;
  return `~${Math.round(hours / 8)} days`;
}

export function CostDisplay({ runId }: CostDisplayProps) {
  const [data, setData] = useState<RunCost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/pipeline/${runId}/cost`);
        if (res.ok) {
          const json = await res.json();
          setData(json.data);
        }
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [runId]);

  if (loading || !data) return null;
  if (data.totalInputTokens === 0 && data.totalOutputTokens === 0) return null;

  const totalTokens = data.totalInputTokens + data.totalOutputTokens;
  const stageEntries = Object.entries(data.stageTokens).filter(([, v]) => v.input + v.output > 0);
  const equivalentTime = estimateEquivalentHours(data.totalOutputTokens);

  return (
    <Card className="border-orange-500/20 bg-orange-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-orange-400" />
          Pipeline Cost
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-zinc-500">API Cost</p>
            <p className="text-lg font-semibold text-orange-400">{data.costFormatted}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Total Tokens</p>
            <p className="text-lg font-semibold text-zinc-200">{formatTokens(totalTokens)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Output Size</p>
            <p className="text-lg font-semibold text-emerald-400">{equivalentTime}</p>
          </div>
        </div>

        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1 text-zinc-400">
            <ArrowUp className="h-3 w-3 text-blue-400" />
            {formatTokens(data.totalInputTokens)} input
          </span>
          <span className="flex items-center gap-1 text-zinc-400">
            <ArrowDown className="h-3 w-3 text-emerald-400" />
            {formatTokens(data.totalOutputTokens)} output
          </span>
        </div>

        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
          <p className="text-xs text-emerald-400">
            <Zap className="h-3 w-3 inline mr-1" />
            API cost is measured from recorded stage tokens. Output size is a rough display estimate, not a billing figure.
          </p>
        </div>

        {stageEntries.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-zinc-500 font-medium">Per Stage</p>
            {stageEntries.map(([name, stage]) => (
              <div key={name} className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 truncate mr-2">{name}</span>
                <div className="flex items-center gap-3 text-zinc-500 shrink-0">
                  <span>{formatTokens(stage.input + stage.output)}</span>
                  <span className="w-20 text-right">{stage.costFormatted}</span>
                  <span className="text-[10px] text-zinc-600 w-28 text-right truncate" title={stage.pricing.note}>
                    {stage.model}
                  </span>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-zinc-600 pt-1">
              Pricing source: {data.pricingSource}. Cache, batch, long-context, regional endpoint, tax, and provider markup are not included.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
