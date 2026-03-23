# Phase 1: Build Pipeline Agents
## Project: Forge UI Integration

## Phase Objective
Port the 5 build pipeline agents from forge-ui into the main project as service modules that call the Anthropic SDK directly, plus the repo analysis utilities and build pipeline orchestration.

## Current State (What Exists Before This Phase)
Phase 0 is complete. The following now exists:

### Existing Files (Phase 0 deliverables)
- `src/services/forge/types/conventions.ts` — exports `ConventionsProfileSchema` (Zod), `ConventionsProfile` (type)
- `src/services/forge/types/prd.ts` — exports `PRDOutput` interface (title, summary, fullText)
- `src/services/forge/types/manifest.ts` — exports `ManifestFile`, `ImplementationManifest` interfaces
- `src/services/forge/types/scaffold.ts` — exports `ScaffoldedFile` interface (path, content)
- `src/services/forge/types/bug.ts` — exports `BugReport`, `CodeLocation`, `CodeMap` interfaces
- `src/services/forge/types/fix.ts` — exports `FixPlanStep`, `RootCause`, `FixPlan`, `FixFile` interfaces
- `src/services/forge/types/sse.ts` — exports `SSELogEvent`, `SSEPlanEvent`, `SSEDiagnosisEvent`, `SSEDiffEvent`, `SSEStatusEvent`, `SSEDoneEvent`, `SSEEvent` types
- `src/services/forge/db.ts` — exports `createForgeRun`, `getForgeRun`, `getForgeRunWithDetails`, `listForgeRuns`, `updateForgeRun`, `addForgeRunLog`, `saveForgeRunDiff`, `saveForgeRunDiagnosis`, `saveForgeRunResult`, `addForgeLessonLearned`, `getForgeLessonsForContext`

### Existing Files (Pre-existing project infrastructure)
- `src/lib/anthropic.ts` — exports `createAnthropicClient()`, `getAnthropicClient(userId)`, `handleAnthropicCreditError()`, `callWithRetry()`, `createWithFallback()`. Uses Anthropic SDK with Groq/Ollama fallback chain.
- `src/lib/prisma.ts` — Prisma client singleton
- `src/services/skill-loader.ts` — `SkillLoader.getSkillPromptAsync(skillName)` loads from cache → internal → DB → filesystem

### Existing Data Models
All Forge models from Phase 0 are migrated and available via Prisma:
- `ForgeRun`, `ForgeRunLog`, `ForgeRunDiff`, `ForgeRunDiagnosis`, `ForgeRunResult`, `ForgeLessonLearned`
- `User` model now has `forgeRuns ForgeRun[]` relation

### Existing API Endpoints
No new forge API endpoints yet (those come in Phase 5).

### Configured Environment
- `DATABASE_URL` — Neon PostgreSQL
- `ANTHROPIC_API_KEY` — LLM access (via user settings or env)
- New npm packages installed: `@gitbeaker/rest`, `gray-matter`, `marked`, `simple-git`

## Technical Architecture (Phase-Relevant Subset)

### Stack
- Next.js 14.2.35, TypeScript 5 (strict mode)
- Anthropic SDK 0.79.0 via `src/lib/anthropic.ts`
- `simple-git@^3.27.0` for git clone
- `gray-matter@^4.0.3` + `marked@^12.0.0` for text extraction
- `zod@4.3.6` for LLM output validation

### Data Flow
```
Build Pipeline Stage 1:
  Clone repo → buildTree() → extractCodeSamples()
    → analyzeRepo() [analyzer-agent] → ConventionsProfile
    → generatePRD() [prd-agent] → PRDOutput
    → save stage data to disk, update ForgeRun, emit SSE events

Build Pipeline Stage 2:
  Load stage data → buildForgeLessonsSection()
    → generateManifest() [prompt-agent] → ImplementationManifest
    → for each file: scaffoldFile() [scaffolder-agent] → ScaffoldedFile
    → validateFiles() [validator-agent] → { passed, issues, fixes } (up to 3 cycles)
    → write files, run lint/test, save ForgeRunDiff, emit SSE events
```

