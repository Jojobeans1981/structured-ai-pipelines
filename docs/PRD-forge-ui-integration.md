# Forge UI Integration — Product Requirements Document

## 1. Executive Summary

Gauntlet Forge currently generates code projects from plain-language descriptions, producing downloadable ZIPs. A parallel codebase (`forge-ui`) was built with features intended for the main project: typed build/debug agents, two-stage approval flow, GitLab MR publishing, spec file ingestion, and a run history UI. These features need to be ported into the existing structured-ai-pipelines architecture (Prisma, Anthropic SDK, NextAuth, Zustand, shadcn/Radix).

**Core value: Forge gains the ability to clone real repos, analyze conventions, generate targeted code, and publish merge requests — with human approval gates at plan and code stages.**

## 2. Goals & Success Metrics

### Primary Goals
- Port all forge-ui build pipeline agents (analyzer, PRD, prompt, scaffolder, validator) into the main project as database-stored skills
- Port all forge-ui debug pipeline agents (archaeologist, root-cause, fix-planner, fix-scaffolder) as database-stored skills
- Add GitLab MR publishing (clone → branch → commit → push → open MR)
- Add two-stage approval flow as the default (plan approval → code approval → publish)
- Add spec file ingestion (MD/TXT), run history pages, and supporting UI

### Success Criteria
- User can submit a feature spec (text or file) + GitLab repo URL → get a merge request
- User can submit a bug description + GitLab repo URL → get a fix merge request
- Two-stage approval works: plan review → code review → MR published
- Run history page shows all runs with status, mode, timestamps
- All existing features (auto-pilot, DAG executor, metrics, learning store) continue to work
- New Prisma models created and migrated without data loss

### Out of Scope
- PDF file parsing (deferred — start with MD/TXT only)
- Retry-with-feedback after rejection (future enhancement)
- Supabase migration (we are NOT migrating to Supabase)
- Mastra agent framework (we use direct Anthropic SDK)

## 3. User Stories & Personas

### Persona: Developer (existing)
Already uses Forge to generate projects from descriptions.

### User Stories

**P0 — Must Have**
- As a developer, I want to submit a feature spec + repo URL so that Forge generates code that matches my repo's conventions and opens a GitLab MR
- As a developer, I want to submit a bug description + repo URL so that Forge diagnoses the bug, generates a fix, and opens a GitLab MR
- As a developer, I want to review the PRD/diagnosis before code generation starts so that I can reject bad plans early
- As a developer, I want to review generated code before it becomes an MR so that nothing unexpected ships
- As a developer, I want to see a history of all my runs so that I can track what Forge has done
- As a developer, I want past validation failures to inform future runs so that Forge improves over time

**P1 — Should Have**
- As a developer, I want to upload a .md or .txt spec file instead of pasting text
- As a developer, I want to see real-time streaming logs during pipeline execution
- As a developer, I want lint and test results shown alongside generated code

## 4. Technical Architecture

### 4.1 Stack & Dependencies

**Existing (unchanged):**
- Next.js 14.2.35, React 18, TypeScript 5
- Prisma 5.22.0 + Neon PostgreSQL
- NextAuth 4.24.13 + GitLab OAuth
- Anthropic SDK 0.79.0
- Zustand 5.0.12
- shadcn/Radix UI, Tailwind CSS 3.4.1

**New dependencies to add:**
- `@gitbeaker/rest` ^41.0.0 — GitLab API client (MR creation, branch management). Chosen over raw fetch because it's well-typed, handles pagination, and the project already authenticates with GitLab.
- `gray-matter` ^4.0.3 — YAML front-matter extraction from markdown specs
- `marked` ^12.0.0 — Markdown-to-text conversion for spec ingestion
- `simple-git` ^3.27.0 — Git clone/checkout for repo analysis

### 4.2 System Architecture

```
User submits spec + repo URL
    ↓
POST /api/forge/runs (creates ForgeRun record)
    ↓
GET /api/forge/runs/[id]/stream (SSE — Stage 1)
    ↓
┌─ Build Mode ─────────────────────┐  ┌─ Debug Mode ──────────────────────┐
│ 1. Clone repo                    │  │ 1. Clone repo                     │
│ 2. Analyze conventions           │  │ 2. Structure bug report           │
│ 3. Generate PRD                  │  │ 3. Map affected code (archaeol.)  │
│ 4. Emit plan for review          │  │ 4. Analyze root cause             │
│                                  │  │ 5. Generate fix plan              │
│                                  │  │ 6. Emit diagnosis for review      │
└──────────────────────────────────┘  └───────────────────────────────────┘
    ↓
Status: awaiting_approval, stage: plan
    ↓
User approves plan → GET /api/forge/runs/[id]/advance (SSE — Stage 2)
    ↓
┌─ Build Mode ─────────────────────┐  ┌─ Debug Mode ──────────────────────┐
│ 5. Generate implementation       │  │ 7. Scaffold fix files             │
│    manifest (file list + deps)   │  │ 8. Run lint/tests                 │
│ 6. Scaffold each file            │  │ 9. Emit diff for code review      │
│ 7. Validate (6-phase, 3 cycles)  │  │                                   │
│ 8. Run lint/tests                │  │                                   │
│ 9. Emit diff for code review     │  │                                   │
└──────────────────────────────────┘  └───────────────────────────────────┘
    ↓
Status: awaiting_approval, stage: code
    ↓
User approves code → POST /api/forge/runs/[id]/approve
    ↓
Publish to GitLab (branch → commit → push → open MR)
    ↓
Status: complete (MR URL stored)
```

