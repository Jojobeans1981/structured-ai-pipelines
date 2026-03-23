# Phase 5: API Routes & Pages
## Project: Forge UI Integration

## Phase Objective
Wire up the API routes that connect the UI components to the pipeline services, build the page-level components, and add sidebar navigation — making the forge feature fully functional end-to-end.

## Current State (What Exists Before This Phase)
Phases 0–4 are complete.

### Existing Files (Phase 0 deliverables)
- `src/services/forge/types/*` — All type definitions
- `src/services/forge/db.ts` — All CRUD functions: `createForgeRun`, `getForgeRun`, `getForgeRunWithDetails`, `listForgeRuns`, `updateForgeRun`, `addForgeRunLog`, `saveForgeRunDiff`, `saveForgeRunDiagnosis`, `saveForgeRunResult`, `addForgeLessonLearned`, `getForgeLessonsForContext`

### Existing Files (Phase 1 deliverables)
- `src/services/forge/utils/repo.ts` — `cloneRepo()`, `buildTree()`, `isGreenfield()`, `extractCodeSamples()`
- `src/services/forge/utils/markdown.ts` — `extractMarkdownText()`, `extractTextFromFile()`
- `src/services/forge/lessons-context.ts` — `buildForgeLessonsSection()`
- `src/services/forge/agents/*` — 5 build agents
- `src/services/forge/build-pipeline.ts` — `runBuildPipelineStage1()`, `runBuildPipelineStage2()`

### Existing Files (Phase 2 deliverables)
- `src/services/forge/agents/archaeologist-agent.ts` — `mapCodePaths()`
- `src/services/forge/agents/root-cause-agent.ts` — `analyzeRootCause()`
- `src/services/forge/agents/fix-planner-agent.ts` — `planFix()`
- `src/services/forge/agents/fix-scaffolder-agent.ts` — `scaffoldFix()`
- `src/services/forge/debug-pipeline.ts` — `runDebugPipelineStage1()`, `runDebugPipelineStage2()`

### Existing Files (Phase 3 deliverables)
- `src/services/forge/utils/publish.ts` — `publishToGitLab()`, `getGitLabToken()`

### Existing Files (Phase 4 deliverables)
- `src/components/forge/mode-selector.tsx` — `ModeSelector`
- `src/components/forge/build-form.tsx` — `BuildForm`
- `src/components/forge/debug-form.tsx` — `DebugForm`
- `src/components/forge/run-status-badge.tsx` — `RunStatusBadge`
- `src/components/forge/mode-badge.tsx` — `ModeBadge`
- `src/components/forge/log-viewer.tsx` — `LogViewer`
- `src/components/forge/plan-approval.tsx` — `PlanApproval`
- `src/components/forge/diff-viewer.tsx` — `DiffViewer`
- `src/components/forge/diagnosis-panel.tsx` — `DiagnosisPanel`
- `src/stores/forge-store.ts` — `useForgeStore`
- `src/hooks/use-forge-stream.ts` — `useForgeStream()`

### Existing Files (Pre-existing project infrastructure)
- `src/lib/auth.ts` — NextAuth config, exports `authOptions`
- `src/lib/prisma.ts` — Prisma client singleton
- `src/components/layout/sidebar.tsx` — Main app sidebar navigation

### Existing Data Models
All Forge models from Phase 0 + all existing models untouched.

### Existing API Endpoints
All existing `/api/pipeline/`, `/api/projects/`, etc. routes. No forge routes yet.

### Configured Environment
All env vars from prior phases. No new ones needed.

## Technical Architecture (Phase-Relevant Subset)

### Stack
- Next.js 14.2.35 App Router
- NextAuth 4.24.13 for session auth
- SSE via `TransformStream` + `TextEncoder`
- Zod for request validation

### Data Flow
```
POST /api/forge/runs
  → createForgeRun() → return runId → client navigates to /forge/runs/[id]

GET /api/forge/runs/[id]/stream (SSE)
  → runBuildPipelineStage1() or runDebugPipelineStage1()
  → emits log/plan/diagnosis events → client receives via EventSource
  → run status → awaiting_approval, stage: plan

GET /api/forge/runs/[id]/advance (SSE)
  → runBuildPipelineStage2() or runDebugPipelineStage2()
  → emits log/diff events → client receives via EventSource
  → run status → awaiting_approval, stage: code

POST /api/forge/runs/[id]/approve
  → getGitLabToken() → publishToGitLab() → saveForgeRunResult()
  → run status → complete

POST /api/forge/runs/[id]/reject
  → updateForgeRun(status: 'rejected')
```

