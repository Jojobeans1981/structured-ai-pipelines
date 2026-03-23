# Phase 2: Debug Pipeline Agents
## Project: Forge UI Integration

## Phase Objective
Port the 4 debug pipeline agents and debug pipeline orchestration from forge-ui, enabling bug diagnosis and fix generation against cloned repos.

## Current State (What Exists Before This Phase)
Phases 0 and 1 are complete.

### Existing Files (Phase 0 deliverables)
- `src/services/forge/types/conventions.ts` — exports `ConventionsProfileSchema`, `ConventionsProfile`
- `src/services/forge/types/prd.ts` — exports `PRDOutput`
- `src/services/forge/types/manifest.ts` — exports `ManifestFile`, `ImplementationManifest`
- `src/services/forge/types/scaffold.ts` — exports `ScaffoldedFile`
- `src/services/forge/types/bug.ts` — exports `BugReport`, `CodeLocation`, `CodeMap`
- `src/services/forge/types/fix.ts` — exports `FixPlanStep`, `RootCause`, `FixPlan`, `FixFile`
- `src/services/forge/types/sse.ts` — exports `SSELogEvent`, `SSEPlanEvent`, `SSEDiagnosisEvent`, `SSEDiffEvent`, `SSEStatusEvent`, `SSEDoneEvent`, `SSEEvent`
- `src/services/forge/db.ts` — exports all CRUD functions for forge models

### Existing Files (Phase 1 deliverables)
- `src/services/forge/utils/repo.ts` — exports `cloneRepo()`, `buildTree()`, `isGreenfield()`, `extractCodeSamples()`
- `src/services/forge/utils/markdown.ts` — exports `extractMarkdownText()`, `extractTextFromFile()`
- `src/services/forge/lessons-context.ts` — exports `buildForgeLessonsSection()`
- `src/services/forge/agents/analyzer-agent.ts` — exports `analyzeRepo()`
- `src/services/forge/agents/prd-agent.ts` — exports `generatePRD()`
- `src/services/forge/agents/prompt-agent.ts` — exports `generateManifest()`
- `src/services/forge/agents/scaffolder-agent.ts` — exports `scaffoldFile()`
- `src/services/forge/agents/validator-agent.ts` — exports `validateFiles()`
- `src/services/forge/build-pipeline.ts` — exports `runBuildPipelineStage1()`, `runBuildPipelineStage2()`

### Existing Files (Pre-existing project infrastructure)
- `src/lib/anthropic.ts` — exports `getAnthropicClient()`, `callWithRetry()`, `createWithFallback()`
- `src/lib/prisma.ts` — Prisma client singleton
- `src/services/skill-loader.ts` — `SkillLoader.getSkillPromptAsync(skillName)`

### Existing Data Models
All Forge models from Phase 0: `ForgeRun`, `ForgeRunLog`, `ForgeRunDiff`, `ForgeRunDiagnosis`, `ForgeRunResult`, `ForgeLessonLearned`

### Existing API Endpoints
No new forge API endpoints yet (Phase 5).

### Configured Environment
- `DATABASE_URL`, `ANTHROPIC_API_KEY`, GitLab OAuth, all npm packages installed

## Technical Architecture (Phase-Relevant Subset)

### Stack
- Anthropic SDK 0.79.0 via `src/lib/anthropic.ts`
- `simple-git@^3.27.0` for git clone (reusing Phase 1 `cloneRepo()`)
- Existing forge types from Phase 0

### Data Flow
```
Debug Pipeline Stage 1:
  Clone repo → buildTree() → extractCodeSamples()
    → structure BugReport from user input
    → mapCodePaths() [archaeologist-agent] → CodeMap
    → analyzeRootCause() [root-cause-agent] → RootCause
    → planFix() [fix-planner-agent] → FixPlan
    → save stage data, save ForgeRunDiagnosis, emit SSE events

Debug Pipeline Stage 2:
  Load stage data
    → for each fix step: scaffoldFix() [fix-scaffolder-agent] → FixFile
    → write files, run lint/test, save ForgeRunDiff, emit SSE events
```