### 4.3 Data Models (New Prisma Models)

These are NEW models added alongside existing ones. Existing models (PipelineRun, PipelineStage, etc.) are untouched.

```prisma
model ForgeRun {
  id              String    @id @default(cuid())
  userId          String
  mode            String    // 'build' | 'debug'
  status          String    @default("pending") // pending | running | awaiting_approval | publishing | complete | failed | rejected
  stage           String?   // 'plan' | 'code' — which approval gate we're at
  repoUrl         String
  branchName      String?
  specContent     String?   @db.Text
  specFilename    String?
  bugDescription  String?   @db.Text
  prdTitle        String?
  prdSummary      String?
  error           String?   @db.Text
  createdAt       DateTime  @default(now())
  completedAt     DateTime?

  user       User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  logs       ForgeRunLog[]
  diff       ForgeRunDiff?
  diagnosis  ForgeRunDiagnosis?
  result     ForgeRunResult?
  lessons    ForgeLessonLearned[]

  @@index([userId, createdAt])
}

model ForgeRunLog {
  id        String   @id @default(cuid())
  runId     String
  step      String
  level     String   // info | warn | error | success
  message   String   @db.Text
  createdAt DateTime @default(now())

  run ForgeRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@index([runId, createdAt])
}

model ForgeRunDiff {
  id          String   @id @default(cuid())
  runId       String   @unique
  files       Json     // Array<{ path: string, content: string }>
  lintPassed  Boolean  @default(false)
  testsPassed Boolean  @default(false)
  errors      Json     @default("[]") // string[]
  createdAt   DateTime @default(now())

  run ForgeRun @relation(fields: [runId], references: [id], onDelete: Cascade)
}

model ForgeRunDiagnosis {
  id            String   @id @default(cuid())
  runId         String   @unique
  rootCause     String   @db.Text
  affectedFiles Json     // string[]
  fixPlan       Json     // Array<{ file: string, action: string, description: string }>
  createdAt     DateTime @default(now())

  run ForgeRun @relation(fields: [runId], references: [id], onDelete: Cascade)
}

model ForgeRunResult {
  id        String   @id @default(cuid())
  runId     String   @unique
  mrUrl     String
  mrIid     Int
  branch    String
  title     String
  createdAt DateTime @default(now())

  run ForgeRun @relation(fields: [runId], references: [id], onDelete: Cascade)
}

model ForgeLessonLearned {
  id             String   @id @default(cuid())
  runId          String?
  phase          Int
  phaseName      String
  error          String   @db.Text
  fix            String   @db.Text
  rootCause      String   @db.Text
  preventionRule String   @db.Text
  language       String?
  framework      String?
  createdAt      DateTime @default(now())

  run ForgeRun? @relation(fields: [runId], references: [id], onDelete: SetNull)

  @@index([createdAt])
  @@index([language])
}
```

Also add to the existing `User` model:
```prisma
forgeRuns ForgeRun[]
```

### 4.4 API Surface

All new routes live under `/api/forge/` to avoid conflicts with existing `/api/pipeline/` routes.

| Method | Path | Purpose | Request | Response |
|--------|------|---------|---------|----------|
| POST | `/api/forge/runs` | Create run | `{ mode, repoUrl, specContent?, bugDescription?, branchName? }` or multipart form data | `{ runId }` |
| GET | `/api/forge/runs` | List user's runs | — | `ForgeRun[]` |
| GET | `/api/forge/runs/[id]` | Run details | — | `{ run, logs, diff, diagnosis, result }` |
| GET | `/api/forge/runs/[id]/stream` | Stage 1 SSE | — | SSE stream (log, plan, diagnosis, status events) |
| GET | `/api/forge/runs/[id]/advance` | Stage 2 SSE | — | SSE stream (log, diff, status events) |
| POST | `/api/forge/runs/[id]/approve` | Publish MR | — | `{ mrUrl, mrIid, branch, title }` |
| POST | `/api/forge/runs/[id]/reject` | Reject run | — | `{ success: true }` |

**Authentication:** All routes require NextAuth session. User ID derived from `getServerSession()`.

