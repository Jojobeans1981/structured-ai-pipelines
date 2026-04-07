import Anthropic from '@anthropic-ai/sdk';
import { type ExecutionPlan, type DAGNode } from '@/src/types/dag';
import { DAGExecutor } from '@/src/services/dag-executor';
import { createWithFallback } from '@/src/lib/anthropic';

const SKILL_DISPLAY_NAMES: Record<string, string> = {
  'prd-architect': 'PRD Generation',
  'phase-builder': 'Phase Extraction',
  'prompt-builder': 'Prompt Generation',
  'prompt-validator': 'Prompt Validation',
  'phase-executor': 'Code Execution',
  'setup-analyzer': 'Setup Guide',
  'bug-intake': 'Bug Intake',
  'code-archaeologist': 'Code Archaeology',
  'root-cause-analyzer': 'Root Cause Analysis',
  'fix-planner': 'Fix Planning',
  'fix-prompt-builder': 'Fix Prompt Generation',
  'fix-executor': 'Fix Execution',
  'lessons-learned': 'Lessons Learned',
  '__verify__': 'Build Verification',
}

function buildFallbackDisplayName(node: Partial<DAGNode> & { id?: string }, index: number): string {
  const skillName = node.skillName ?? ''
  const phaseIndex = typeof node.phaseIndex === 'number' ? node.phaseIndex : null

  if (skillName === 'prompt-builder' && phaseIndex !== null) return `Phase ${phaseIndex} Prompts`
  if (skillName === 'phase-executor' && phaseIndex !== null) return `Phase ${phaseIndex} Build`
  if (skillName === 'fix-executor' && phaseIndex !== null) return `Fix Phase ${phaseIndex}`
  if (skillName && SKILL_DISPLAY_NAMES[skillName]) return SKILL_DISPLAY_NAMES[skillName]
  if (node.nodeType === 'verify') return 'Verification'
  if (node.nodeType === 'gate') return 'Approval Gate'
  return node.id?.trim() || `Stage ${index + 1}`
}