### File Structure
```
app/
├── forge/
│   ├── page.tsx                    # NEW — Forge home
│   └── runs/
│       ├── page.tsx                # NEW — Run history
│       └── [id]/
│           └── page.tsx            # NEW — Run detail
├── api/forge/
│   ├── runs/
│   │   ├── route.ts               # NEW — POST + GET
│   │   └── [id]/
│   │       ├── route.ts           # NEW — GET details
│   │       ├── stream/route.ts    # NEW — Stage 1 SSE
│   │       ├── advance/route.ts   # NEW — Stage 2 SSE
│   │       ├── approve/route.ts   # NEW — Publish MR
│   │       └── reject/route.ts    # NEW — Reject

src/components/layout/
└── sidebar.tsx                     # MODIFY — add Forge link
```

## Deliverables
1. `app/api/forge/runs/route.ts` — POST (create) + GET (list)
2. `app/api/forge/runs/[id]/route.ts` — GET (details)
3. `app/api/forge/runs/[id]/stream/route.ts` — GET (Stage 1 SSE)
4. `app/api/forge/runs/[id]/advance/route.ts` — GET (Stage 2 SSE)
5. `app/api/forge/runs/[id]/approve/route.ts` — POST (publish MR)
6. `app/api/forge/runs/[id]/reject/route.ts` — POST (reject)
7. `app/forge/page.tsx` — Forge home page with mode selector + forms
8. `app/forge/runs/page.tsx` — Run history list
9. `app/forge/runs/[id]/page.tsx` — Run detail with real-time updates
10. Updated `src/components/layout/sidebar.tsx` — add "Forge" navigation link

## Technical Specification

### Files to Create

#### `app/api/forge/runs/route.ts`
- **Path:** `app/api/forge/runs/route.ts`
- **Purpose:** Create and list forge runs
- **Key exports:** `POST`, `GET` (Next.js route handlers)
- **Dependencies:** `next/server` (NextResponse), `next-auth` (getServerSession), `@/src/lib/auth` (authOptions), `@/src/services/forge/db`, `@/src/services/forge/utils/markdown`, `zod`
- **Details:**

```typescript
export const dynamic = 'force-dynamic'

// POST handler:
// 1. getServerSession() → if no session, return 401
// 2. Check content-type:
//    - multipart/form-data: extract repoUrl, specFile from FormData
//      - Convert file buffer to text via extractTextFromFile()
//      - Create run with mode='build'
//    - application/json: parse body, validate with Zod schemas
//      - BuildJsonSchema: { mode: 'build', repoUrl: string.url, specContent: string.min(1), specFilename?: string, branchName?: string }
//      - DebugJsonSchema: { mode: 'debug', repoUrl: string.url, bugDescription: string.min(1), branchName?: string }
// 3. createForgeRun(session.user.id, data)
// 4. Return { runId: run.id }

// GET handler:
// 1. getServerSession() → if no session, return 401
// 2. listForgeRuns(session.user.id)
// 3. Return runs array
```

#### `app/api/forge/runs/[id]/route.ts`
- **Path:** `app/api/forge/runs/[id]/route.ts`
- **Purpose:** Get forge run details with related data
- **Key exports:** `GET`
- **Dependencies:** `next/server`, `next-auth`, `@/src/services/forge/db`
- **Details:**

```typescript
export const dynamic = 'force-dynamic'

// GET handler:
// 1. getServerSession() → if no session, return 401
// 2. getForgeRunWithDetails(params.id)
// 3. If not found, return 404
// 4. If run.userId !== session.user.id, return 403
// 5. Return { run, logs, diff, diagnosis, result }
```

#### `app/api/forge/runs/[id]/stream/route.ts`
- **Path:** `app/api/forge/runs/[id]/stream/route.ts`
- **Purpose:** Stage 1 SSE stream — runs build or debug pipeline Stage 1
- **Key exports:** `GET`
- **Dependencies:** `@/src/services/forge/db`, `@/src/services/forge/build-pipeline`, `@/src/services/forge/debug-pipeline`, `@/src/services/forge/types/sse`
- **Details:**