**SSE Event Types:**
- `log` — `{ step, level, message }`
- `plan` — `{ prdTitle, prdSummary, prdFullText }` (build) or `{ rootCause, affectedFiles, fixPlan, stage: 'plan' }` (debug)
- `diagnosis` — `{ rootCause, affectedFiles, fixPlan }`
- `diff` — `{ files, lintPassed, testsPassed, errors }`
- `status` — `{ status, stage? }`
- `done` — stream closed

### 4.5 File Structure

New files to create (organized by concern):

```
src/
├── services/forge/
│   ├── build-pipeline.ts          # Stage 1 + Stage 2 orchestration for build mode
│   ├── debug-pipeline.ts          # Stage 1 + Stage 2 orchestration for debug mode
│   ├── agents/
│   │   ├── analyzer-agent.ts      # Repo convention detection
│   │   ├── prd-agent.ts           # PRD generation from spec + conventions
│   │   ├── prompt-agent.ts        # Implementation manifest generation
│   │   ├── scaffolder-agent.ts    # Individual file code generation
│   │   ├── validator-agent.ts     # 6-phase validation with auto-fix
│   │   ├── archaeologist-agent.ts # Code path mapping for bugs
│   │   ├── root-cause-agent.ts    # Root cause analysis
│   │   ├── fix-planner-agent.ts   # Fix step planning
│   │   └── fix-scaffolder-agent.ts# Fix code generation
│   ├── types/
│   │   ├── conventions.ts         # ConventionsProfile Zod schema
│   │   ├── prd.ts                 # PRDOutput interface
│   │   ├── manifest.ts            # ManifestFile, ImplementationManifest
│   │   ├── scaffold.ts            # ScaffoldedFile
│   │   ├── bug.ts                 # BugReport, CodeMap, CodeLocation
│   │   ├── fix.ts                 # RootCause, FixPlan, FixFile
│   │   └── sse.ts                 # SSE event type definitions
│   ├── utils/
│   │   ├── markdown.ts            # MD/TXT text extraction
│   │   ├── repo.ts                # Git clone, tree building, greenfield detection
│   │   └── publish.ts             # GitLab MR publishing via Gitbeaker
│   ├── db.ts                      # Prisma CRUD for ForgeRun and related models
│   └── lessons-context.ts         # Load past lessons into agent prompts
│
├── components/forge/
│   ├── build-form.tsx             # Feature spec + repo URL form
│   ├── debug-form.tsx             # Bug description + repo URL form
│   ├── mode-selector.tsx          # Build/Debug tab toggle
│   ├── run-status-badge.tsx       # Color-coded status pill
│   ├── mode-badge.tsx             # Build/Debug mode indicator
│   ├── log-viewer.tsx             # Real-time SSE log display
│   ├── plan-approval.tsx          # PRD/diagnosis review + approve/reject
│   ├── diff-viewer.tsx            # Generated code review + approve/reject
│   └── diagnosis-panel.tsx        # Root cause + affected files + fix plan
│
├── stores/
│   └── forge-store.ts             # Zustand store for forge run state
│
├── hooks/
│   └── use-forge-stream.ts        # SSE connection hook for forge runs

app/
├── forge/
│   ├── page.tsx                   # Forge home — mode selector + forms
│   └── runs/
│       ├── page.tsx               # Run history list
│       └── [id]/
│           └── page.tsx           # Run detail with real-time updates
│
├── api/forge/
│   ├── runs/
│   │   ├── route.ts              # POST (create) + GET (list)
│   │   └── [id]/
│   │       ├── route.ts          # GET (details)
│   │       ├── stream/route.ts   # GET (Stage 1 SSE)
│   │       ├── advance/route.ts  # GET (Stage 2 SSE)
│   │       ├── approve/route.ts  # POST (publish MR)
│   │       └── reject/route.ts   # POST (reject)
```

## 5. Coding Standards

Derived from the existing codebase:

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

## 6. Implementation Phases

---

### Phase 0: Database Schema & Dependencies

#### Objective
Add new Prisma models and npm dependencies required by all subsequent phases.

#### Prerequisites
- Existing project builds and tests pass

#### Deliverables
1. Prisma migration adding ForgeRun, ForgeRunLog, ForgeRunDiff, ForgeRunDiagnosis, ForgeRunResult, ForgeLessonLearned models
2. Updated User model with `forgeRuns` relation
3. New npm dependencies installed: `@gitbeaker/rest`, `gray-matter`, `marked`, `simple-git`
4. Type definition files for forge pipeline types
5. Forge-specific Prisma CRUD module (`src/services/forge/db.ts`)
6. SSE event type definitions (`src/services/forge/types/sse.ts`)

#### Technical Specification

**Prisma schema additions:** As defined in Section 4.3 above.