function normalizePlan(plan: ExecutionPlan): ExecutionPlan {
  const nodes = (plan.nodes ?? []).map((node, index) => {
    const displayName = typeof node.displayName === 'string' && node.displayName.trim().length > 0
      ? node.displayName.trim()
      : buildFallbackDisplayName(node, index)

    return {
      ...node,
      id: String(node.id ?? `node-${index + 1}`),
      skillName: node.skillName ?? null,
      displayName,
      description: typeof node.description === 'string' ? node.description : '',
      nodeType: node.nodeType ?? 'skill',
      dependsOn: Array.isArray(node.dependsOn) ? node.dependsOn : [],
      parallelGroup: node.parallelGroup ?? null,
      gateType: node.gateType ?? null,
      maxRetries: typeof node.maxRetries === 'number' ? node.maxRetries : 2,
      phaseIndex: typeof node.phaseIndex === 'number' ? node.phaseIndex : null,
    } satisfies DAGNode
  })

  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = Array.isArray(plan.edges)
    ? plan.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    : []

  return {
    ...plan,
    type: plan.type ?? 'build',
    estimatedPhases: typeof plan.estimatedPhases === 'number' ? plan.estimatedPhases : nodes.length,
    parallelGroups: Array.isArray(plan.parallelGroups) ? plan.parallelGroups : [],
    nodes,
    edges,
  }
}

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
- setup-analyzer: Analyze completed build and generate setup guide (prerequisites, env vars, commands)
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
   - Add a setup-analyzer node AFTER verify — this generates the setup guide automatically
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
    client: Anthropic,
    pipelineType: string = 'build'
  ): Promise<ExecutionPlan> {
    console.log(`[IntakeAgent] Generating ${pipelineType} plan for input (${userInput.length} chars)`);

    const typeHint = pipelineType !== 'build'
      ? `\n\nIMPORTANT: The user has explicitly selected "${pipelineType}" mode. Generate a ${pipelineType.toUpperCase()} pipeline, NOT a build pipeline.`
      : '';

    const response = await createWithFallback(client, {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: INTAKE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Generate an execution plan for this ${pipelineType} request:\n\n${userInput}${typeHint}`,
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
      plan = normalizePlan(JSON.parse(jsonMatch[1] || text));
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

    // Theme design and application run after verify to polish branding and demo styling.
    nodes.push({
      id: 'theme-design',
      skillName: 'theme-designer',
      displayName: 'UI Theme Design',
      description: 'Design three demo-friendly theme variants and ask the user to choose one',
      nodeType: 'skill',
      dependsOn: ['verify'],
      parallelGroup: null,
      gateType: null,
      maxRetries: 1,
      phaseIndex: null,
    });

    nodes.push({
      id: 'theme-apply',
      skillName: 'phase-executor',
      displayName: 'Theme Application',
      description: 'Apply the chosen theme styling to the app code',
      nodeType: 'skill',
      dependsOn: ['theme-design'],
      parallelGroup: null,
      gateType: null,
      maxRetries: 2,
      phaseIndex: null,
    });

    nodes.push({
      id: 'verify-theme',
      skillName: '__verify__',
      displayName: 'Theme Verification',
      description: 'Verify the themed app still builds successfully',
      nodeType: 'verify',
      dependsOn: ['theme-apply'],
      parallelGroup: null,
      gateType: null,
      maxRetries: 2,
      phaseIndex: null,
    });

    // Setup analyzer runs after themed verification so the final guide reflects the styled app.
    nodes.push({
      id: 'setup-guide',
      skillName: 'setup-analyzer',
      displayName: 'Setup Guide',
      description: 'Analyze the built project and generate a complete setup guide with prerequisites, env vars, and run commands',
      nodeType: 'skill',
      dependsOn: ['verify-theme'],
      parallelGroup: null,
      gateType: null,
      maxRetries: 1,
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

  /**
   * Default diagnostic plan — bug intake → trace → root cause → fix → verify.
   */
  static defaultDiagnosticPlan(): ExecutionPlan {
    const nodes: DAGNode[] = [
      { id: 'intake', skillName: 'bug-intake', displayName: 'Bug Intake', description: 'Collect bug information', nodeType: 'skill', dependsOn: [], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: 0 },
      { id: 'archaeologist', skillName: 'code-archaeologist', displayName: 'Code Archaeology', description: 'Trace bug through code', nodeType: 'skill', dependsOn: ['intake'], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: 1 },
      { id: 'root-cause', skillName: 'root-cause-analyzer', displayName: 'Root Cause Analysis', description: 'Find root cause', nodeType: 'skill', dependsOn: ['archaeologist'], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: 2 },
      { id: 'fix-plan', skillName: 'fix-planner', displayName: 'Fix Planning', description: 'Plan the fix', nodeType: 'skill', dependsOn: ['root-cause'], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: 3 },
      { id: 'fix-prompts', skillName: 'fix-prompt-builder', displayName: 'Fix Prompts', description: 'Generate fix prompts', nodeType: 'skill', dependsOn: ['fix-plan'], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: 4 },
      { id: 'fix-exec', skillName: 'fix-executor', displayName: 'Apply Fix', description: 'Execute the fix', nodeType: 'skill', dependsOn: ['fix-prompts'], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: 5 },
      { id: 'verify', skillName: '__verify__', displayName: 'Verify Fix', description: 'Verify the fix compiles', nodeType: 'verify', dependsOn: ['fix-exec'], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: null },
      { id: 'lessons', skillName: 'lessons-learned', displayName: 'Lessons Learned', description: 'Extract lessons from the fix', nodeType: 'skill', dependsOn: ['verify'], parallelGroup: null, gateType: null, maxRetries: 1, phaseIndex: null },
    ];
    const edges = nodes.flatMap((n) => n.dependsOn.map((dep) => ({ from: dep, to: n.id, condition: null })));
    return { type: 'diagnostic', nodes, edges, estimatedPhases: 6, parallelGroups: [] };
  }

  /**
   * Default enhance plan — PRD scoped to new feature → phases → build → verify.
   */
  static defaultEnhancePlan(estimatedPhases: number = 2): ExecutionPlan {
    const nodes: DAGNode[] = [
      { id: 'prd', skillName: 'prd-architect', displayName: 'Feature PRD', description: 'Generate PRD scoped to the new feature', nodeType: 'skill', dependsOn: [], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: null },
      { id: 'phases', skillName: 'phase-builder', displayName: 'Phase Extraction', description: 'Split feature into phases', nodeType: 'skill', dependsOn: ['prd'], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: null },
    ];

    for (let i = 0; i < estimatedPhases; i++) {
      nodes.push(
        { id: `phase-${i}-prompts`, skillName: 'prompt-builder', displayName: `Phase ${i} Prompts`, description: `Generate prompts for phase ${i}`, nodeType: 'skill', dependsOn: i === 0 ? ['phases'] : ['phases', `phase-${i - 1}-build`], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: i },
        { id: `phase-${i}-build`, skillName: 'phase-executor', displayName: `Phase ${i} Build`, description: `Execute phase ${i}`, nodeType: 'skill', dependsOn: [`phase-${i}-prompts`], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: i },
      );
    }

    const allBuildIds = nodes.filter((n) => n.skillName === 'phase-executor').map((n) => n.id);
    nodes.push(
      { id: 'verify', skillName: '__verify__', displayName: 'Build Verification', description: 'Verify enhanced project compiles', nodeType: 'verify', dependsOn: allBuildIds, parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: null },
      { id: 'theme-design', skillName: 'theme-designer', displayName: 'UI Theme Design', description: 'Design three demo-friendly theme variants and ask the user to choose one', nodeType: 'skill', dependsOn: ['verify'], parallelGroup: null, gateType: null, maxRetries: 1, phaseIndex: null },
      { id: 'theme-apply', skillName: 'phase-executor', displayName: 'Theme Application', description: 'Apply the chosen theme styling to the app code', nodeType: 'skill', dependsOn: ['theme-design'], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: null },
      { id: 'verify-theme', skillName: '__verify__', displayName: 'Theme Verification', description: 'Verify the themed app still builds successfully', nodeType: 'verify', dependsOn: ['theme-apply'], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: null },
      { id: 'setup-guide', skillName: 'setup-analyzer', displayName: 'Setup Guide', description: 'Generate setup guide', nodeType: 'skill', dependsOn: ['verify-theme'], parallelGroup: null, gateType: null, maxRetries: 1, phaseIndex: null },
    );

    const edges = nodes.flatMap((n) => n.dependsOn.map((dep) => ({ from: dep, to: n.id, condition: null })));
    return { type: 'enhance', nodes, edges, estimatedPhases, parallelGroups: [] };
  }

  /**
   * Default refactor plan — same as enhance but type is refactor.
   */
  static defaultRefactorPlan(estimatedPhases: number = 2): ExecutionPlan {
    const plan = IntakeAgent.defaultEnhancePlan(estimatedPhases);
    plan.type = 'refactor';
    // Refactor skips PRD — goes straight to phase-builder
    plan.nodes = plan.nodes.filter((n) => n.id !== 'prd');
    const phasesNode = plan.nodes.find((n) => n.id === 'phases');
    if (phasesNode) phasesNode.dependsOn = [];
    plan.edges = plan.nodes.flatMap((n) => n.dependsOn.map((dep) => ({ from: dep, to: n.id, condition: null })));
    return plan;
  }

  /**
   * Default test plan — analyze code → generate tests → verify.
   */
  static defaultTestPlan(): ExecutionPlan {
    const nodes: DAGNode[] = [
      { id: 'test-plan', skillName: 'prd-architect', displayName: 'Test Plan', description: 'Analyze code and plan test suite', nodeType: 'skill', dependsOn: [], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: 0 },
      { id: 'test-gen', skillName: 'phase-executor', displayName: 'Generate Tests', description: 'Generate test files', nodeType: 'skill', dependsOn: ['test-plan'], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: 1 },
      { id: 'verify', skillName: '__verify__', displayName: 'Run Tests', description: 'Verify tests pass', nodeType: 'verify', dependsOn: ['test-gen'], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: null },
    ];
    const edges = nodes.flatMap((n) => n.dependsOn.map((dep) => ({ from: dep, to: n.id, condition: null })));
    return { type: 'test', nodes, edges, estimatedPhases: 2, parallelGroups: [] };
  }

  /**
   * Default deploy plan — analyze project → generate deployment config → verify.
   */
  static defaultDeployPlan(): ExecutionPlan {
    const nodes: DAGNode[] = [
      { id: 'deploy-plan', skillName: 'prd-architect', displayName: 'Deploy Planning', description: 'Analyze project and plan deployment', nodeType: 'skill', dependsOn: [], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: 0 },
      { id: 'deploy-gen', skillName: 'phase-executor', displayName: 'Generate Config', description: 'Generate Dockerfile, CI, deployment config', nodeType: 'skill', dependsOn: ['deploy-plan'], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: 1 },
      { id: 'verify', skillName: '__verify__', displayName: 'Verify Config', description: 'Verify deployment config', nodeType: 'verify', dependsOn: ['deploy-gen'], parallelGroup: null, gateType: null, maxRetries: 2, phaseIndex: null },
    ];
    const edges = nodes.flatMap((n) => n.dependsOn.map((dep) => ({ from: dep, to: n.id, condition: null })));
    return { type: 'deploy', nodes, edges, estimatedPhases: 2, parallelGroups: [] };
  }

  /**
   * Get the right default plan for a given pipeline type.
   */
  static defaultPlanForType(type: string, estimatedPhases: number = 3): ExecutionPlan {
    switch (type) {
      case 'diagnostic': return IntakeAgent.defaultDiagnosticPlan();
      case 'enhance': return IntakeAgent.defaultEnhancePlan(estimatedPhases);
      case 'refactor': return IntakeAgent.defaultRefactorPlan(estimatedPhases);
      case 'test': return IntakeAgent.defaultTestPlan();
      case 'deploy': return IntakeAgent.defaultDeployPlan();
      default: return IntakeAgent.defaultBuildPlan(estimatedPhases);
    }
  }
}