### File Structure
```
src/services/forge/
├── types/          # EXISTS from Phase 0
├── db.ts           # EXISTS from Phase 0
├── utils/
│   ├── repo.ts     # NEW — git clone, tree building, greenfield detection
│   └── markdown.ts # NEW — MD/TXT text extraction
├── lessons-context.ts  # NEW — load lessons into prompts
├── agents/
│   ├── analyzer-agent.ts   # NEW
│   ├── prd-agent.ts        # NEW
│   ├── prompt-agent.ts     # NEW
│   ├── scaffolder-agent.ts # NEW
│   └── validator-agent.ts  # NEW
└── build-pipeline.ts       # NEW — Stage 1 + Stage 2 orchestration
```

## Deliverables
1. `src/services/forge/utils/repo.ts` — git clone, tree building, greenfield detection, code sample extraction
2. `src/services/forge/utils/markdown.ts` — MD/TXT text extraction
3. `src/services/forge/lessons-context.ts` — builds prompt section from past ForgeLessonLearned records
4. `src/services/forge/agents/analyzer-agent.ts` — analyzes cloned repo, returns ConventionsProfile
5. `src/services/forge/agents/prd-agent.ts` — generates PRD from spec + conventions
6. `src/services/forge/agents/prompt-agent.ts` — generates implementation manifest
7. `src/services/forge/agents/scaffolder-agent.ts` — generates individual file contents
8. `src/services/forge/agents/validator-agent.ts` — 6-phase validation with auto-fix
9. `src/services/forge/build-pipeline.ts` — Stage 1 (clone → analyze → PRD) and Stage 2 (manifest → scaffold → validate → lint/test)

## Technical Specification

### Files to Create

#### `src/services/forge/utils/repo.ts`
- **Path:** `src/services/forge/utils/repo.ts`
- **Purpose:** Git repository operations — clone, directory tree building, greenfield detection, code sample extraction
- **Key exports:** `cloneRepo()`, `buildTree()`, `isGreenfield()`, `extractCodeSamples()`
- **Dependencies:** `simple-git`, `fs` (readdirSync, statSync, readFileSync, existsSync), `path` (join)
- **Details:**

```typescript
import simpleGit from 'simple-git'
import { readdirSync, statSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Clone a repo to a target directory using simple-git
// Uses depth=1 for shallow clone to avoid timeout on large repos
export async function cloneRepo(repoUrl: string, targetDir: string): Promise<void>

// Build a visual directory tree string, excluding node_modules, .git, dist, .next
// Returns indented tree like:
// 📁 src
//   📁 components
//   📄 index.ts
export function buildTree(dir: string, depth: number, current?: number, prefix?: string): string

// Detect whether a repo is greenfield (< 3 meaningful files, excluding dotfiles and configs)
export function isGreenfield(dir: string): boolean

// Extract code samples from the repo — reads up to maxFiles files, maxLines lines each
// Skips binary files, node_modules, .git, dist, .next
// Returns array of strings like "// FILE: src/index.ts\n<content>"
export function extractCodeSamples(dir: string, maxFiles?: number, maxLines?: number): string[]
```

`cloneRepo` implementation: uses `simpleGit().clone(repoUrl, targetDir, ['--depth', '1'])`.

`buildTree` implementation: recursively reads directory entries, filters out `['node_modules', '.git', 'dist', '.next']`, formats with 📁/📄 prefixes, recurses up to `depth` levels.

`isGreenfield` implementation: counts files in repo root excluding dotfiles, `package.json`, `README.md`, config files. Returns true if count < 3.

`extractCodeSamples` implementation: walks directory tree, collects `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.rb` files, reads first `maxLines` (default 80) lines from up to `maxFiles` (default 5) files.

#### `src/services/forge/utils/markdown.ts`
- **Path:** `src/services/forge/utils/markdown.ts`
- **Purpose:** Extract plain text from markdown and text files for spec ingestion
- **Key exports:** `extractMarkdownText()`, `extractTextFromFile()`
- **Dependencies:** `gray-matter`, `marked`
- **Details:**

```typescript
import matter from 'gray-matter'
import { marked } from 'marked'

// Strip YAML front-matter, convert markdown to HTML, strip HTML tags to get plain text
export function extractMarkdownText(raw: string): string
// Throws Error('Markdown produced no extractable text') if result is empty

// Dispatch by file extension: .md uses extractMarkdownText, .txt returns as-is
export function extractTextFromFile(buffer: Buffer, filename: string): string
// Throws Error('Unsupported file type. Use .md or .txt') for unknown extensions
```

