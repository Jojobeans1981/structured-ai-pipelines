# Gauntlet Forge DAG Engine — Product Requirements Document

## 1. Executive Summary

Gauntlet Forge currently executes pipelines as a fixed linear sequence: PRD → Phases → Prompts → Validation → Execution. Every run follows the same 5 (or 8) stages regardless of project complexity. The phase-executor runs once and generates scaffolding for one phase — it doesn't loop through all phases, doesn't write files to disk, and doesn't verify that the code compiles.

This upgrade transforms the pipeline engine from a linear stage runner into a **DAG-based execution engine** where:
- An intake agent classifies the request and generates a custom execution graph
- Phases with no dependencies run in parallel
- The phase-executor loops through ALL phases (not just one)
- Generated code is written to disk, installed, and build-verified
- A triage agent handles failures by routing back to the right stage

**Core value proposition:** Go from "idea" to "runnable project on disk" in one pipeline run, with human approval at meaningful checkpoints — not at every stage.

## 2. Goals & Success Metrics

### Primary Goals
- Replace linear `currentStageIndex` execution with DAG-based topological execution
- Auto-classify input to determine pipeline type (build/diagnostic/refactor)
- Execute ALL phases of a build — not just scaffolding
- Write generated files to disk and verify they compile
- Support parallel execution of independent phases

### Success Metrics
- A build pipeline run produces a directory with installable, buildable code
- `npm install && npm run build` (or equivalent) passes on generated output
- Multi-phase projects complete without manual re-triggering per phase
- Pipeline graph is visible to the user before execution begins

### Out of Scope
- Multi-repo / multi-language factory (single project per run)
- CI/CD integration (no auto-PR creation)
- Live code editing during pipeline execution
- Agent-to-agent communication outside the DAG structure
- Custom skill creation UI

## 3. User Stories

**Persona: Builder** — Engineer using Forge to build a project from a description.

- **P0:** As a Builder, I want the pipeline to generate ALL phases of my project so that I get a complete, working codebase — not just phase 1 scaffolding.
- **P0:** As a Builder, I want generated code written to a real directory on disk so that I can `cd` into it and run it.
- **P0:** As a Builder, I want to see the execution plan (DAG) before it runs so that I can approve or modify the approach.
- **P0:** As a Builder, I want the system to verify generated code compiles after each phase so that errors are caught early.
- **P1:** As a Builder, I want independent phases to run in parallel so that builds complete faster.
- **P1:** As a Builder, I want to respond to stage questions without losing context so that the conversation flows naturally.
- **P1:** As a Builder, I want a triage agent to handle failures intelligently so that a broken phase doesn't kill the entire run.
- **P2:** As a Builder, I want the system to auto-detect whether I need a build, fix, or refactor pipeline based on my input.

## 4. Technical Architecture

### 4.1 Stack & Dependencies

No new dependencies. This upgrade modifies existing services and data models within the current Next.js 14 + Prisma + PostgreSQL + Anthropic SDK stack.

### 4.2 System Architecture

```
User Input
    │
    ▼
┌─────────────────┐
│  Intake Agent    │  Classifies: build / diagnostic / refactor
│  (Claude call)   │  Generates: execution DAG
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ★ HUMAN GATE   │  User sees DAG, approves/edits plan
│  Plan Approval   │
└────────┬────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│              DAG Executor                      │
│                                                │
│  Topological sort → concurrent ready nodes     │
│                                                │
│  ┌──────────┐                                  │
│  │ PRD Gen   │                                  │
│  └─────┬────┘                                  │
│        │                                        │
│  ┌─────▼──────┐                                │
│  │ Phase Split │                                │
│  └──┬─────┬───┘                                │
│     │     │                                     │
│  ┌──▼──┐ ┌▼────┐  (parallel if independent)   │
│  │Ph 1 │ │Ph 2 │                               │
│  │Build│ │Build│                               │
│  └──┬──┘ └──┬──┘                               │
│     │       │                                   │
│  ┌──▼───────▼──┐                               │
│  │  Ph 3 Build  │  (depends on Ph 1 + Ph 2)    │
│  └──────┬──────┘                               │
│         │                                       │
│  ┌──────▼──────┐                               │
│  │ Verify Build │  npm install && npm run build │
│  └──────┬──────┘                               │
│         │                                       │
│    ┌────▼─────┐                                │
│    │ Triage   │  On failure: retry / reroute   │
│    └──────────┘                                │
└──────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  ★ HUMAN GATE   │  Final review of generated project
│  Final Review    │
└─────────────────┘
```