**Type files to create:**
- `src/services/forge/types/conventions.ts` — ConventionsProfile Zod schema (language, framework, packageManager, test/lint/build commands, naming conventions, code style samples)
- `src/services/forge/types/prd.ts` — PRDOutput interface (title, summary, fullText)
- `src/services/forge/types/manifest.ts` — ManifestFile (path, description, dependencies[]), ImplementationManifest (files[])
- `src/services/forge/types/scaffold.ts` — ScaffoldedFile (path, content)
- `src/services/forge/types/bug.ts` — BugReport (description, errorLogs, symptoms), CodeLocation (file, lines, relevance, snippet), CodeMap (affectedFiles, locations, callChain, entryPoint)
- `src/services/forge/types/fix.ts` — RootCause (cause, explanation, affectedFiles, confidence), FixPlan (steps, summary), FixFile (path, content), FixPlanStep (file, action, description)
- `src/services/forge/types/sse.ts` — SSEEvent union type, SSEDiffEvent, SSEDiagnosisEvent, SSEPlanEvent, SSELogEvent

**Prisma CRUD (`src/services/forge/db.ts`):**
- `createForgeRun(userId, data)` → ForgeRun
- `getForgeRun(id)` → ForgeRun | null
- `getForgeRunWithDetails(id)` → { run, logs, diff, diagnosis, result }
- `listForgeRuns(userId)` → ForgeRun[]
- `updateForgeRun(id, data)` → ForgeRun
- `addForgeRunLog(runId, { step, level, message })` → ForgeRunLog
- `saveForgeRunDiff(runId, { files, lintPassed, testsPassed, errors })` → ForgeRunDiff
- `saveForgeRunDiagnosis(runId, { rootCause, affectedFiles, fixPlan })` → ForgeRunDiagnosis
- `saveForgeRunResult(runId, { mrUrl, mrIid, branch, title })` → ForgeRunResult
- `addForgeLessonLearned(data)` → ForgeLessonLearned
- `getForgeLessonsForContext(language?, framework?)` → ForgeLessonLearned[]

#### Acceptance Criteria
- `npx prisma migrate dev` succeeds without errors
- `npx prisma generate` succeeds
- All type files export their types without TS errors
- `db.ts` compiles and all CRUD functions have correct Prisma types
- Existing tests still pass (`npm test`)

---

### Phase 1: Build Pipeline Agents

#### Objective
Port the 5 build pipeline agents from forge-ui into the main project as service modules that call the Anthropic SDK directly, plus the repo analysis utilities.

#### Prerequisites
- Phase 0 complete (types and DB layer exist)

#### Deliverables
1. `src/services/forge/utils/repo.ts` — git clone, tree building, greenfield detection, code sample extraction
2. `src/services/forge/utils/markdown.ts` — MD/TXT text extraction
3. `src/services/forge/lessons-context.ts` — builds prompt section from past ForgeLessonLearned records
4. `src/services/forge/agents/analyzer-agent.ts` — analyzes cloned repo, returns ConventionsProfile
5. `src/services/forge/agents/prd-agent.ts` — generates PRD from spec + conventions
6. `src/services/forge/agents/prompt-agent.ts` — generates implementation manifest
7. `src/services/forge/agents/scaffolder-agent.ts` — generates individual file contents
8. `src/services/forge/agents/validator-agent.ts` — 6-phase validation with auto-fix
9. `src/services/forge/build-pipeline.ts` — Stage 1 (clone → analyze → PRD) and Stage 2 (manifest → scaffold → validate → lint/test)

#### Technical Specification

**Agent pattern:** Each agent is a module that exports a single async function. The function:
1. Builds a system prompt and user prompt
2. Calls `createWithFallback()` from `src/lib/anthropic.ts` to get the Anthropic client
3. Uses `client.messages.create()` with the appropriate model
4. Parses the response, validates with Zod where applicable
5. Returns typed output

Example agent signature:
```typescript
// src/services/forge/agents/analyzer-agent.ts
export async function analyzeRepo(repoDir: string, tree: string, codeSamples: string[]): Promise<ConventionsProfile>
```

**Agent implementations (ported from forge-ui, adapted to Anthropic SDK):**

1. **analyzer-agent** — System prompt instructs the model to analyze repo structure and code samples. Returns ConventionsProfile validated with ConventionsProfileSchema.

2. **prd-agent** — Takes spec content, conventions, greenfield flag, lessons context. Returns PRDOutput { title, summary, fullText }.

3. **prompt-agent** — Takes PRD full text, conventions. Returns ImplementationManifest { files[] } with dependency ordering enforced.

4. **scaffolder-agent** — Takes single file description, conventions, dependency contents, full manifest. Returns file content string. Called once per file in manifest order.

5. **validator-agent** — Takes all scaffolded files as JSON array. Runs 6-phase validation (Structure, Import Resolution, Dependency Manifest, Environment Variables, Entry Point Wiring, Database Validation). Returns `{ passed, issues[], fixes[] }`. If not passed, applies fixes and re-validates up to 3 cycles.

**Build pipeline orchestration (`build-pipeline.ts`):**