#### `src/services/forge/lessons-context.ts`
- **Path:** `src/services/forge/lessons-context.ts`
- **Purpose:** Build a prompt section from past ForgeLessonLearned records to inject into agent prompts
- **Key exports:** `buildForgeLessonsSection()`
- **Dependencies:** `./db` (getForgeLessonsForContext)
- **Details:**

```typescript
import { getForgeLessonsForContext } from './db'

// Query ForgeLessonLearned filtered by language/framework
// Format as a prompt section with prevention rules
// Returns empty string if no lessons exist
export async function buildForgeLessonsSection(language?: string, framework?: string): Promise<string>
```

Output format when lessons exist:
```
## LESSONS FROM PAST RUNS — DO NOT REPEAT THESE MISTAKES

1. Phase: {phaseName} | Error: {error}
   Prevention: {preventionRule}

2. ...
```

#### `src/services/forge/agents/analyzer-agent.ts`
- **Path:** `src/services/forge/agents/analyzer-agent.ts`
- **Purpose:** Analyzes a cloned repo's structure and code samples to detect conventions
- **Key exports:** `analyzeRepo()`
- **Dependencies:** `@/src/lib/anthropic` (getAnthropicClient or createWithFallback), `../types/conventions` (ConventionsProfileSchema, ConventionsProfile)
- **Details:**

```typescript
import type { ConventionsProfile } from '../types/conventions'
import { ConventionsProfileSchema } from '../types/conventions'

// System prompt instructs the model to analyze the repo structure and code samples
// and return a JSON object matching ConventionsProfileSchema
// User prompt includes: directory tree + code samples
// Parses response as JSON, validates with ConventionsProfileSchema
export async function analyzeRepo(repoDir: string, tree: string, codeSamples: string[]): Promise<ConventionsProfile>
```

The system prompt should instruct the model to:
- Detect primary language and any additional languages
- Identify framework (React, Express, Django, etc.)
- Identify package manager (npm, yarn, pnpm, pip, etc.)
- Detect test runner, lint command, test command, build command
- Describe directory structure pattern
- Identify file naming conventions (kebab-case, camelCase, etc.)
- Identify function naming conventions
- Extract representative code style samples
- Return valid JSON matching the ConventionsProfile schema

#### `src/services/forge/agents/prd-agent.ts`
- **Path:** `src/services/forge/agents/prd-agent.ts`
- **Purpose:** Generates a PRD from a feature spec and repo conventions
- **Key exports:** `generatePRD()`
- **Dependencies:** `@/src/lib/anthropic`, `../types/prd` (PRDOutput), `../types/conventions` (ConventionsProfile)
- **Details:**

```typescript
import type { PRDOutput } from '../types/prd'
import type { ConventionsProfile } from '../types/conventions'

// System prompt instructs the model to generate a comprehensive PRD
// User prompt includes: spec content, conventions profile (as JSON), greenfield flag, lessons context
// Response parsed to extract title (first heading), summary (first paragraph), fullText (entire response)
export async function generatePRD(opts: {
  specContent: string
  conventions: ConventionsProfile
  greenfield: boolean
  lessonsContext: string
}): Promise<PRDOutput>
```

The system prompt should instruct the model to produce a PRD with:
- Title and summary
- User stories
- Technical approach matching the repo's conventions
- API routes (if applicable)
- Data model changes
- Environment variable requirements
- Error handling approach
- File manifest (what files to create/modify)
- Integration points with existing code
- Build and run instructions

#### `src/services/forge/agents/prompt-agent.ts`
- **Path:** `src/services/forge/agents/prompt-agent.ts`
- **Purpose:** Generates an implementation manifest (ordered file list with dependencies)
- **Key exports:** `generateManifest()`
- **Dependencies:** `@/src/lib/anthropic`, `../types/manifest` (ImplementationManifest)
- **Details:**

