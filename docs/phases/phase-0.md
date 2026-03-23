# Phase 0: Database Schema & Dependencies
## Project: Forge UI Integration

## Phase Objective
Add new Prisma models and npm dependencies required by all subsequent phases, establishing the data layer and type system for the forge feature.

## Current State (What Exists Before This Phase)
This is an integration into an existing Next.js 14.2.35 application. The relevant existing infrastructure:

### Existing Files
- `prisma/schema.prisma` — Database schema with models: User, Account, Session, VerificationToken, Project, PipelineRun, PipelineStage, ProjectFile, PipelineMetric, TraceEvent, AgentVote, LearningEntry, ConfidenceScore, CompletenessCheck, Skill, ProjectFeedback, SpecCache
- `src/lib/prisma.ts` — Prisma client singleton (12 lines)
- `src/lib/anthropic.ts` — Anthropic SDK client with fallback chain (Anthropic → Groq → Ollama), exports `createAnthropicClient()`, `getAnthropicClient()`, `handleAnthropicCreditError()`, `callWithRetry()`, `createWithFallback()`
- `src/services/skill-loader.ts` — `SkillLoader` class with `getSkillPromptAsync(skillName)` that loads from cache → internal skills → DB → filesystem
- `src/services/learning-store.ts` — Module-level functions for recording/querying failure patterns (LearningEntry model)
- `src/lib/auth.ts` — NextAuth configuration with GitLab OAuth provider
- `package.json` — 41 dependencies, 8 devDependencies

### Existing Data Models
The User model (relevant fields):
```typescript
model User {
  id              String    @id @default(cuid())
  name            String?
  email           String    @unique
  emailVerified   DateTime?
  image           String?
  encryptedApiKey String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  accounts Account[]
  sessions Session[]
  projects Project[]
  metrics  PipelineMetric[]
  feedback ProjectFeedback[]
  specCaches SpecCache[]
}
```

The Account model (stores GitLab OAuth tokens):
```typescript
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  created_at        Int?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}
```

### Existing API Endpoints
- `POST/GET /api/pipeline/[runId]/stream` — SSE streaming for existing pipeline
- `POST/GET /api/pipeline/[runId]/orchestrate` — Orchestration decisions
- Various other `/api/pipeline/`, `/api/projects/`, `/api/settings/`, `/api/metrics/`, `/api/learning/` routes

### Existing UI Components
- Full sidebar layout (`src/components/layout/sidebar.tsx`)
- shadcn/Radix component library in `src/components/ui/`
- Pipeline visualization components in `src/components/pipeline/`

### Configured Environment
- `DATABASE_URL` — Neon PostgreSQL (pooled)
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET` — Auth config
- `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET`, `GITLAB_BASE_URL` — GitLab OAuth
- `ANTHROPIC_API_KEY` — LLM access
- `ENCRYPTION_KEY` — API key encryption

## Technical Architecture (Phase-Relevant Subset)

### Stack
- Next.js 14.2.35, React 18, TypeScript 5 (strict mode)
- Prisma 5.22.0 + Neon PostgreSQL
- Zod for runtime validation (already in dependencies as `zod@4.3.6`)

### Data Flow
This phase establishes the data layer only. No data flows yet — subsequent phases will use these models and types.

### File Structure
```
prisma/
├── schema.prisma                    # MODIFY — add 6 new models + User relation
├── migrations/
│   └── YYYYMMDD_add_forge_models/   # NEW — auto-generated migration

src/services/forge/
├── db.ts                            # NEW — Prisma CRUD for forge models
├── types/
│   ├── conventions.ts               # NEW — ConventionsProfile Zod schema
│   ├── prd.ts                       # NEW — PRDOutput interface
│   ├── manifest.ts                  # NEW — ManifestFile, ImplementationManifest
│   ├── scaffold.ts                  # NEW — ScaffoldedFile
│   ├── bug.ts                       # NEW — BugReport, CodeMap, CodeLocation
│   ├── fix.ts                       # NEW — RootCause, FixPlan, FixFile, FixPlanStep
│   └── sse.ts                       # NEW — SSE event type definitions
```

## Deliverables
1. Prisma migration adding ForgeRun, ForgeRunLog, ForgeRunDiff, ForgeRunDiagnosis, ForgeRunResult, ForgeLessonLearned models
2. Updated User model with `forgeRuns` relation
3. New npm dependencies installed: `@gitbeaker/rest`, `gray-matter`, `marked`, `simple-git`
4. Type definition files for forge pipeline types (7 files)
5. Forge-specific Prisma CRUD module (`src/services/forge/db.ts`)
6. SSE event type definitions (`src/services/forge/types/sse.ts`)

## Technical Specification

### Files to Modify

#### `prisma/schema.prisma`
- **Current state:** Contains 17 models (User, Account, Session, etc.)
- **Changes:** Add 6 new models and one new relation on User
- **Reason:** Forge features need their own data models to track runs, logs, diffs, diagnoses, results, and lessons

Add to the existing `User` model:
```prisma
forgeRuns ForgeRun[]
```

Add these new models after the existing ones:

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

### Files to Create

#### `src/services/forge/types/conventions.ts`
- **Path:** `src/services/forge/types/conventions.ts`
- **Purpose:** Zod schema and TypeScript type for repo convention profiles detected by the analyzer agent
- **Key exports:** `ConventionsProfileSchema` (Zod object), `ConventionsProfile` (inferred type)
- **Dependencies:** `zod`
- **Details:**
```typescript
import { z } from 'zod'