### File Structure
```
src/services/forge/
├── types/              # EXISTS from Phase 0
├── db.ts               # EXISTS from Phase 0
├── utils/
│   ├── repo.ts         # EXISTS from Phase 1
│   └── markdown.ts     # EXISTS from Phase 1
├── lessons-context.ts  # EXISTS from Phase 1
├── agents/
│   ├── analyzer-agent.ts       # EXISTS from Phase 1
│   ├── prd-agent.ts            # EXISTS from Phase 1
│   ├── prompt-agent.ts         # EXISTS from Phase 1
│   ├── scaffolder-agent.ts     # EXISTS from Phase 1
│   ├── validator-agent.ts      # EXISTS from Phase 1
│   ├── archaeologist-agent.ts  # NEW
│   ├── root-cause-agent.ts     # NEW
│   ├── fix-planner-agent.ts    # NEW
│   └── fix-scaffolder-agent.ts # NEW
├── build-pipeline.ts   # EXISTS from Phase 1
└── debug-pipeline.ts   # NEW — Stage 1 + Stage 2 orchestration
```

## Deliverables
1. `src/services/forge/agents/archaeologist-agent.ts` — maps affected files and call chains
2. `src/services/forge/agents/root-cause-agent.ts` — root cause analysis with confidence
3. `src/services/forge/agents/fix-planner-agent.ts` — ordered fix steps
4. `src/services/forge/agents/fix-scaffolder-agent.ts` — generates fixed file contents
5. `src/services/forge/debug-pipeline.ts` — Stage 1 + Stage 2 orchestration

## Technical Specification

### Files to Create

#### `src/services/forge/agents/archaeologist-agent.ts`
- **Path:** `src/services/forge/agents/archaeologist-agent.ts`
- **Purpose:** Maps affected files, code locations, call chains, and entry points from a bug description and repo code
- **Key exports:** `mapCodePaths()`
- **Dependencies:** `@/src/lib/anthropic`, `../types/bug` (BugReport, CodeMap)
- **Details:**

```typescript
import type { BugReport, CodeMap } from '../types/bug'

// System prompt instructs the model to:
// - Identify which files are affected by the bug
// - Map specific code locations (file, lines, relevance, snippet)
// - Trace the call chain from entry point to bug manifestation
// - Identify the entry point
// User prompt includes: bug report, directory tree, code samples
// Response parsed as JSON matching CodeMap shape
export async function mapCodePaths(bugReport: BugReport, tree: string, codeSamples: string[]): Promise<CodeMap>
```

#### `src/services/forge/agents/root-cause-agent.ts`
- **Path:** `src/services/forge/agents/root-cause-agent.ts`
- **Purpose:** Identifies the definitive root cause of a bug with confidence level
- **Key exports:** `analyzeRootCause()`
- **Dependencies:** `@/src/lib/anthropic`, `../types/bug` (BugReport, CodeMap), `../types/fix` (RootCause)
- **Details:**

```typescript
import type { BugReport, CodeMap } from '../types/bug'
import type { RootCause } from '../types/fix'

// System prompt instructs the model to:
// - Analyze the bug report and code map
// - Identify the actual root cause (not just the symptom)
// - Explain why the root cause produces the observed behavior
// - List all affected files
// - Assign confidence level: high (clear evidence), medium (likely but uncertain), low (speculative)
// User prompt includes: bug report, code map (as JSON)
// Response parsed as JSON matching RootCause shape
export async function analyzeRootCause(bugReport: BugReport, codeMap: CodeMap): Promise<RootCause>
```