```typescript
import type { ImplementationManifest } from '../types/manifest'
import type { ConventionsProfile } from '../types/conventions'

// System prompt instructs the model to create an ordered file list from the PRD
// Enforces infrastructure-first ordering (configs → types → data → services → routes → UI)
// Validates dependency ordering: no file may depend on a file that comes after it
// User prompt includes: PRD full text, conventions profile
// Response parsed as JSON matching ImplementationManifest schema
export async function generateManifest(opts: {
  prdFullText: string
  conventions: ConventionsProfile
}): Promise<ImplementationManifest>
```

#### `src/services/forge/agents/scaffolder-agent.ts`
- **Path:** `src/services/forge/agents/scaffolder-agent.ts`
- **Purpose:** Generates production-ready code for a single file
- **Key exports:** `scaffoldFile()`
- **Dependencies:** `@/src/lib/anthropic`, `../types/manifest` (ManifestFile), `../types/conventions` (ConventionsProfile)
- **Details:**

```typescript
import type { ManifestFile } from '../types/manifest'
import type { ConventionsProfile } from '../types/conventions'

// System prompt instructs the model to generate production-ready code for a single file
// Enforces: no hardcoded secrets, proper imports, error handling, type safety,
//           integration with entry points, matching repo conventions
// User prompt includes: file description from manifest, conventions, dependency file contents,
//                        full manifest for context
// Returns the raw file content as a string (extracted from code fence if present)
export async function scaffoldFile(opts: {
  file: ManifestFile
  conventions: ConventionsProfile
  dependencyContents: Record<string, string>  // path → content of dependency files
  fullManifest: ManifestFile[]
  lessonsContext: string
}): Promise<string>
```

Called once per file in manifest order. The `dependencyContents` parameter provides the already-scaffolded content of files that this file depends on, enabling proper import resolution.

#### `src/services/forge/agents/validator-agent.ts`
- **Path:** `src/services/forge/agents/validator-agent.ts`
- **Purpose:** Runs 6-phase validation on all scaffolded files with auto-fix capability
- **Key exports:** `validateFiles()`
- **Dependencies:** `@/src/lib/anthropic`, `../types/scaffold` (ScaffoldedFile), `../db` (addForgeLessonLearned)
- **Details:**

```typescript
import type { ScaffoldedFile } from '../types/scaffold'

interface ValidationResult {
  passed: boolean
  issues: Array<{ phase: string; description: string }>
  fixes: Array<{ file: string; description: string; content: string }>
}

// System prompt instructs the model to run 6-phase validation:
// Phase 1: Structure — check manifests, entry points, config files exist
// Phase 2: Import Resolution — verify all imports resolve to existing files
// Phase 3: Dependency Manifest — check package.json/requirements.txt includes all used packages
// Phase 4: Environment Variables — verify env vars are documented, no hardcoded secrets
// Phase 5: Entry Point Wiring — verify entry points import and use generated services/components
// Phase 6: Database Validation — check migrations, seed data, connection config
//
// Returns JSON with passed (boolean), issues (array), and fixes (array of corrected files)
// If not passed, the caller applies fixes and re-validates (up to MAX_VALIDATION_CYCLES)
export async function validateFiles(files: ScaffoldedFile[]): Promise<ValidationResult>
```

The validator is called in a loop by `build-pipeline.ts`:
```
for cycle = 1 to MAX_VALIDATION_CYCLES (3):
  result = validateFiles(currentFiles)
  if result.passed: break
  apply result.fixes to currentFiles
  record lessons learned for each fix
```

#### `src/services/forge/build-pipeline.ts`
- **Path:** `src/services/forge/build-pipeline.ts`
- **Purpose:** Orchestrates the two-stage build pipeline
- **Key exports:** `runBuildPipelineStage1()`, `runBuildPipelineStage2()`
- **Dependencies:** All agent modules, `./utils/repo`, `./db`, `./lessons-context`, `./types/sse` (SSEEvent), `fs`, `path`, `child_process` (execSync for lint/test)
- **Details:**