```typescript
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// GET handler:
// 1. getServerSession() → if no session, return 401
// 2. getForgeRun(params.id) → if not found, return 404
// 3. If run.status !== 'pending', return 409 ('Run already started or completed')
// 4. Create TransformStream + TextEncoder
// 5. Create emit function: (event: SSEEvent) => write `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
// 6. Start async pipeline (void, not awaited):
//    a. updateForgeRun(runId, { status: 'running' })
//    b. try:
//       - if mode === 'build': await runBuildPipelineStage1({ runId, specContent, repoUrl, emit })
//       - if mode === 'debug': await runDebugPipelineStage1({ runId, bugDescription, repoUrl, emit })
//       - updateForgeRun(runId, { status: 'awaiting_approval', stage: 'plan' })
//    c. catch: updateForgeRun(runId, { status: 'failed', error: message })
//    d. finally: writer.close()
// 7. Return Response with readable stream, headers: Content-Type text/event-stream, Cache-Control no-cache, Connection keep-alive, X-Accel-Buffering no
```

#### `app/api/forge/runs/[id]/advance/route.ts`
- **Path:** `app/api/forge/runs/[id]/advance/route.ts`
- **Purpose:** Stage 2 SSE stream — called after plan approval
- **Key exports:** `GET`
- **Dependencies:** `@/src/services/forge/db`, `@/src/services/forge/build-pipeline`, `@/src/services/forge/debug-pipeline`, `@/src/services/forge/types/sse`
- **Details:**

```typescript
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// GET handler:
// 1. getServerSession() → if no session, return 401
// 2. getForgeRun(params.id) → if not found, return 404
// 3. If run.status !== 'awaiting_approval' || run.stage !== 'plan', return 409
// 4. Create TransformStream + TextEncoder + emit function
// 5. Start async pipeline:
//    a. updateForgeRun(runId, { status: 'running', stage: null })
//    b. try:
//       - if mode === 'build': await runBuildPipelineStage2({ runId, repoUrl, emit })
//       - if mode === 'debug': await runDebugPipelineStage2({ runId, repoUrl, emit })
//       - updateForgeRun(runId, { status: 'awaiting_approval', stage: 'code' })
//    c. catch: updateForgeRun(runId, { status: 'failed', error: message })
//    d. finally: writer.close()
// 6. Return SSE Response
```

#### `app/api/forge/runs/[id]/approve/route.ts`
- **Path:** `app/api/forge/runs/[id]/approve/route.ts`
- **Purpose:** Publish approved code as a GitLab merge request
- **Key exports:** `POST`
- **Dependencies:** `next/server`, `next-auth`, `@/src/services/forge/db`, `@/src/services/forge/utils/publish`, `fs` (rmSync), `path` (join)
- **Details:**

```typescript
export const dynamic = 'force-dynamic'

// POST handler:
// 1. getServerSession() → if no session, return 401
// 2. getForgeRunWithDetails(params.id) → if not found, return 404
// 3. If run.status !== 'awaiting_approval' || run.stage !== 'code', return 409
// 4. If no diff, return 409
// 5. updateForgeRun(runId, { status: 'publishing' })
// 6. getGitLabToken(session.user.id) — may throw if no token
// 7. Compute workDir: join('/tmp', `forge-${runId}`)
// 8. Compute title:
//    - build: run.prdTitle ?? `forge: feature from run ${runId.slice(0, 8)}`
//    - debug: `forge: fix from debug run ${runId.slice(0, 8)}`
// 9. Compute description:
//    - build: run.prdSummary ?? ''
//    - debug: `Automated fix generated by Forge debug pipeline.\nRun ID: ${runId}`
// 10. publishToGitLab({ workDir, repoUrl, files: diff.files, branchName, title, description, token })
// 11. saveForgeRunResult(runId, result)
// 12. updateForgeRun(runId, { status: 'complete', completedAt: new Date().toISOString(), branchName: result.branch })
// 13. Try rmSync(workDir, { recursive: true, force: true }) — non-fatal
// 14. Return result
// On error: updateForgeRun(runId, { status: 'failed', error: message }), return 500
```

#### `app/api/forge/runs/[id]/reject/route.ts`
- **Path:** `app/api/forge/runs/[id]/reject/route.ts`
- **Purpose:** Reject a run at any approval stage
- **Key exports:** `POST`
- **Dependencies:** `next/server`, `next-auth`, `@/src/services/forge/db`
- **Details:**

```typescript
export const dynamic = 'force-dynamic'

