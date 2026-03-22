import Anthropic from '@anthropic-ai/sdk';
import { type ExecutionPlan, type DAGNode } from '@/src/types/dag';
import { DAGExecutor } from '@/src/services/dag-executor';
import { createWithFallback } from '@/src/lib/anthropic';

const INTAKE_SYSTEM_PROMPT = `You are the Gauntlet Forge Intake Agent. Your job is to analyze a user's request and generate an execution plan as a directed acyclic graph (DAG).

## What you do:
1. Classify the request as: build, diagnostic, or refactor
2. Estimate project complexity (number of phases)
3. Generate a DAG with the correct nodes and dependencies

## Node types:
- "skill": Runs a skill prompt through Claude (PRD generation, phase building, code execution, etc.)
- "gate": Pauses for human approval
- "verify": Runs build verification (npm install && npm run build)
- "agent": Runs a specialized agent (triage, etc.)

## Available skills:
- prd-architect: Generate PRD from requirements
- phase-builder: Split PRD into phases
- prompt-builder: Generate implementation prompts for a phase
- prompt-validator: Validate prompts
- phase-executor: Execute prompts into code
- bug-intake: Collect bug information
- code-archaeologist: Trace bug through code
- root-cause-analyzer: Find root cause
- fix-planner: Plan the fix
- fix-prompt-builder: Generate fix prompts
- fix-executor: Apply the fix
- lessons-learned: Extract lessons

## Rules:
1. For BUILD requests:
   - Always start with prd-architect
   - Then phase-builder to split into phases
   - For each estimated phase: prompt-builder → phase-executor (skip prompt-validator for speed)
   - Phase numbering starts at 0 (scaffolding) and goes up
   - Phases that don't depend on each other can run in parallel (same parallelGroup)
   - Phase 0 (scaffolding) must complete before other phases
   - Add a verify node after ALL phase-executor nodes complete
   - Do NOT add gate nodes — the pipeline handles approval automatically

2. For DIAGNOSTIC requests:
   - bug-intake → code-archaeologist → root-cause-analyzer → fix-planner → fix-prompt-builder → fix-executor → verify → lessons-learned

3. For REFACTOR requests:
   - Treat like a build but skip PRD — go straight to phase-builder with the refactor spec

4. For ENHANCE requests (adding features to existing project):
   - Start with prd-architect (scoped to the new feature, not full project)
   - Then phase-builder → prompt-builder → phase-executor for each phase
   - The user will provide existing code context

5. For TEST requests (generating test suites):
   - Single phase: analyze code → generate test plan → generate test files
   - Nodes: test-planner (skill: prd-architect scoped to tests) → test-generator (skill: phase-executor)
   - Add verify node to run the tests

6. For DEPLOY requests (CI/CD, Docker, deployment config):
   - Single phase: analyze project → generate deployment config → verify
   - Nodes: deploy-planner (skill: prd-architect scoped to deployment) → deploy-generator (skill: phase-executor) → verify

7. Keep it practical — a simple project (tic-tac-toe) needs 2-3 phases. A complex one (full-stack SaaS) needs 5-7. Never exceed 8 phases.

5. When phases CAN parallelize (no shared dependencies), give them the same parallelGroup string.

## Output format:
Respond with ONLY valid JSON matching this schema (no markdown, no explanation):

{
  "type": "build" | "diagnostic" | "refactor",
  "estimatedPhases": number,
  "parallelGroups": string[],
  "nodes": [
    {
      "id": string,
      "skillName": string | null,
      "displayName": string,
      "description": string,
      "nodeType": "agent" | "skill" | "verify" | "gate",
      "dependsOn": string[],
      "parallelGroup": string | null,
      "gateType": "plan_approval" | "phase_review" | "final_review" | null,
      "maxRetries": number,
      "phaseIndex": number | null
    }
  ],
  "edges": [
    { "from": string, "to": string, "condition": string | null }
  ]
}`;

