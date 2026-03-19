'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { Flame, Brain, Shield, User, Clock, Loader2, Check, X, AlertCircle, Zap } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Badge } from '@/src/components/ui/badge';

interface DAGNode {
  id: string;
  nodeId: string | null;
  stageIndex: number;
  skillName: string;
  displayName: string;
  status: string;
  nodeType: string | null;
  dependsOn: string[];
  parallelGroup: string | null;
  gateType: string | null;
  phaseIndex: number | null;
  durationMs: number | null;
  retryCount: number;
}

interface DAGViewProps {
  nodes: DAGNode[];
  onNodeClick?: (nodeId: string) => void;
  activeNodeId?: string | null;
  compact?: boolean;
}

const nodeTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  skill: Flame,
  agent: Brain,
  verify: Shield,
  gate: User,
};

const statusStyles: Record<string, { border: string; bg: string; text: string; glow: string }> = {
  pending: { border: 'border-zinc-700', bg: 'bg-zinc-800/60', text: 'text-zinc-500', glow: '' },
  running: { border: 'border-orange-500/60', bg: 'bg-orange-500/10', text: 'text-orange-400', glow: 'shadow-[0_0_12px_-2px_rgba(249,115,22,0.4)]' },
  awaiting_approval: { border: 'border-amber-500/50', bg: 'bg-amber-500/10', text: 'text-amber-400', glow: 'shadow-[0_0_10px_-2px_rgba(245,158,11,0.3)]' },
  approved: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/8', text: 'text-emerald-400', glow: '' },
  failed: { border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-red-400', glow: 'shadow-[0_0_10px_-2px_rgba(239,68,68,0.3)]' },
  retrying: { border: 'border-orange-500/60', bg: 'bg-orange-500/10', text: 'text-orange-400', glow: 'shadow-[0_0_12px_-2px_rgba(249,115,22,0.4)]' },
  skipped: { border: 'border-zinc-800', bg: 'bg-zinc-900/40', text: 'text-zinc-600', glow: '' },
};

const statusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  running: Loader2,
  awaiting_approval: AlertCircle,
  approved: Check,
  failed: X,
  retrying: Loader2,
  skipped: X,
};