### 4.3 Data Models

#### New: GraphNode (replaces linear PipelineStage for DAG runs)

The existing `PipelineStage` model is extended with graph fields:

```
PipelineStage (extended):
  + dependsOn     String[]     // IDs of stages this depends on
  + nodeType      String       // 'agent' | 'skill' | 'verify' | 'gate'
  + parallelGroup String?      // group ID for concurrent execution
  + retryCount    Int          // times this node has been retried
  + maxRetries    Int          // max retries before escalation (default 2)
  + outputDir     String?      // disk path for file-writing stages
```

#### New: ExecutionPlan (stored on PipelineRun)

```
PipelineRun (extended):
  + executionPlan  Json?       // serialized DAG: { nodes: [], edges: [] }
  + planApproved   Boolean     // false until user approves the DAG
  + outputPath     String?     // base directory for generated project files
```

### 4.4 API Surface

Existing endpoints remain. New additions:

```
POST /api/pipeline/[runId]/plan/approve
  Body: { editedPlan?: Json }
  Response: { success: true, nextNodes: string[] }

GET  /api/pipeline/[runId]/graph
  Response: { nodes: GraphNode[], edges: Edge[] }

POST /api/pipeline/[runId]/nodes/[nodeId]/stream
  SSE stream for a specific node (replaces stage-index-based streaming)

POST /api/pipeline/[runId]/verify
  Triggers build verification on the output directory
  Response: { success: boolean, output: string, errors: string[] }
```

### 4.5 File Structure

New and modified files:

```
src/
  services/
    dag-executor.ts          # NEW - topological DAG execution engine
    intake-agent.ts          # NEW - classifies input, generates DAG
    triage-agent.ts          # NEW - handles failures, decides retry/reroute
    build-verifier.ts        # NEW - runs npm install/build on output dir
    disk-writer.ts           # NEW - writes extracted files to disk
    pipeline-engine.ts       # MODIFY - add DAG-aware state transitions
    stage-executor.ts        # MODIFY - accept node context instead of linear context
    file-manager.ts          # MODIFY - write to disk in addition to DB
  stores/
    pipeline-store.ts        # MODIFY - DAG state instead of linear stage array
  types/
    pipeline.ts              # MODIFY - add DAG types, node types
    dag.ts                   # NEW - DAG type definitions
  hooks/
    use-pipeline-stream.ts   # MODIFY - multi-node streaming support
  components/
    pipeline/
      dag-view.tsx           # NEW - visual DAG with node status
      plan-approval.tsx      # NEW - DAG approval gate UI
      parallel-progress.tsx  # NEW - shows concurrent node execution
      build-output.tsx       # NEW - shows npm install/build output
      pipeline-view.tsx      # MODIFY - switch between linear and DAG views
app/
  api/
    pipeline/
      [runId]/
        graph/route.ts       # NEW - get DAG structure
        plan/
          approve/route.ts   # NEW - approve execution plan
        nodes/
          [nodeId]/
            stream/route.ts  # NEW - SSE for specific node
        verify/route.ts      # NEW - build verification endpoint
prisma/
  schema.prisma              # MODIFY - add DAG fields
```

## 5. Coding Standards

Per the existing codebase patterns:
- Class-based services (`DAGExecutor`, `IntakeAgent`, `TriageAgent`, `BuildVerifier`, `DiskWriter`)
- Async generators for streaming
- AbortController for cancellation
- `[Stage]` prefixed console logs
- Named exports everywhere
- Prisma transactions for multi-record state changes
- Zod validation at API boundaries

## 6. Implementation Phases

---

### Phase 0: Data Model & Type Foundation

#### Objective
Extend the database schema and TypeScript types to support DAG execution without breaking existing linear pipelines.

#### Prerequisites
- Existing Prisma schema with PipelineRun and PipelineStage models

#### Deliverables
1. Extended Prisma schema with DAG fields on PipelineStage and PipelineRun
2. New TypeScript types for DAG nodes, edges, and execution plans
3. Database migration applied
4. Existing linear pipelines continue to work unchanged

#### Technical Specification

**Prisma schema changes:**

