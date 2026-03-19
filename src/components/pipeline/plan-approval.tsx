'use client';

import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import { Flame, Loader2, GitBranch } from 'lucide-react';
import { DAGView } from '@/src/components/pipeline/dag-view';

interface PlanApprovalProps {
  runId: string;
  nodes: Array<{
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
  }>;
  executionPlan: {
    type: string;
    estimatedPhases: number;
    parallelGroups: string[];
  } | null;
  onApprove: () => Promise<void>;
}

export function PlanApproval({ runId, nodes, executionPlan, onApprove }: PlanApprovalProps) {
  const [isApproving, setIsApproving] = useState(false);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await onApprove();
    } finally {
      setIsApproving(false);
    }
  };

  const skillNodes = nodes.filter((n) => n.nodeType === 'skill');
  const gateNodes = nodes.filter((n) => n.nodeType === 'gate');
  const verifyNodes = nodes.filter((n) => n.nodeType === 'verify');
  const phases = [...new Set(nodes.map((n) => n.phaseIndex).filter((p) => p !== null))];

  return (
    <Card className="border-orange-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <GitBranch className="h-5 w-5 text-orange-400" />
          Execution Plan
          {executionPlan && (
            <Badge variant="outline" className="text-orange-400 border-orange-500/20">
              {executionPlan.type}
            </Badge>
          )}
        </CardTitle>
        <div className="flex gap-4 text-sm text-zinc-400 mt-2">
          <span>{nodes.length} nodes</span>
          <span>{phases.length} phases</span>
          <span>{skillNodes.length} skill executions</span>
          {verifyNodes.length > 0 && <span>{verifyNodes.length} verification</span>}
          {gateNodes.length > 0 && <span>{gateNodes.length} approval gates</span>}
          {executionPlan && executionPlan.parallelGroups.length > 0 && (
            <span>{executionPlan.parallelGroups.length} parallel groups</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <DAGView nodes={nodes} />

        <div className="flex items-center gap-3 pt-2 border-t border-orange-500/10">
          <Button onClick={handleApprove} disabled={isApproving}>
            {isApproving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Flame className="mr-2 h-4 w-4" />
            )}
            {isApproving ? 'Igniting...' : 'Approve & Forge'}
          </Button>
          <span className="text-xs text-zinc-500">
            Review the plan above, then approve to begin execution
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