#### `src/services/forge/agents/fix-planner-agent.ts`
- **Path:** `src/services/forge/agents/fix-planner-agent.ts`
- **Purpose:** Plans ordered file changes to fix the root cause
- **Key exports:** `planFix()`
- **Dependencies:** `@/src/lib/anthropic`, `../types/bug` (BugReport, CodeMap), `../types/fix` (RootCause, FixPlan)
- **Details:**

```typescript
import type { BugReport, CodeMap } from '../types/bug'
import type { RootCause, FixPlan } from '../types/fix'

// System prompt instructs the model to:
// - Plan a minimal set of changes to fix the root cause
// - Each step specifies: file path, action (create | modify | delete), description
// - Order steps so dependencies are resolved first
// - Prefer targeted fixes over broad refactors
// - Include a summary of the overall fix approach
// User prompt includes: bug report, code map, root cause (all as JSON)
// Response parsed as JSON matching FixPlan shape
export async function planFix(bugReport: BugReport, rootCause: RootCause, codeMap: CodeMap): Promise<FixPlan>
```

#### `src/services/forge/agents/fix-scaffolder-agent.ts`
- **Path:** `src/services/forge/agents/fix-scaffolder-agent.ts`
- **Purpose:** Generates the corrected file content for a single fix step
- **Key exports:** `scaffoldFix()`
- **Dependencies:** `@/src/lib/anthropic`, `../types/fix` (FixPlanStep, RootCause, FixFile)
- **Details:**

```typescript
import type { FixPlanStep, RootCause, FixFile } from '../types/fix'

// System prompt instructs the model to:
// - Implement the targeted fix described in the step
// - Preserve all existing functionality
// - Add appropriate error handling
// - No hardcoded secrets
// - Match the existing code style
// User prompt includes: fix step (file, action, description), existing file content (or null for create),
//                        root cause explanation
// Returns FixFile { path, content } — the complete corrected file content
export async function scaffoldFix(step: FixPlanStep, existingContent: string | null, rootCause: RootCause): Promise<FixFile>
```

#### `src/services/forge/debug-pipeline.ts`
- **Path:** `src/services/forge/debug-pipeline.ts`
- **Purpose:** Orchestrates the two-stage debug pipeline
- **Key exports:** `runDebugPipelineStage1()`, `runDebugPipelineStage2()`
- **Dependencies:** All debug agent modules, `./utils/repo` (cloneRepo, buildTree, extractCodeSamples), `./db` (updateForgeRun, addForgeRunLog, saveForgeRunDiagnosis, saveForgeRunDiff), `./types/sse` (SSEEvent), `./types/bug` (BugReport), `fs`, `path`, `child_process` (execSync)
- **Details:**