PipelineStage gets new optional fields:
- `dependsOn String[] @default([])` — array of stage IDs this node waits on
- `nodeType String @default("skill")` — one of: `agent`, `skill`, `verify`, `gate`
- `parallelGroup String?` — identifies concurrent execution groups
- `retryCount Int @default(0)` — current retry count
- `maxRetries Int @default(2)` — max retries before escalation
- `outputDir String?` — disk path for this node's file output

PipelineRun gets new optional fields:
- `executionPlan Json?` — the full DAG structure
- `planApproved Boolean @default(false)` — whether user approved the plan
- `outputPath String?` — base path for the generated project on disk

**New types file** `src/types/dag.ts`:
- `DAGNodeType = 'agent' | 'skill' | 'verify' | 'gate'`
- `DAGNode { id, skillName, displayName, nodeType, dependsOn, parallelGroup, gateType? }`
- `DAGEdge { from, to, condition? }`
- `ExecutionPlan { nodes: DAGNode[], edges: DAGEdge[] }`
- `NodeStatus` extending existing StageStatus with parallel awareness

#### Acceptance Criteria
- [ ] `npx prisma migrate dev` succeeds
- [ ] Existing linear pipeline runs still work (backward compatible)
- [ ] New DAG type definitions compile without errors
- [ ] Can create a PipelineStage with `dependsOn` populated

---

### Phase 1: DAG Executor Core

#### Objective
Build the execution engine that walks a DAG topologically, running ready nodes concurrently and respecting dependency edges.

#### Prerequisites
- Phase 0 complete (schema + types)

#### Deliverables
1. `DAGExecutor` service that processes execution plans
2. Topological sort with concurrent execution of independent nodes
3. Node state management (pending → running → complete → approved)
4. Dependency resolution: a node starts only when ALL `dependsOn` nodes are approved
5. Integration with existing `StageExecutor` for skill nodes

#### Technical Specification

**`src/services/dag-executor.ts`:**

```typescript
class DAGExecutor {
  // Get all nodes whose dependencies are satisfied and status is 'pending'
  static async getReadyNodes(runId: string): Promise<PipelineStage[]>

  // Execute a single node (delegates to StageExecutor for skill nodes)
  static async executeNode(runId: string, nodeId: string, client: Anthropic): AsyncGenerator<string>

  // Advance the DAG after a node completes/is approved
  static async advanceDAG(runId: string): Promise<{ nextNodes: PipelineStage[], runComplete: boolean }>

  // Check if all nodes are complete
  static async isDAGComplete(runId: string): Promise<boolean>
}
```

**Execution logic:**
1. After plan approval, call `advanceDAG()` to find ready nodes
2. For each ready node, mark it `running` and start execution
3. Skill nodes use existing `StageExecutor`
4. Gate nodes pause for human approval
5. Agent nodes call Claude with a specialized system prompt
6. Verify nodes run `BuildVerifier`
7. After each node completes, call `advanceDAG()` again
8. Repeat until all nodes are complete or a failure occurs

**Parallel execution:**
- `advanceDAG()` returns ALL ready nodes, not just one
- The SSE stream route handles multiple concurrent nodes
- Each node gets its own SSE connection

#### Acceptance Criteria
- [ ] DAGExecutor can topologically sort a graph with dependencies
- [ ] Independent nodes are identified and returned together by `getReadyNodes()`
- [ ] A node does not start until all its `dependsOn` nodes are approved
- [ ] Circular dependency detection throws an error at plan time
- [ ] Existing linear pipelines work through DAGExecutor (linear graph = special case)

---

### Phase 2: Intake Agent & Plan Generation

#### Objective
Build the agent that classifies user input and generates a custom execution DAG.

#### Prerequisites
- Phase 1 complete (DAG executor)

#### Deliverables
1. `IntakeAgent` service that calls Claude to classify input and generate a DAG
2. Plan generation that creates the correct nodes for the project's complexity
3. Plan approval UI where the user sees and can edit the DAG before execution
4. API endpoint for plan approval

#### Technical Specification

**`src/services/intake-agent.ts`:**

```typescript
class IntakeAgent {
  // Classify input and generate execution plan
  static async generatePlan(
    userInput: string,
    client: Anthropic
  ): Promise<ExecutionPlan>
}
```