```typescript
import type { SSEEvent } from './types/sse'

const MAX_VALIDATION_CYCLES = 3
const STAGE_DATA_FILE = '.forge-stage-data.json'

interface BuildStageData {
  conventions: ConventionsProfile
  prd: PRDOutput
  greenfield: boolean
}

export async function runBuildPipelineStage1(opts: {
  runId: string
  specContent: string
  repoUrl: string
  emit: (event: SSEEvent) => void
}): Promise<void>
// Stage 1 steps:
// 1. Create temp dir: /tmp/forge-{runId}
// 2. Clone repo to temp dir via cloneRepo()
// 3. Detect greenfield via isGreenfield()
// 4. Build directory tree via buildTree(dir, 3)
// 5. Extract code samples via extractCodeSamples(dir, 5, 80)
// 6. emit log: "[Analyze] Detecting repo conventions..."
// 7. Call analyzeRepo() → ConventionsProfile
// 8. emit log: "[PRD] Generating product requirements..."
// 9. Call generatePRD() → PRDOutput
// 10. Write { conventions, prd, greenfield } to STAGE_DATA_FILE in work dir
// 11. Update ForgeRun: prdTitle = prd.title, prdSummary = prd.summary
// 12. emit plan event with PRD data
// 13. Add log to DB via addForgeRunLog

export async function runBuildPipelineStage2(opts: {
  runId: string
  repoUrl: string
  emit: (event: SSEEvent) => void
}): Promise<void>
// Stage 2 steps:
// 1. Load BuildStageData from STAGE_DATA_FILE
// 2. Build lessons context via buildForgeLessonsSection()
// 3. emit log: "[Manifest] Generating implementation plan..."
// 4. Call generateManifest() → ImplementationManifest
// 5. Initialize scaffoldedFiles: ScaffoldedFile[] = []
// 6. For each file in manifest.files (in order):
//    a. Collect dependencyContents from already-scaffolded files
//    b. emit log: "[Scaffold] Generating {file.path}..."
//    c. Call scaffoldFile() → content string
//    d. Push { path: file.path, content } to scaffoldedFiles
// 7. Validation loop (up to MAX_VALIDATION_CYCLES):
//    a. emit log: "[Validate] Running validation cycle {n}..."
//    b. Call validateFiles(scaffoldedFiles) → ValidationResult
//    c. If passed: break
//    d. Apply fixes: for each fix, update matching file in scaffoldedFiles
//    e. Record lessons via addForgeLessonLearned()
// 8. Write all files to work dir
// 9. Detect lint/test commands from conventions
// 10. Run lint command if available (try/catch, non-fatal)
// 11. Run test command if available (try/catch, non-fatal)
// 12. Save ForgeRunDiff via saveForgeRunDiff()
// 13. emit diff event
// 14. Add logs to DB
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
- [ ] `build-pipeline.ts` exports `runBuildPipelineStage1` and `runBuildPipelineStage2`
- [ ] `cloneRepo()` correctly clones a public git repo to a temp directory
- [ ] `buildTree()` produces a readable directory tree string
- [ ] `isGreenfield()` returns true for repos with < 3 meaningful files
- [ ] `extractCodeSamples()` returns code strings from common source files
- [ ] `extractMarkdownText()` produces clean text from a .md file
- [ ] `extractTextFromFile()` handles .md and .txt extensions
- [ ] `analyzeRepo()` returns a valid ConventionsProfile (Zod-validated)
- [ ] `generatePRD()` returns PRDOutput with title, summary, fullText
- [ ] `generateManifest()` returns ImplementationManifest with ordered files
- [ ] `scaffoldFile()` returns file content as a string
- [ ] `validateFiles()` returns typed `{ passed, issues, fixes }` response
- [ ] `buildForgeLessonsSection()` returns formatted prompt section or empty string
- [ ] All existing tests pass (`npm test`)

## Constraints
- Do NOT create any API routes — those belong to Phase 5
- Do NOT create any UI components — those belong to Phase 4
- Do NOT create debug pipeline agents — those belong to Phase 2
- Do NOT create the GitLab publish function — that belongs to Phase 3
- Agent system prompts are hardcoded strings in this phase; Phase 6 migrates them to the Skill DB
- All LLM calls must go through `src/lib/anthropic.ts` utilities — do not create direct Anthropic SDK instances

## Dependencies
- **Packages:** `simple-git@^3.27.0`, `gray-matter@^4.0.3`, `marked@^12.0.0` (installed in Phase 0)
- **API keys required:** `ANTHROPIC_API_KEY` (existing, for LLM calls)
- **External services:** Anthropic API (for agent calls), Git (for clone operations)