```typescript
export async function runBuildPipelineStage1(opts: {
  runId: string, specContent: string, repoUrl: string,
  emit: (event: SSEEvent) => void
}): Promise<void>

export async function runBuildPipelineStage2(opts: {
  runId: string, repoUrl: string,
  emit: (event: SSEEvent) => void
}): Promise<void>
```

Stage 1:
1. Clone repo to temp dir
2. Detect if greenfield (< 3 meaningful files)
3. Build directory tree (3 levels deep, excluding node_modules/.git/dist/.next)
4. Extract code samples (up to 5 files, 80 lines each)
5. Call analyzer agent → ConventionsProfile
6. Call PRD agent → PRDOutput
7. Save stage data to disk (`.forge-stage-data.json` in work dir)
8. Update ForgeRun with prdTitle, prdSummary
9. Emit `plan` event with PRD data
10. Emit `status` event with `awaiting_approval, stage: plan`

Stage 2:
1. Load stage data from disk
2. Build lessons context from ForgeLessonLearned
3. Call prompt agent → ImplementationManifest
4. For each file in manifest (in order): call scaffolder agent with dependency contents injected
5. Run validator agent (up to 3 validation cycles)
6. Write files to work dir
7. Detect and run lint/test commands
8. Save ForgeRunDiff
9. Record lessons learned from validation fixes
10. Emit `diff` event
11. Emit `status` event with `awaiting_approval, stage: code`

**Repo utilities (`utils/repo.ts`):**
- `cloneRepo(repoUrl: string, targetDir: string): Promise<void>` — uses simple-git
- `buildTree(dir: string, depth: number): string` — directory tree string
- `isGreenfield(dir: string): boolean` — < 3 meaningful files
- `extractCodeSamples(dir: string, maxFiles: number, maxLines: number): string[]`

**Markdown utility (`utils/markdown.ts`):**
- `extractMarkdownText(raw: string): string` — strips front-matter, converts to plain text
- `extractTextFromFile(buffer: Buffer, filename: string): string` — dispatches by extension (.md, .txt)

#### Acceptance Criteria
- Each agent function compiles without TS errors
- `build-pipeline.ts` exports both stage functions
- Repo utilities correctly clone a public git repo
- Markdown extraction produces clean text from a .md file
- Validator agent returns typed `{ passed, issues, fixes }` response
- All existing tests pass

---

### Phase 2: Debug Pipeline Agents

#### Objective
Port the 4 debug pipeline agents and debug pipeline orchestration.

#### Prerequisites
- Phase 0 complete (types and DB layer exist)
- Phase 1 complete (repo utilities and lessons context exist)

#### Deliverables
1. `src/services/forge/agents/archaeologist-agent.ts` — maps affected files and call chains
2. `src/services/forge/agents/root-cause-agent.ts` — root cause analysis with confidence
3. `src/services/forge/agents/fix-planner-agent.ts` — ordered fix steps
4. `src/services/forge/agents/fix-scaffolder-agent.ts` — generates fixed file contents
5. `src/services/forge/debug-pipeline.ts` — Stage 1 (clone → structure → map → analyze → plan) and Stage 2 (scaffold fixes → lint/test)

#### Technical Specification

**Agent signatures:**
```typescript
// archaeologist-agent.ts
export async function mapCodePaths(bugReport: BugReport, tree: string, codeSamples: string[]): Promise<CodeMap>

// root-cause-agent.ts
export async function analyzeRootCause(bugReport: BugReport, codeMap: CodeMap): Promise<RootCause>

// fix-planner-agent.ts
export async function planFix(bugReport: BugReport, rootCause: RootCause, codeMap: CodeMap): Promise<FixPlan>

// fix-scaffolder-agent.ts
export async function scaffoldFix(step: FixPlanStep, existingContent: string | null, rootCause: RootCause): Promise<FixFile>
```

**Debug pipeline orchestration:**

Stage 1:
1. Clone repo to temp dir
2. Build tree and extract code samples
3. Structure bug report from user input (description → BugReport)
4. Call archaeologist agent → CodeMap
5. Call root-cause agent → RootCause
6. Call fix-planner agent → FixPlan
7. Save stage data to disk
8. Save ForgeRunDiagnosis
9. Update ForgeRun with diagnosis data
10. Emit `diagnosis` and `plan` events
11. Emit `status` with `awaiting_approval, stage: plan`

Stage 2:
1. Load stage data from disk
2. For each fix step: read existing file content from work dir, call fix-scaffolder agent
3. Write fixed files to work dir
4. Detect and run lint/test commands
5. Save ForgeRunDiff
6. Emit `diff` event
7. Emit `status` with `awaiting_approval, stage: code`

#### Acceptance Criteria
- Each agent function compiles without TS errors
- `debug-pipeline.ts` exports both stage functions
- Debug Stage 1 produces a CodeMap and RootCause from a bug description
- Debug Stage 2 produces FixFiles from a FixPlan
- All existing tests pass