The intake agent's system prompt instructs Claude to:
1. Classify the request (build / diagnostic / refactor)
2. Estimate project complexity (number of phases)
3. Generate a DAG with the right nodes:
   - For build: PRD → Phase Split → [Phase N Build nodes with dependencies] → Verify → Final Gate
   - For diagnostic: Bug Intake → Trace → Root Cause → [Fix nodes] → Verify
4. Identify which phases can parallelize
5. Set human gates at: plan approval, after PRD, after final build verification

**Output format** (JSON the agent returns):
```json
{
  "type": "build",
  "nodes": [
    { "id": "prd", "skillName": "prd-architect", "displayName": "PRD Generation", "nodeType": "skill", "dependsOn": [] },
    { "id": "phases", "skillName": "phase-builder", "displayName": "Phase Extraction", "nodeType": "skill", "dependsOn": ["prd"] },
    { "id": "phase-1-prompts", "skillName": "prompt-builder", "displayName": "Phase 1 Prompts", "nodeType": "skill", "dependsOn": ["phases"] },
    { "id": "phase-1-build", "skillName": "phase-executor", "displayName": "Phase 1 Build", "nodeType": "skill", "dependsOn": ["phase-1-prompts"] },
    { "id": "phase-2-prompts", "skillName": "prompt-builder", "displayName": "Phase 2 Prompts", "nodeType": "skill", "dependsOn": ["phases"] },
    { "id": "phase-2-build", "skillName": "phase-executor", "displayName": "Phase 2 Build", "nodeType": "skill", "dependsOn": ["phase-2-prompts"] },
    { "id": "verify", "skillName": "build-verifier", "displayName": "Build Verification", "nodeType": "verify", "dependsOn": ["phase-1-build", "phase-2-build"] },
    { "id": "final-gate", "skillName": null, "displayName": "Final Review", "nodeType": "gate", "dependsOn": ["verify"] }
  ],
  "edges": [...]
}
```

**Plan Approval UI** (`src/components/pipeline/plan-approval.tsx`):
- Renders the DAG as a visual node graph
- Each node shows: name, type, dependencies
- Parallel nodes shown side by side
- User can approve or request re-plan with feedback

**API endpoint** `POST /api/pipeline/[runId]/plan/approve`:
- Sets `planApproved = true` on the run
- Calls `DAGExecutor.advanceDAG()` to start first nodes

#### Acceptance Criteria
- [ ] Intake agent generates valid DAG JSON from natural language input
- [ ] Generated plan has correct dependency ordering
- [ ] Plan approval UI renders the DAG visually
- [ ] Approving the plan starts execution of the first ready nodes
- [ ] Rejecting the plan with feedback re-generates a new plan

---

### Phase 3: Disk Writer & Build Verifier

#### Objective
Make the pipeline produce real, runnable projects on disk — not just database records.

#### Prerequisites
- Phase 1 complete (DAG executor)

#### Deliverables
1. `DiskWriter` service that writes extracted files to a directory on disk
2. `BuildVerifier` service that runs install + build commands and reports results
3. Integration with `FileManager` — files go to BOTH database and disk
4. Output directory management (create, track, clean up)

#### Technical Specification

**`src/services/disk-writer.ts`:**

```typescript
class DiskWriter {
  // Create output directory for a project run
  static async initOutputDir(projectName: string, runId: string): Promise<string>

  // Write a single file to disk
  static async writeFile(outputDir: string, filePath: string, content: string): Promise<void>

  // Write all extracted files from an artifact to disk
  static async writeArtifactFiles(outputDir: string, artifactContent: string): Promise<number>

  // Write package.json if not already present (inferred from PRD)
  static async ensurePackageJson(outputDir: string, projectContext: string): Promise<void>
}
```

Output directory: `~/forge-output/{project-name}-{short-run-id}/`

**`src/services/build-verifier.ts`:**

```typescript
class BuildVerifier {
  // Detect project type from files present (package.json → Node, requirements.txt → Python, etc.)
  static detectProjectType(outputDir: string): Promise<'node' | 'python' | 'go' | 'static' | 'unknown'>

  // Run the appropriate install + build commands
  static async verify(outputDir: string): Promise<{
    success: boolean;
    installOutput: string;
    buildOutput: string;
    errors: string[];
    warnings: string[];
  }>
}
```

Verification commands by project type:
- `node`: `npm install && npm run build` (or `npx tsc --noEmit` if no build script)
- `python`: `pip install -r requirements.txt` (if present)
- `go`: `go build ./...`
- `static`: just verify HTML/CSS/JS files are syntactically valid
- `unknown`: skip verification, warn user