export function DAGView({ nodes, onNodeClick, activeNodeId, compact }: DAGViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number; w: number; h: number }>>(new Map());

  // Organize into topological layers
  const layers = useMemo(() => {
    const nodeMap = new Map(nodes.map((n) => [n.nodeId || n.id, n]));
    const depths = new Map<string, number>();

    function getDepth(nodeId: string): number {
      if (depths.has(nodeId)) return depths.get(nodeId)!;
      const node = nodeMap.get(nodeId);
      if (!node || node.dependsOn.length === 0) {
        depths.set(nodeId, 0);
        return 0;
      }
      const validDeps = node.dependsOn.filter((d) => nodeMap.has(d));
      if (validDeps.length === 0) {
        depths.set(nodeId, 0);
        return 0;
      }
      const maxParent = Math.max(...validDeps.map((dep) => getDepth(dep)));
      const depth = maxParent + 1;
      depths.set(nodeId, depth);
      return depth;
    }

    for (const node of nodes) getDepth(node.nodeId || node.id);

    const layerMap = new Map<number, DAGNode[]>();
    for (const node of nodes) {
      const depth = depths.get(node.nodeId || node.id) || 0;
      if (!layerMap.has(depth)) layerMap.set(depth, []);
      layerMap.get(depth)!.push(node);
    }

    return Array.from(layerMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, layerNodes]) => layerNodes);
  }, [nodes]);

  // Measure node positions for SVG edges
  useEffect(() => {
    if (!containerRef.current) return;
    const positions = new Map<string, { x: number; y: number; w: number; h: number }>();
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();

    container.querySelectorAll('[data-node-id]').forEach((el) => {
      const nodeId = el.getAttribute('data-node-id');
      if (!nodeId) return;
      const rect = (el as HTMLElement).getBoundingClientRect();
      positions.set(nodeId, {
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top + rect.height / 2,
        w: rect.width,
        h: rect.height,
      });
    });

    setNodePositions(positions);
  }, [layers, nodes]);

  // Build edge data
  const edges = useMemo(() => {
    const result: Array<{
      fromId: string;
      toId: string;
      active: boolean;
      approved: boolean;
    }> = [];

    for (const node of nodes) {
      for (const depId of node.dependsOn) {
        const depNode = nodes.find((n) => (n.nodeId || n.id) === depId);
        if (!depNode) continue;
        result.push({
          fromId: depNode.id,
          toId: node.id,
          active: node.status === 'running' || node.status === 'retrying',
          approved: depNode.status === 'approved',
        });
      }
    }

    return result;
  }, [nodes]);

  return (
    <div className="relative" ref={containerRef}>
      {/* SVG Edge Layer */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
        <defs>
          <linearGradient id="edge-active" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgb(249, 115, 22)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="rgb(245, 158, 11)" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="edge-approved" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity="0.3" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {edges.map((edge, i) => {
          const from = nodePositions.get(edge.fromId);
          const to = nodePositions.get(edge.toId);
          if (!from || !to) return null;

          const startY = from.y + from.h / 2;
          const endY = to.y - to.h / 2;
          const midY = (startY + endY) / 2;

          return (
            <g key={i}>
              <path
                d={`M ${from.x} ${startY} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${endY}`}
                fill="none"
                stroke={edge.active ? 'url(#edge-active)' : edge.approved ? 'url(#edge-approved)' : 'rgba(63, 63, 70, 0.4)'}
                strokeWidth={edge.active ? 2.5 : 1.5}
                strokeDasharray={edge.active ? '6 3' : 'none'}
                filter={edge.active ? 'url(#glow)' : 'none'}
              >
                {edge.active && (
                  <animate
                    attributeName="stroke-dashoffset"
                    values="9;0"
                    dur="0.6s"
                    repeatCount="indefinite"
                  />
                )}
              </path>
              {/* Arrow */}
              <circle
                cx={to.x}
                cy={endY}
                r={3}
                fill={edge.active ? 'rgb(249, 115, 22)' : edge.approved ? 'rgb(16, 185, 129)' : 'rgba(63, 63, 70, 0.5)'}
              />
            </g>
          );
        })}
      </svg>

      {/* Node Layer */}
      <div className="relative space-y-4 py-4" style={{ zIndex: 1 }}>
        {layers.map((layerNodes, layerIndex) => (
          <div key={layerIndex} className="flex items-start justify-center gap-3 flex-wrap px-4">
            {layerNodes.map((node) => {
              const style = statusStyles[node.status] || statusStyles.pending;
              const StatusIcon = statusIcons[node.status] || Clock;
              const TypeIcon = (node.nodeType ? nodeTypeIcons[node.nodeType] : null) || Flame;
              const isActive = activeNodeId === node.id;
              const isRunning = node.status === 'running' || node.status === 'retrying';

              return (
                <button
                  key={node.id}
                  data-node-id={node.id}
                  onClick={() => onNodeClick?.(node.id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border px-4 py-3 transition-all duration-300',
                    compact ? 'min-w-[100px] max-w-[130px]' : 'min-w-[130px] max-w-[170px]',
                    style.border, style.bg, style.text, style.glow,
                    isActive && 'ring-2 ring-orange-500/60 scale-105',
                    isRunning && 'animate-pulse',
                    onNodeClick && 'cursor-pointer hover:scale-[1.03]',
                    node.status === 'skipped' && 'opacity-40'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <TypeIcon className={cn('h-4 w-4', isRunning && 'animate-spin')} />
                    <StatusIcon className="h-3 w-3" />
                  </div>

                  <span className={cn('text-xs font-medium text-center leading-tight', compact && 'text-[10px]')}>
                    {node.displayName}
                  </span>

                  <div className="flex items-center gap-1.5 flex-wrap justify-center">
                    {node.phaseIndex !== null && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        P{node.phaseIndex}
                      </Badge>
                    )}
                    {node.durationMs && (
                      <span className="text-[10px] opacity-60">
                        {node.durationMs > 60000
                          ? `${(node.durationMs / 60000).toFixed(1)}m`
                          : `${(node.durationMs / 1000).toFixed(1)}s`
                        }
                      </span>
                    )}
                    {node.retryCount > 0 && (
                      <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
                        <Zap className="h-2.5 w-2.5" />
                        {node.retryCount}
                      </span>
                    )}
                  </div>

                  {node.parallelGroup && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="w-1 h-1 rounded-full bg-orange-500/40" />
                      <div className="w-1 h-1 rounded-full bg-orange-500/40" />
                      <span className="text-[9px] opacity-40">parallel</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