---

### Phase 3: GitLab MR Publishing

#### Objective
Add the ability to publish generated/fixed code as GitLab merge requests.

#### Prerequisites
- Phase 0 complete (ForgeRunResult model exists)

#### Deliverables
1. `src/services/forge/utils/publish.ts` — GitLab MR publishing via Gitbeaker
2. Integration with the approve API route (Phase 5)

#### Technical Specification

**Publish function:**
```typescript
interface PublishOptions {
  workDir: string
  repoUrl: string
  files: Array<{ path: string; content: string }>
  branchName?: string
  title: string
  description: string
}

interface PublishResult {
  mrUrl: string
  mrIid: number
  branch: string
  title: string
}

export async function publishToGitLab(opts: PublishOptions): Promise<PublishResult>
```

**Implementation:**
1. Parse repoUrl to extract GitLab host and project path
2. Create Gitbeaker client with user's GitLab access token (from NextAuth Account record — the existing GitLab OAuth already stores `access_token`)
3. Generate branch name if not provided: `forge/{mode}-{shortId}` (e.g., `forge/build-a1b2c3d4`)
4. Use simple-git in the work dir:
   - Create and checkout branch
   - Write all files
   - Stage all changes
   - Commit with message: `forge: {title}`
   - Push to origin
5. Create merge request via Gitbeaker API
6. Return PublishResult

**GitLab token retrieval:**
- Query `Account` model where `provider = 'gitlab'` and `userId = session.user.id`
- Use the stored `access_token`
- If token is expired, return error instructing user to re-authenticate

#### Acceptance Criteria
- `publishToGitLab` compiles without TS errors
- Function correctly extracts project path from various GitLab URL formats
- Branch naming follows `forge/{mode}-{shortId}` pattern
- MR creation returns valid URL, IID, branch, and title
- All existing tests pass

---

### Phase 4: Forge UI Components

#### Objective
Build all React components for the forge feature using the existing shadcn/Radix design system.

#### Prerequisites
- Phase 0 complete (types exist for component props)

#### Deliverables
1. `src/components/forge/mode-selector.tsx` — Build/Debug tab toggle
2. `src/components/forge/build-form.tsx` — Feature spec input (paste or upload MD/TXT) + repo URL
3. `src/components/forge/debug-form.tsx` — Bug description + repo URL
4. `src/components/forge/run-status-badge.tsx` — Color-coded status pill
5. `src/components/forge/mode-badge.tsx` — Build/Debug mode indicator
6. `src/components/forge/log-viewer.tsx` — Real-time SSE log display with auto-scroll
7. `src/components/forge/plan-approval.tsx` — PRD/diagnosis review + approve/reject buttons
8. `src/components/forge/diff-viewer.tsx` — File list with expandable code, lint/test badges, approve/reject
9. `src/components/forge/diagnosis-panel.tsx` — Root cause, affected files, fix plan with action badges
10. `src/stores/forge-store.ts` — Zustand store for forge run state
11. `src/hooks/use-forge-stream.ts` — SSE connection hook

#### Technical Specification

**Component details (adapted from forge-ui to use shadcn/Radix):**

All components use the existing shadcn/Radix primitives (`Button`, `Input`, `Textarea`, `Badge`, `Card`, `Tabs`, `ScrollArea`, etc.) and Tailwind classes consistent with the main project's dark theme.

**mode-selector.tsx:** Uses shadcn `Tabs` component. Two tabs: "Build Feature" and "Debug & Fix". Renders the appropriate form as tab content.

**build-form.tsx:**
- Toggle between "Paste Text" and "Upload File" using shadcn `Button` group
- Paste mode: `Textarea` for spec content
- Upload mode: File input accepting `.md`, `.txt`
- `Input` for GitLab repo URL (required)
- `Input` for branch name (optional)
- Submit button calls `POST /api/forge/runs`
- On success, navigates to `/forge/runs/{id}`

**debug-form.tsx:**
- `Textarea` for bug description with placeholder showing expected format
- `Input` for GitLab repo URL (required)
- `Input` for branch name (optional)
- Submit button calls `POST /api/forge/runs` with mode='debug'

**log-viewer.tsx:**
- Connects to SSE endpoint via `EventSource`
- Handles `log`, `diff`, `diagnosis`, `plan`, `status`, `done` events
- Auto-scrolls via `useRef` + `scrollIntoView`
- Color-coded by level: info (gray), warn (yellow), error (red), success (green)
- Accepts `advanceStreamUrl` prop to reconnect for Stage 2

**plan-approval.tsx:**
- Build mode: shows PRD title, summary, collapsible full text
- Debug mode: shows root cause, affected files, fix plan with action badges
- "Approve" triggers parent callback (which sets advanceStreamUrl for log-viewer)
- "Reject" calls `POST /api/forge/runs/[id]/reject`