```typescript
import type { SSEEvent } from './types/sse'
import type { BugReport } from './types/bug'

const STAGE_DATA_FILE = '.forge-debug-stage-data.json'

interface DebugStageData {
  bugReport: BugReport
  codeMap: CodeMap
  rootCause: RootCause
  fixPlan: FixPlan
  conventions: ConventionsProfile | null  // may be null if analysis was skipped
}

export async function runDebugPipelineStage1(opts: {
  runId: string
  bugDescription: string
  repoUrl: string
  emit: (event: SSEEvent) => void
}): Promise<void>
// Stage 1 steps:
// 1. Create temp dir: /tmp/forge-{runId}
// 2. Clone repo via cloneRepo()
// 3. Build directory tree via buildTree(dir, 3)
// 4. Extract code samples via extractCodeSamples(dir, 5, 80)
// 5. Structure BugReport from bugDescription:
//    { description: bugDescription, errorLogs: extracted from description, symptoms: extracted from description }
// 6. emit log: "[Archaeologist] Mapping affected code paths..."
// 7. Call mapCodePaths(bugReport, tree, codeSamples) → CodeMap
// 8. emit log: "[RootCause] Analyzing root cause..."
// 9. Call analyzeRootCause(bugReport, codeMap) → RootCause
// 10. emit log: "[FixPlanner] Planning fix steps..."
// 11. Call planFix(bugReport, rootCause, codeMap) → FixPlan
// 12. Save DebugStageData to STAGE_DATA_FILE in work dir
// 13. Save ForgeRunDiagnosis via saveForgeRunDiagnosis()
// 14. emit diagnosis event
// 15. emit plan event with rootCause, affectedFiles, fixPlan
// 16. Add logs to DB

export async function runDebugPipelineStage2(opts: {
  runId: string
  repoUrl: string
  emit: (event: SSEEvent) => void
}): Promise<void>
// Stage 2 steps:
// 1. Load DebugStageData from STAGE_DATA_FILE
// 2. fixFiles: FixFile[] = []
// 3. For each step in fixPlan.steps:
//    a. Read existing file content from work dir (null if action === 'create')
//    b. emit log: "[FixScaffold] Generating fix for {step.file}..."
//    c. Call scaffoldFix(step, existingContent, rootCause) → FixFile
//    d. Push to fixFiles
// 4. Write all fix files to work dir
// 5. Detect lint/test commands from the repo (check package.json scripts, Makefile, etc.)
// 6. Run lint command if available (try/catch, non-fatal)
// 7. Run test command if available (try/catch, non-fatal)
// 8. Save ForgeRunDiff via saveForgeRunDiff()
// 9. emit diff event
// 10. Add logs to DB
```

## Coding Standards
- **TypeScript:** Strict mode, interfaces at file top, Zod for runtime validation of LLM outputs
- **React:** Functional components, `'use client'` directive, Zustand for state, shadcn/Radix for UI primitives
- **Services:** Class-based or module-level functions (match existing pattern — `learning-store.ts` uses module functions, `dag-executor.ts` uses class)
- **API Routes:** Next.js App Router, `export const dynamic = 'force-dynamic'` on SSE routes, `getServerSession()` for auth
- **Streaming:** SSE via `TransformStream` + `TextEncoder` (match existing `/api/pipeline/[runId]/stream`)
- **Database:** Prisma client singleton from `src/lib/prisma.ts`
- **LLM Calls:** Use `callWithRetry()` and `createWithFallback()` from `src/lib/anthropic.ts` for all agent calls
- **Errors:** try-catch with typed error messages, no unhandled rejections
- **Files:** Lowercase kebab-case, named exports
- **Comments:** Minimal, `[Step]` prefixed console logs for pipeline tracing

## Acceptance Criteria
- [ ] Each agent function compiles without TS errors
- [ ] `debug-pipeline.ts` exports `runDebugPipelineStage1` and `runDebugPipelineStage2`
- [ ] `mapCodePaths()` returns a valid CodeMap with affectedFiles, locations, callChain, entryPoint
- [ ] `analyzeRootCause()` returns a RootCause with cause, explanation, affectedFiles, confidence
- [ ] `planFix()` returns a FixPlan with ordered steps and summary
- [ ] `scaffoldFix()` returns a FixFile with path and content
- [ ] Debug Stage 1 produces a CodeMap, RootCause, and FixPlan from a bug description
- [ ] Debug Stage 2 produces FixFiles from a FixPlan and saves ForgeRunDiff
- [ ] All existing tests pass (`npm test`)

## Constraints
- Do NOT create any API routes — those belong to Phase 5
- Do NOT create any UI components — those belong to Phase 4
- Do NOT modify the build pipeline agents or build-pipeline.ts from Phase 1
- Do NOT create the GitLab publish function — that belongs to Phase 3
- Agent system prompts are hardcoded strings in this phase; Phase 6 migrates them to the Skill DB
- All LLM calls must go through `src/lib/anthropic.ts` utilities

## Dependencies
- **Packages:** All installed in Phase 0
- **API keys required:** `ANTHROPIC_API_KEY` (existing, for LLM calls)
- **External services:** Anthropic API (for agent calls), Git (for clone operations)