export class IntakeAgent {
  /**
   * Analyze user input and generate an execution plan.
   */
  static async generatePlan(
    userInput: string,
    client: Anthropic
  ): Promise<ExecutionPlan> {
    console.log(`[IntakeAgent] Generating plan for input (${userInput.length} chars)`);

    const response = await createWithFallback(client, {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: INTAKE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Generate an execution plan for this request:\n\n${userInput}`,
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => {
        if (block.type === 'text') return block.text;
        return '';
      })
      .join('');

    // Parse the JSON response
    let plan: ExecutionPlan;
    try {
      // Try to extract JSON if wrapped in markdown code block
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      plan = JSON.parse(jsonMatch[1] || text);
    } catch (err) {
      console.error('[IntakeAgent] Failed to parse plan JSON:', text.substring(0, 500));
      throw new Error('Intake agent returned invalid JSON. Please try again.');
    }

    // Validate the plan
    const validation = DAGExecutor.validatePlan(plan);
    if (!validation.valid) {
      console.error('[IntakeAgent] Invalid plan:', validation.errors);
      throw new Error(`Generated plan is invalid: ${validation.errors.join(', ')}`);
    }

    console.log(
      `[IntakeAgent] Generated ${plan.type} plan with ${plan.nodes.length} nodes, ` +
      `${plan.estimatedPhases} phases, ${plan.parallelGroups.length} parallel groups`
    );

    return plan;
  }

  /**
   * Generate a default build plan for simple projects.
   * Used as fallback if the intake agent fails.
   */
  static defaultBuildPlan(estimatedPhases: number = 3): ExecutionPlan {
    const nodes: DAGNode[] = [
      {
        id: 'prd',
        skillName: 'prd-architect',
        displayName: 'PRD Generation',
        description: 'Generate complete Product Requirements Document',
        nodeType: 'skill',
        dependsOn: [],
        parallelGroup: null,
        gateType: null,
        maxRetries: 2,
        phaseIndex: null,
      },
      {
        id: 'phases',
        skillName: 'phase-builder',
        displayName: 'Phase Extraction',
        description: 'Extract standalone phase documents from PRD',
        nodeType: 'skill',
        dependsOn: ['prd'],
        parallelGroup: null,
        gateType: null,
        maxRetries: 2,
        phaseIndex: null,
      },
    ];

    // Phase 0 is always scaffolding — runs first
    nodes.push({
      id: 'phase-0-prompts',
      skillName: 'prompt-builder',
      displayName: 'Phase 0 Prompts',
      description: 'Generate prompts for project scaffolding',
      nodeType: 'skill',
      dependsOn: ['phases'],
      parallelGroup: null,
      gateType: null,
      maxRetries: 2,
      phaseIndex: 0,
    });

    nodes.push({
      id: 'phase-0-build',
      skillName: 'phase-executor',
      displayName: 'Phase 0 Build',
      description: 'Execute project scaffolding',
      nodeType: 'skill',
      dependsOn: ['phase-0-prompts'],
      parallelGroup: null,
      gateType: null,
      maxRetries: 2,
      phaseIndex: 0,
    });

    // Remaining phases depend on phase 0
    for (let i = 1; i < estimatedPhases; i++) {
      const group = `phase-group-${Math.ceil(i / 2)}`;

      nodes.push({
        id: `phase-${i}-prompts`,
        skillName: 'prompt-builder',
        displayName: `Phase ${i} Prompts`,
        description: `Generate prompts for phase ${i}`,
        nodeType: 'skill',
        dependsOn: ['phases', 'phase-0-build'],
        parallelGroup: null,
        gateType: null,
        maxRetries: 2,
        phaseIndex: i,
      });

      nodes.push({
        id: `phase-${i}-build`,
        skillName: 'phase-executor',
        displayName: `Phase ${i} Build`,
        description: `Execute phase ${i} code generation`,
        nodeType: 'skill',
        dependsOn: [`phase-${i}-prompts`],
        parallelGroup: group,
        gateType: null,
        maxRetries: 2,
        phaseIndex: i,
      });
    }

    // Verify after all phases complete
    const allBuildNodeIds = nodes
      .filter((n) => n.skillName === 'phase-executor')
      .map((n) => n.id);

    nodes.push({
      id: 'verify',
      skillName: '__verify__',
      displayName: 'Build Verification',
      description: 'Run npm install && npm run build to verify generated code',
      nodeType: 'verify',
      dependsOn: allBuildNodeIds,
      parallelGroup: null,
      gateType: null,
      maxRetries: 2,
      phaseIndex: null,
    });

    // Build edges from dependencies
    const edges = nodes.flatMap((n) =>
      n.dependsOn.map((dep) => ({ from: dep, to: n.id, condition: null }))
    );

    const parallelGroups = Array.from(new Set(nodes.map((n) => n.parallelGroup).filter(Boolean))) as string[];

    return {
      type: 'build',
      nodes,
      edges,
      estimatedPhases,
      parallelGroups,
    };
  }
}