**diff-viewer.tsx:**
- Lists files with expandable code blocks (pre + syntax highlighting via existing react-syntax-highlighter)
- Lint and test status badges
- Error list display
- "Approve & Push MR" calls `POST /api/forge/runs/[id]/approve`
- "Reject" calls `POST /api/forge/runs/[id]/reject`

**diagnosis-panel.tsx:**
- Root cause in highlighted box
- Affected files as monospace list
- Fix plan as ordered list with create/modify/delete action badges

**forge-store.ts:**
- Zustand store tracking: status, stage, diff, diagnosis, result, logs, planData, advanceStreamUrl
- Actions: setStatus, setStage, addLog, setDiff, setDiagnosis, setResult, setPlanData, triggerAdvance, reset

**use-forge-stream.ts:**
- Hook that connects to SSE URL, dispatches events to forge-store
- Handles reconnection on error
- Cleans up EventSource on unmount

#### Acceptance Criteria
- All components render without errors
- Forms validate required fields before submission
- Log viewer displays real-time logs from SSE
- Plan approval shows correct content for build vs debug modes
- Diff viewer shows files with expandable code
- Status badge shows correct colors for all states
- All existing tests pass

---

### Phase 5: API Routes & Pages

#### Objective
Wire up the API routes that connect the UI to the pipeline services, and build the page-level components.

#### Prerequisites
- Phase 1 complete (build pipeline)
- Phase 2 complete (debug pipeline)
- Phase 3 complete (GitLab publishing)
- Phase 4 complete (UI components)

#### Deliverables
1. `app/api/forge/runs/route.ts` — POST (create) + GET (list)
2. `app/api/forge/runs/[id]/route.ts` — GET (details)
3. `app/api/forge/runs/[id]/stream/route.ts` — GET (Stage 1 SSE)
4. `app/api/forge/runs/[id]/advance/route.ts` — GET (Stage 2 SSE)
5. `app/api/forge/runs/[id]/approve/route.ts` — POST (publish MR)
6. `app/api/forge/runs/[id]/reject/route.ts` — POST (reject)
7. `app/forge/page.tsx` — Forge home page with mode selector + forms
8. `app/forge/runs/page.tsx` — Run history list
9. `app/forge/runs/[id]/page.tsx` — Run detail with real-time updates
10. Sidebar navigation link to `/forge`

#### Technical Specification

**API route implementations:**

All routes use `getServerSession(authOptions)` for authentication. Unauthorized requests return 401.

**POST /api/forge/runs:**
- Accepts multipart form data (file upload) or JSON
- For multipart: extract file text via `extractTextFromFile()`
- Validates with Zod schemas (BuildJsonSchema, DebugJsonSchema)
- Creates ForgeRun via `createForgeRun(userId, data)`
- Returns `{ runId }`

**GET /api/forge/runs:**
- Returns `listForgeRuns(userId)` sorted by createdAt desc

**GET /api/forge/runs/[id]:**
- Returns `getForgeRunWithDetails(id)`
- Verifies run belongs to authenticated user

**GET /api/forge/runs/[id]/stream:**
- Validates run is `pending`
- Opens TransformStream, creates SSE writer
- Updates run to `running`
- Calls `runBuildPipelineStage1()` or `runDebugPipelineStage1()`
- On completion: updates to `awaiting_approval, stage: plan`
- On error: updates to `failed`
- Sets `maxDuration = 300` (5 min for clone + analysis + LLM calls)

**GET /api/forge/runs/[id]/advance:**
- Validates run is `awaiting_approval` with `stage: plan`
- Opens TransformStream, creates SSE writer
- Updates run to `running`
- Calls `runBuildPipelineStage2()` or `runDebugPipelineStage2()`
- On completion: updates to `awaiting_approval, stage: code`
- On error: updates to `failed`
- Sets `maxDuration = 300`

**POST /api/forge/runs/[id]/approve:**
- Validates run is `awaiting_approval` with `stage: code`
- Validates diff exists
- Updates run to `publishing`
- Retrieves GitLab access token from Account record
- Calls `publishToGitLab()`
- Saves ForgeRunResult
- Updates run to `complete`
- Cleans up temp dir
- Returns publish result

**POST /api/forge/runs/[id]/reject:**
- Validates run is `awaiting_approval`
- Updates to `rejected`
- Preserves work dir for potential retry

**Pages:**

**`app/forge/page.tsx`:**
- Server component, renders ModeSelector with BuildForm and DebugForm
- Dark theme consistent with main app

**`app/forge/runs/page.tsx`:**
- Server component, fetches runs via `listForgeRuns(userId)`
- Renders list with ModeBadge, RunStatusBadge, title, repo URL, date
- Links to detail pages

**`app/forge/runs/[id]/page.tsx`:**
- Server component, fetches run details
- Renders client-side RunDetailView that manages SSE connections and state
- RunDetailView composes: LogViewer, PlanApproval, DiffViewer, DiagnosisPanel based on current status/stage