**Integration with FileManager:**
Modify `FileManager.extractAndSaveFiles()` to also call `DiskWriter.writeArtifactFiles()` when the run has an `outputPath` set.

**Modify `PipelineEngine.completeStage()`:**
After file extraction, if the run has `outputPath`, also write to disk.

#### Acceptance Criteria
- [ ] After a phase-executor stage completes, files exist on disk at `outputPath`
- [ ] `BuildVerifier.verify()` runs `npm install && npm run build` and captures output
- [ ] Verification results are displayed to the user in the pipeline UI
- [ ] A build failure triggers the triage agent (Phase 4)
- [ ] Output directory is created with proper structure (not flat files)

---

### Phase 4: Triage Agent & Failure Recovery

#### Objective
Handle failures intelligently instead of just stopping the pipeline.

#### Prerequisites
- Phase 1 (DAG executor), Phase 3 (build verifier)

#### Deliverables
1. `TriageAgent` service that diagnoses failures and decides recovery action
2. Retry logic with modified prompts incorporating error context
3. Reroute logic to re-execute earlier nodes when needed
4. Human escalation when retries are exhausted

#### Technical Specification

**`src/services/triage-agent.ts`:**

```typescript
class TriageAgent {
  // Analyze a failure and decide what to do
  static async triage(
    failedNode: PipelineStage,
    error: string,
    runContext: PipelineRun,
    client: Anthropic
  ): Promise<TriageDecision>
}

type TriageDecision =
  | { action: 'retry'; nodeId: string; modifiedContext: string }
  | { action: 'reroute'; targetNodeId: string; reason: string }
  | { action: 'escalate'; reason: string }  // pause for human
```

**Triage logic flow:**
1. Build verification fails → Triage agent reads error output
2. Agent classifies the error:
   - **Syntax/type error in one file** → retry the phase-executor node that generated it, with error context added
   - **Missing dependency** → retry with instruction to add it to package.json
   - **Architectural mismatch between phases** → reroute to the earlier phase that produced the conflicting contract
   - **Fundamental misunderstanding** → escalate to human with diagnosis
3. Retry up to `maxRetries` (default 2) per node
4. After max retries, escalate to human

**Integration with DAGExecutor:**
After a verify node fails, DAGExecutor calls `TriageAgent.triage()` instead of marking the run as failed. The triage decision modifies the DAG state and re-queues the appropriate node.

#### Acceptance Criteria
- [ ] Build failure triggers triage instead of pipeline failure
- [ ] Triage agent correctly classifies common error types
- [ ] Retry includes the error output in the re-execution context
- [ ] After maxRetries, the pipeline pauses for human input
- [ ] Human can approve the triage agent's recommendation or override it

---

### Phase 5: Multi-Phase Execution Loop

#### Objective
Make the pipeline execute ALL phases of a project, not just one.

#### Prerequisites
- Phase 0-3 complete

#### Deliverables
1. Phase-builder output parsed into individual phase nodes
2. Each phase gets its own prompt-builder → phase-executor chain
3. Phases with no cross-dependencies execute in parallel
4. Files accumulate on disk across phases (each phase builds on prior output)
5. Build verification after each phase and after all phases complete

#### Technical Specification

**Dynamic DAG expansion:**
After the phase-builder stage completes and is approved, the system:
1. Parses the phase-builder output to extract individual phases
2. For each phase, creates nodes: `phase-N-prompts` → `phase-N-build` → `phase-N-verify`
3. Sets dependencies: phase-N-build depends on phase-N-prompts AND all prior phases it references
4. Updates the execution plan in the database
5. Shows the expanded DAG to the user (informational, auto-approved since the original plan was approved)

**Context accumulation:**
Each phase-executor node receives:
- The PRD (from the prd-architect node)
- Its specific phase document (from phase-builder output)
- Its specific prompts (from its prompt-builder node)
- ALL files generated by prior phases (read from disk at `outputPath`)
- The current file tree listing

This means phase 3 can reference components created in phase 1 because they're on disk and included in context.

**File accumulation:**
- Phase 1 writes files to `outputPath`
- Phase 2 reads `outputPath` file listing, writes additional/modified files
- Phase 3 reads the full accumulated `outputPath`
- Build verification runs on the complete `outputPath` after all phases