// POST handler:
// 1. getServerSession() → if no session, return 401
// 2. getForgeRun(params.id) → if not found, return 404
// 3. If run.status !== 'awaiting_approval', return 409
// 4. updateForgeRun(runId, { status: 'rejected', completedAt: new Date().toISOString() })
// 5. Return { success: true }
// Note: Working directory is preserved for potential retry (future enhancement)
```

#### `app/forge/page.tsx`
- **Path:** `app/forge/page.tsx`
- **Purpose:** Forge home page — mode selector with build and debug forms
- **Key exports:** default page component
- **Dependencies:** `@/src/components/forge/mode-selector`
- **Details:**
  - Server component (no 'use client')
  - Renders header "Forge" + description
  - Renders `<ModeSelector />` in a centered card
  - Link to run history: `/forge/runs`
  - Consistent dark theme

#### `app/forge/runs/page.tsx`
- **Path:** `app/forge/runs/page.tsx`
- **Purpose:** Run history list page
- **Key exports:** default page component
- **Dependencies:** `next-auth` (getServerSession), `@/src/lib/auth`, `@/src/services/forge/db` (listForgeRuns), `@/src/components/forge/mode-badge`, `@/src/components/forge/run-status-badge`
- **Details:**
  - Server component
  - Fetch session, redirect to login if unauthenticated
  - Fetch runs via `listForgeRuns(session.user.id)`
  - Render table/list with columns: Mode (ModeBadge), Status (RunStatusBadge), Title/ID, Repo URL (truncated), Created date
  - Each row links to `/forge/runs/${run.id}`
  - "New Run" button links to `/forge`
  - Empty state: "No runs yet"

#### `app/forge/runs/[id]/page.tsx`
- **Path:** `app/forge/runs/[id]/page.tsx`
- **Purpose:** Run detail page with real-time updates
- **Key exports:** default page component
- **Dependencies:** `next-auth`, `@/src/services/forge/db` (getForgeRunWithDetails), all forge components
- **Details:**
  - Server component that fetches run details
  - Renders a client component `RunDetailView` that:
    - Initializes forge store from server-fetched data
    - Shows header: ModeBadge, RunStatusBadge, stage badge, title, repo URL
    - Shows error if run failed
    - Shows DiagnosisPanel if debug mode with diagnosis (when not at plan approval)
    - Shows LogViewer (always)
    - Shows PlanApproval when status=awaiting_approval, stage=plan
    - Shows DiffViewer when status=awaiting_approval, stage=code
    - Shows MR result when status=complete (link to MR)
    - Shows rejected state with link to start new run
    - "← History" link to `/forge/runs`

### Files to Modify

#### `src/components/layout/sidebar.tsx`
- **Current state:** Contains navigation links to existing pages (Dashboard, Projects, Pipeline, Metrics, Settings, etc.)
- **Changes:** Add a "Forge" link to the navigation items, pointing to `/forge`
- **Reason:** Users need to access the forge feature from the main navigation

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
- [ ] Creating a build run via the form navigates to the run detail page
- [ ] Creating a debug run via the form navigates to the run detail page
- [ ] Stage 1 SSE streams log events to the log viewer
- [ ] Stage 1 ends at awaiting_approval with stage=plan
- [ ] Plan approval triggers Stage 2 SSE
- [ ] Stage 2 SSE streams log events and ends at awaiting_approval with stage=code
- [ ] Approving code publishes MR and shows result with link
- [ ] Rejecting at plan stage marks run as rejected
- [ ] Rejecting at code stage marks run as rejected
- [ ] Run history page lists all user's runs sorted by date
- [ ] Run detail page loads existing run state on mount
- [ ] Unauthorized access to any API route returns 401
- [ ] Accessing another user's run returns 403
- [ ] Sidebar shows "Forge" navigation link
- [ ] All existing tests pass (`npm test`)
- [ ] `npm run build` succeeds

## Constraints
- Do NOT modify any existing API routes under `/api/pipeline/`
- Do NOT modify any existing pages
- Do NOT modify the forge service modules from Phases 1-3 (except calling their exported functions)
- All routes under `/api/forge/` must require authentication via `getServerSession()`
- SSE routes must set `maxDuration = 300`
- The approve route must clean up the temp directory after publishing

## Dependencies
- **Packages:** All already installed
- **API keys required:** GitLab access token (from Account, at runtime for publish)
- **External services:** GitLab API (for MR publish), Anthropic API (for pipeline execution)