export const ConventionsProfileSchema = z.object({
  language: z.string(),
  additionalLanguages: z.array(z.string()),
  framework: z.string().nullish(),
  packageManager: z.string().nullish(),
  testRunner: z.string().nullish(),
  lintCommand: z.string().nullish(),
  testCommand: z.string().nullish(),
  buildCommand: z.string().nullish(),
  ciConfig: z.string().nullish(),
  directoryStructure: z.string(),
  namingConventions: z.object({
    files: z.string(),
    functions: z.string(),
  }),
  codeStyleSamples: z.array(z.string()),
  lintConfig: z.string().nullish(),
})

export type ConventionsProfile = z.infer<typeof ConventionsProfileSchema>
```

#### `src/services/forge/types/prd.ts`
- **Path:** `src/services/forge/types/prd.ts`
- **Purpose:** Interface for PRD output from the prd-agent
- **Key exports:** `PRDOutput`
- **Dependencies:** None
- **Details:**
```typescript
export interface PRDOutput {
  title: string
  summary: string
  fullText: string
}
```

#### `src/services/forge/types/manifest.ts`
- **Path:** `src/services/forge/types/manifest.ts`
- **Purpose:** Interfaces for the implementation manifest (ordered file list with dependencies)
- **Key exports:** `ManifestFile`, `ImplementationManifest`
- **Dependencies:** None
- **Details:**
```typescript
export interface ManifestFile {
  path: string
  description: string
  dependencies: string[]
}

export interface ImplementationManifest {
  files: ManifestFile[]
}
```

#### `src/services/forge/types/scaffold.ts`
- **Path:** `src/services/forge/types/scaffold.ts`
- **Purpose:** Interface for scaffolded file output
- **Key exports:** `ScaffoldedFile`
- **Dependencies:** None
- **Details:**
```typescript
export interface ScaffoldedFile {
  path: string
  content: string
}
```

#### `src/services/forge/types/bug.ts`
- **Path:** `src/services/forge/types/bug.ts`
- **Purpose:** Interfaces for bug reports and code mapping used by debug pipeline
- **Key exports:** `BugReport`, `CodeLocation`, `CodeMap`
- **Dependencies:** None
- **Details:**
```typescript
export interface BugReport {
  description: string
  errorLogs: string
  symptoms: string
}

export interface CodeLocation {
  file: string
  lines: string
  relevance: string
  snippet: string
}

export interface CodeMap {
  affectedFiles: string[]
  locations: CodeLocation[]
  callChain: string
  entryPoint: string
}
```

#### `src/services/forge/types/fix.ts`
- **Path:** `src/services/forge/types/fix.ts`
- **Purpose:** Interfaces for root cause analysis and fix planning
- **Key exports:** `FixPlanStep`, `RootCause`, `FixPlan`, `FixFile`
- **Dependencies:** None
- **Details:**
```typescript
export interface FixPlanStep {
  file: string
  action: 'create' | 'modify' | 'delete'
  description: string
}