#### Acceptance Criteria
- [ ] A 3-phase PRD produces 3 sets of prompt-builder → phase-executor chains
- [ ] Each phase's executor receives prior phase files as context
- [ ] Files accumulate on disk across phases (not overwritten unless intentional)
- [ ] `npm install && npm run build` passes after all phases complete
- [ ] The user sees all phases in the DAG view with their current status

---

### Phase 6: DAG Visualization UI

#### Objective
Replace the linear progress bar with a visual DAG renderer that shows the execution graph.

#### Prerequisites
- Phase 0-2 complete (DAG types and executor)

#### Deliverables
1. DAG visualization component showing nodes, edges, and status
2. Parallel nodes rendered side-by-side
3. Real-time status updates as nodes execute
4. Plan approval interface within the DAG view
5. Build verification output display

#### Technical Specification

**`src/components/pipeline/dag-view.tsx`:**
- Renders nodes as cards arranged in topological layers
- Layer 0: intake/PRD nodes (top)
- Layer N: nodes whose longest dependency path is N
- Nodes in the same layer with no mutual dependency render side-by-side
- Edges drawn as lines/arrows between nodes
- Node colors follow forge theme: pending=zinc, running=orange pulse, approved=emerald, failed=red

**Node card contents:**
- Icon based on nodeType (skill=Flame, agent=Brain, verify=Shield, gate=User)
- Display name
- Status badge
- Duration (when complete)
- Click to expand: shows artifact content or streaming output

**Parallel execution display:**
- Nodes in the same parallelGroup render in a row
- A "parallel" indicator connects them visually
- Progress shows as "2 of 3 parallel nodes complete"

**Integration with pipeline-view.tsx:**
- Detect if run has `executionPlan` → show DAG view
- Otherwise → show legacy linear view (backward compatible)

**Build output component** (`src/components/pipeline/build-output.tsx`):
- Terminal-style display of npm install/build output
- Color-coded: errors in red, warnings in amber, success in green
- Shows file count, install time, build time

#### Acceptance Criteria
- [ ] DAG renders correctly for a 3-phase build pipeline
- [ ] Parallel nodes display side-by-side
- [ ] Node status updates in real-time during execution
- [ ] Clicking a node shows its output/artifact
- [ ] Build verification output renders in terminal style
- [ ] Legacy linear pipelines still render correctly

---

## 7. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Claude generates invalid DAG (circular deps) | H | M | Validate DAG structure before presenting to user; reject and re-generate |
| Build verification kills long-running processes | H | L | Timeout all child processes at 120s; use AbortController |
| Parallel node execution overwhelms Anthropic API rate limits | M | M | Limit concurrent Claude calls to 2; queue additional nodes |
| Disk writes to unintended paths | H | L | Sandbox output to `~/forge-output/` only; validate all paths are relative |
| Phase context exceeds Claude's context window | H | M | Summarize prior phase artifacts; send file listing not file contents for large projects |
| User edits plan into invalid DAG | M | L | Re-validate after edit; show errors inline |

## 8. Dependencies & Environment

### Existing (no changes)
- PostgreSQL via Prisma
- Anthropic Claude API (claude-sonnet-4-20250514)
- NextAuth with GitLab OAuth
- Next.js 14 App Router

### New requirements
- `child_process.execSync` or `spawn` for running npm install/build (Node.js built-in, no new deps)
- File system access for `DiskWriter` (Node.js `fs` built-in)
- Output directory: `~/forge-output/` (configurable via env var `FORGE_OUTPUT_DIR`)

### Environment variables
```
FORGE_OUTPUT_DIR=~/forge-output   # where generated projects are written to disk
FORGE_MAX_PARALLEL=2              # max concurrent Claude API calls
FORGE_BUILD_TIMEOUT=120000        # build verification timeout in ms
```

## 9. Phase Dependencies Summary

```
Phase 0 (Schema)     ← no deps
Phase 1 (DAG Core)   ← Phase 0
Phase 2 (Intake)     ← Phase 1
Phase 3 (Disk/Build) ← Phase 1
Phase 4 (Triage)     ← Phase 1, Phase 3
Phase 5 (Multi-Phase)← Phase 0, 1, 2, 3
Phase 6 (DAG UI)     ← Phase 0, 1, 2
```

Phases 2, 3, and 6 can be built in parallel after Phase 1.
Phase 4 requires Phase 3.
Phase 5 requires everything else.
