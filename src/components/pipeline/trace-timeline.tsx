'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import {
  Activity, GitBranch, CheckCircle, XCircle, Clock, Cpu,
  Shield, Palette, Zap, Code2, ChevronDown, ChevronRight,
} from 'lucide-react';

interface TraceEvent {
  id: string;
  spanId: string;
  parentSpanId: string | null;
  eventType: string;
  source: string;
  message: string;
  metadata: Record<string, unknown>;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  timestamp: string;
}

interface AgentVote {
  id: string;
  agentRole: string;
  votedOption: string;
  confidence: number;
  reasoning: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number | null;
  status: string;
}

interface TraceData {
  traceId: string;
  events: TraceEvent[];
  votes: AgentVote[];
  summary: {
    totalEvents: number;
    totalVotes: number;
    agentDecisions: number;
  };
}

const EVENT_ICONS: Record<string, typeof Activity> = {
  pipeline_start: Activity,
  pipeline_complete: CheckCircle,
  stage_start: Clock,
  stage_complete: CheckCircle,
  stage_error: XCircle,
  agent_spawn: Cpu,
  agent_complete: Cpu,
  agent_vote: GitBranch,
  decision_start: GitBranch,
  decision_made: CheckCircle,
  gate_approved: CheckCircle,
  gate_rejected: XCircle,
  gate_awaiting: Clock,
};

const EVENT_COLORS: Record<string, string> = {
  pipeline_start: 'text-blue-400',
  pipeline_complete: 'text-emerald-400',
  stage_start: 'text-orange-400',
  stage_complete: 'text-emerald-400',
  stage_error: 'text-red-400',
  agent_spawn: 'text-purple-400',
  agent_complete: 'text-purple-400',
  agent_vote: 'text-yellow-400',
  decision_start: 'text-cyan-400',
  decision_made: 'text-cyan-400',
  gate_approved: 'text-emerald-400',
  gate_rejected: 'text-red-400',
  gate_awaiting: 'text-orange-400',
};

const AGENT_ICONS: Record<string, typeof Activity> = {
  architecture: GitBranch,
  code_quality: Code2,
  security: Shield,
  performance: Zap,
  ux: Palette,
};

function AgentVoteCard({ vote }: { vote: AgentVote }) {
  const Icon = AGENT_ICONS[vote.agentRole] || Cpu;
  const confidencePct = (vote.confidence * 100).toFixed(0);
  const barColor = vote.confidence > 0.7 ? 'bg-emerald-500' : vote.confidence > 0.4 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-start gap-3 rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-3">
      <Icon className="h-4 w-4 mt-0.5 text-purple-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-300 capitalize">
            {vote.agentRole.replace('_', ' ')}
          </span>
          <span className="text-xs text-zinc-500">
            {vote.durationMs ? `${vote.durationMs}ms` : ''} · ${vote.costUsd.toFixed(4)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm font-mono text-orange-300">{vote.votedOption}</span>
          <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
            <div className={`h-full ${barColor} rounded-full`} style={{ width: `${confidencePct}%` }} />
          </div>
          <span className="text-xs text-zinc-400">{confidencePct}%</span>
        </div>
        <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{vote.reasoning}</p>
      </div>
    </div>
  );
}