**Sidebar link:**
- Add "Forge" entry to the existing sidebar navigation in `src/components/layout/sidebar.tsx`

#### Acceptance Criteria
- Creating a build run via the form navigates to the run detail page
- Creating a debug run via the form navigates to the run detail page
- Stage 1 SSE streams logs and pauses at plan approval
- Approving the plan starts Stage 2 SSE
- Stage 2 SSE streams logs and pauses at code approval
- Approving code publishes MR and shows result
- Rejecting at any stage marks run as rejected
- Run history page lists all user's runs
- Unauthorized access returns 401
- All existing tests pass
- `npm run build` succeeds

---

### Phase 6: Skills Database Seeding & Integration

#### Objective
Store the forge agent prompts as Skills in the database (matching the existing skill-loader pattern) and wire up the learning store integration.

#### Prerequisites
- Phase 1 and Phase 2 complete (agents exist)

#### Deliverables
1. Skill records in database for all 9 forge agents (analyzer, prd, prompt, scaffolder, validator, archaeologist, root-cause, fix-planner, fix-scaffolder)
2. Updated agent modules to load system prompts from Skill records via the existing `skill-loader.ts`
3. `src/services/forge/lessons-context.ts` — loads ForgeLessonLearned records and formats them as a prompt section
4. Integration between validator-agent validation failures and ForgeLessonLearned creation
5. Seed script or API endpoint to populate forge skills

#### Technical Specification

**Skill records:** Each forge agent's system prompt gets stored as a Skill with name prefixed `forge-`:
- `forge-analyzer`
- `forge-prd`
- `forge-prompt`
- `forge-scaffolder`
- `forge-validator`
- `forge-archaeologist`
- `forge-root-cause`
- `forge-fix-planner`
- `forge-fix-scaffolder`

**Agent update:** Each agent module's system prompt becomes:
```typescript
import { loadSkill } from '@/src/services/skill-loader'

export async function analyzeRepo(...) {
  const skill = await loadSkill('forge-analyzer')
  // Use skill.prompt as system message
}
```

**Lessons context:**
```typescript
export async function buildForgeLessonsSection(language?: string, framework?: string): Promise<string>
```
- Queries `ForgeLessonLearned` filtered by language/framework
- Returns formatted prompt section with prevention rules
- Returns empty string if no lessons exist

**Lesson recording:** After each validation fix cycle in `validator-agent.ts`, record:
```typescript
await addForgeLessonLearned({
  runId, phase, phaseName, error, fix, rootCause, preventionRule, language, framework
})
```

#### Acceptance Criteria
- All 9 skill records exist in database after seeding
- Agents load prompts from database instead of hardcoded strings
- Lessons context returns formatted prevention rules
- Validation failures create ForgeLessonLearned records
- Subsequent runs include relevant lessons in agent prompts
- All existing tests pass

---

## 7. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| GitLab access token expiry | H | M | Check token validity before publish, prompt re-auth if expired |
| LLM hallucinating file contents | H | M | 6-phase validator with 3 retry cycles, lessons learned injection |
| Clone timeout on large repos | M | M | Set 60s timeout on git clone, shallow clone (depth=1) |
| SSE connection drops mid-pipeline | M | M | Run detail page fetches current state on mount, resumes from correct stage |
| Temp dirs accumulate on failures | L | H | Cleanup on approve/reject, periodic cron for orphaned dirs |
| Prisma migration conflicts | H | L | Test migration on dev DB first, keep models namespaced with Forge prefix |
| Gitbeaker API changes | L | L | Pin to ^41.0.0, Gitbeaker is stable and well-maintained |

## 8. Dependencies & Environment

### New Environment Variables
None required. The integration uses:
- Existing `ANTHROPIC_API_KEY` (from user settings or env)
- Existing `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` (for OAuth)
- GitLab access tokens from the existing NextAuth Account records

### Development Setup
```bash
# Install new dependencies
npm install @gitbeaker/rest gray-matter marked simple-git

# Run migration
npx prisma migrate dev --name add_forge_models

# Seed forge skills (after Phase 6)
curl -X POST http://localhost:3000/api/admin/seed-skills
```

## 9. Project Logging

### 9.1 Dev Log (`docs/DEV_LOG.md`)
Append to existing dev log. Format per phase:
```
## Forge Integration Phase {N} — {Short Description}
**Date:** {ISO date}
**Files:** {created/modified list}
**Summary:** {1-2 sentences}
**Notes:** {issues, workarounds, deviations}
```

### 9.2 Issues Tracker (`docs/ISSUES_TRACKER.md`)
Continue existing issue numbering. Log all integration issues.

### 9.3 AI Decision Log (`docs/AI_DECISIONS.md`)
Log all architectural decisions made during integration (e.g., "chose new models over extending PipelineRun because...").

### 9.4 AI Cost Log (`docs/AI_COST_LOG.md`)
Track token usage per phase of integration work.