export interface RootCause {
  cause: string
  explanation: string
  affectedFiles: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface FixPlan {
  steps: FixPlanStep[]
  summary: string
}

export interface FixFile {
  path: string
  content: string
}
```

#### `src/services/forge/types/sse.ts`
- **Path:** `src/services/forge/types/sse.ts`
- **Purpose:** Type definitions for SSE events emitted during forge pipeline execution
- **Key exports:** `SSELogEvent`, `SSEPlanEvent`, `SSEDiagnosisEvent`, `SSEDiffEvent`, `SSEStatusEvent`, `SSEDoneEvent`, `SSEEvent`
- **Dependencies:** `./fix` (for FixPlanStep)
- **Details:**
```typescript
import type { FixPlanStep } from './fix'

export interface SSELogEvent {
  type: 'log'
  step: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

export interface SSEPlanEvent {
  type: 'plan'
  stage: 'plan'
  // Build mode fields
  prdTitle?: string
  prdSummary?: string
  prdFullText?: string
  // Debug mode fields
  rootCause?: string
  affectedFiles?: string[]
  fixPlan?: FixPlanStep[]
}

export interface SSEDiagnosisEvent {
  type: 'diagnosis'
  rootCause: string
  affectedFiles: string[]
  fixPlan: FixPlanStep[]
}

export interface SSEDiffEvent {
  type: 'diff'
  files: Array<{ path: string; content: string }>
  lintPassed: boolean
  testsPassed: boolean
  errors: string[]
}

export interface SSEStatusEvent {
  type: 'status'
  status: string
  stage?: string
}

export interface SSEDoneEvent {
  type: 'done'
}

export type SSEEvent =
  | SSELogEvent
  | SSEPlanEvent
  | SSEDiagnosisEvent
  | SSEDiffEvent
  | SSEStatusEvent
  | SSEDoneEvent
```

#### `src/services/forge/db.ts`
- **Path:** `src/services/forge/db.ts`
- **Purpose:** Prisma CRUD operations for all forge models
- **Key exports:** `createForgeRun`, `getForgeRun`, `getForgeRunWithDetails`, `listForgeRuns`, `updateForgeRun`, `addForgeRunLog`, `saveForgeRunDiff`, `saveForgeRunDiagnosis`, `saveForgeRunResult`, `addForgeLessonLearned`, `getForgeLessonsForContext`
- **Dependencies:** `@/src/lib/prisma` (Prisma client singleton)
- **Details:**

Function signatures and behavior:

```typescript
import { prisma } from '@/src/lib/prisma'

// Create a new forge run
export async function createForgeRun(userId: string, data: {
  mode: string
  repoUrl: string
  specContent?: string
  specFilename?: string
  bugDescription?: string
  branchName?: string
}): Promise<ForgeRun>
// Uses prisma.forgeRun.create()

// Get a single forge run by ID
export async function getForgeRun(id: string): Promise<ForgeRun | null>
// Uses prisma.forgeRun.findUnique()

// Get forge run with all related data
export async function getForgeRunWithDetails(id: string): Promise<{
  run: ForgeRun
  logs: ForgeRunLog[]
  diff: ForgeRunDiff | null
  diagnosis: ForgeRunDiagnosis | null
  result: ForgeRunResult | null
} | null>
// Uses prisma.forgeRun.findUnique() with include: { logs, diff, diagnosis, result }

// List all forge runs for a user, sorted by createdAt desc
export async function listForgeRuns(userId: string): Promise<ForgeRun[]>
// Uses prisma.forgeRun.findMany() with where: { userId }, orderBy: { createdAt: 'desc' }

// Update forge run fields
export async function updateForgeRun(id: string, data: Partial<{
  status: string
  stage: string | null
  prdTitle: string
  prdSummary: string
  error: string
  completedAt: string
  branchName: string
}>): Promise<ForgeRun>
// Uses prisma.forgeRun.update()

// Add a log entry to a forge run
export async function addForgeRunLog(runId: string, data: {
  step: string
  level: string
  message: string
}): Promise<ForgeRunLog>
// Uses prisma.forgeRunLog.create()

// Save the diff (generated files) for a forge run
export async function saveForgeRunDiff(runId: string, data: {
  files: Array<{ path: string; content: string }>
  lintPassed: boolean
  testsPassed: boolean
  errors: string[]
}): Promise<ForgeRunDiff>
// Uses prisma.forgeRunDiff.upsert() (upsert because validator may update diff after fix cycles)

// Save the diagnosis for a debug forge run
export async function saveForgeRunDiagnosis(runId: string, data: {
  rootCause: string
  affectedFiles: string[]
  fixPlan: Array<{ file: string; action: string; description: string }>
}): Promise<ForgeRunDiagnosis>
// Uses prisma.forgeRunDiagnosis.create()

// Save the MR result after publishing
export async function saveForgeRunResult(runId: string, data: {
  mrUrl: string
  mrIid: number
  branch: string
  title: string
}): Promise<ForgeRunResult>
// Uses prisma.forgeRunResult.create()

// Add a lesson learned from a validation fix
export async function addForgeLessonLearned(data: {
  runId?: string
  phase: number
  phaseName: string
  error: string
  fix: string
  rootCause: string
  preventionRule: string
  language?: string
  framework?: string
}): Promise<ForgeLessonLearned>
// Uses prisma.forgeLessonLearned.create()

// Get lessons for a given language/framework context
export async function getForgeLessonsForContext(language?: string, framework?: string): Promise<ForgeLessonLearned[]>
// Uses prisma.forgeLessonLearned.findMany() with optional where filters on language/framework
// Orders by createdAt desc, limits to 50 most recent
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
- [ ] `npx prisma migrate dev` succeeds without errors
- [ ] `npx prisma generate` succeeds
- [ ] All 7 type files export their types without TS errors
- [ ] `db.ts` compiles and all CRUD functions have correct Prisma types
- [ ] Existing tests still pass (`npm test`)
- [ ] New npm dependencies installed: `@gitbeaker/rest`, `gray-matter`, `marked`, `simple-git`

## Constraints
- Do NOT modify any existing models (PipelineRun, PipelineStage, etc.) — only add new Forge-prefixed models
- Do NOT add any API routes or UI components — those belong to later phases
- Do NOT add any agent logic — that belongs to Phase 1 and Phase 2
- The `forgeRuns` relation on User is the only change to an existing model

## Dependencies
- **Packages to install:** `@gitbeaker/rest@^41.0.0`, `gray-matter@^4.0.3`, `marked@^12.0.0`, `simple-git@^3.27.0`
- **API keys required:** None (this phase is data layer only)
- **External services:** Neon PostgreSQL (existing, for migration)