function EventRow({ event, votes, isExpanded, onToggle }: {
  event: TraceEvent;
  votes: AgentVote[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const Icon = EVENT_ICONS[event.eventType] || Activity;
  const color = EVENT_COLORS[event.eventType] || 'text-zinc-400';
  const isParent = event.eventType === 'decision_start' || event.eventType === 'stage_start';
  const hasChildren = votes.length > 0 || isParent;
  const time = new Date(event.timestamp).toLocaleTimeString();

  return (
    <div className="group">
      <div
        className={`flex items-start gap-3 py-2 px-3 rounded-md transition-colors ${hasChildren ? 'cursor-pointer hover:bg-zinc-800/50' : ''}`}
        onClick={hasChildren ? onToggle : undefined}
      >
        {/* Timeline line + dot */}
        <div className="flex flex-col items-center shrink-0 mt-1">
          {event.parentSpanId ? (
            <div className="w-2 h-2 rounded-full bg-zinc-600" />
          ) : (
            <Icon className={`h-4 w-4 ${color}`} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {hasChildren && (
              isExpanded
                ? <ChevronDown className="h-3 w-3 text-zinc-500 shrink-0" />
                : <ChevronRight className="h-3 w-3 text-zinc-500 shrink-0" />
            )}
            <span className="text-sm text-zinc-200 truncate">{event.message}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-zinc-600">{time}</span>
            <span className="text-xs text-zinc-600">{event.source}</span>
            {event.durationMs && (
              <span className="text-xs text-zinc-500">{event.durationMs}ms</span>
            )}
            {(event.inputTokens || event.outputTokens) && (
              <span className="text-xs text-zinc-500">
                {event.inputTokens ?? 0}↓ {event.outputTokens ?? 0}↑
              </span>
            )}
            {event.costUsd && (
              <span className="text-xs text-emerald-500/70">${event.costUsd.toFixed(4)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded: show agent votes */}
      {isExpanded && votes.length > 0 && (
        <div className="ml-10 mb-2 space-y-2">
          {votes.map((vote) => (
            <AgentVoteCard key={vote.id} vote={vote} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TraceTimeline({ runId }: { runId: string }) {
  const [data, setData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchTrace() {
      try {
        const res = await fetch(`/api/pipeline/${runId}/trace`);
        if (!res.ok) {
          if (res.status === 404) {
            setData(null);
            return;
          }
          throw new Error('Failed to fetch trace data');
        }
        const json = await res.json();
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }

    fetchTrace();
    // Poll every 5 seconds for live updates
    const interval = setInterval(fetchTrace, 5000);
    return () => clearInterval(interval);
  }, [runId]);

  const toggleSpan = (spanId: string) => {
    setExpandedSpans((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-zinc-500">
          Loading trace data...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-red-400">
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.events.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-zinc-500">
          No trace data yet. Events will appear as the pipeline runs.
        </CardContent>
      </Card>
    );
  }

  // Group votes by their decision's stage
  const votesBySpan = new Map<string, AgentVote[]>();
  for (const vote of data.votes) {
    // Find the decision_start event that matches this vote's stage
    const decisionEvent = data.events.find(
      (e) => e.eventType === 'decision_start'
    );
    if (decisionEvent) {
      const existing = votesBySpan.get(decisionEvent.spanId) || [];
      existing.push(vote);
      votesBySpan.set(decisionEvent.spanId, existing);
    }
  }

  // Filter to top-level events (no parentSpanId) for the main timeline
  // Show child events inline when expanded
  const topLevelEvents = data.events.filter((e) => !e.parentSpanId);
  const childEvents = data.events.filter((e) => e.parentSpanId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-400" />
            Pipeline Trace
          </div>
          <div className="flex items-center gap-4 text-sm font-normal text-zinc-400">
            <span>{data.summary.totalEvents} events</span>
            {data.summary.totalVotes > 0 && (
              <span>{data.summary.totalVotes} agent votes across {data.summary.agentDecisions} decisions</span>
            )}
          </div>
        </CardTitle>
        {data.traceId && (
          <p className="text-xs font-mono text-zinc-600">{data.traceId}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-0.5">
          {topLevelEvents.map((event) => (
            <div key={event.id}>
              <EventRow
                event={event}
                votes={votesBySpan.get(event.spanId) || []}
                isExpanded={expandedSpans.has(event.spanId)}
                onToggle={() => toggleSpan(event.spanId)}
              />
              {/* Show child events when parent is expanded */}
              {expandedSpans.has(event.spanId) && (
                <div className="ml-6 border-l border-zinc-700/50 pl-2">
                  {childEvents
                    .filter((c) => c.parentSpanId === event.spanId)
                    .map((child) => (
                      <EventRow
                        key={child.id}
                        event={child}
                        votes={votesBySpan.get(child.spanId) || []}
                        isExpanded={expandedSpans.has(child.spanId)}
                        onToggle={() => toggleSpan(child.spanId)}
                      />
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
