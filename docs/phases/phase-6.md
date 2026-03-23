# Phase 6: Skills Database Seeding & Integration
## Project: Forge UI Integration

## Phase Objective
Store the forge agent prompts as Skills in the database (matching the existing skill-loader pattern) and wire up the learning store integration so that agents load prompts from DB and validation failures feed back into future runs.

## Current State (What Exists Before This Phase)
Phases 0–5 are complete. The forge feature is fully functional end-to-end.

### Existing Files (Phase 0 deliverables)
- `src/services/forge/types/*` — All type definitions
- `src/services/forge/db.ts` — All CRUD functions including `addForgeLessonLearned()`, `getForgeLessonsForContext()`

### Existing Files (Phase 1 deliverables)
- `src/services/forge/agents/analyzer-agent.ts` — exports `analyzeRepo()` — currently has hardcoded system prompt
- `src/services/forge/agents/prd-agent.ts` — exports `generatePRD()` — currently has hardcoded system prompt
- `src/services/forge/agents/prompt-agent.ts` — exports `generateManifest()` — currently has hardcoded system prompt
- `src/services/forge/agents/scaffolder-agent.ts` — exports `scaffoldFile()` — currently has hardcoded system prompt
- `src/services/forge/agents/validator-agent.ts` — exports `validateFiles()` — currently has hardcoded system prompt
- `src/services/forge/build-pipeline.ts` — exports `runBuildPipelineStage1()`, `runBuildPipelineStage2()`
- `src/services/forge/lessons-context.ts` — exports `buildForgeLessonsSection()`

### Existing Files (Phase 2 deliverables)
- `src/services/forge/agents/archaeologist-agent.ts` — exports `mapCodePaths()` — currently has hardcoded system prompt
- `src/services/forge/agents/root-cause-agent.ts` — exports `analyzeRootCause()` — currently has hardcoded system prompt
- `src/services/forge/agents/fix-planner-agent.ts` — exports `planFix()` — currently has hardcoded system prompt
- `src/services/forge/agents/fix-scaffolder-agent.ts` — exports `scaffoldFix()` — currently has hardcoded system prompt
- `src/services/forge/debug-pipeline.ts` — exports `runDebugPipelineStage1()`, `runDebugPipelineStage2()`

### Existing Files (Pre-existing project infrastructure)
- `src/services/skill-loader.ts` — `SkillLoader` class with `getSkillPromptAsync(skillName)`:
  - Loads from: cache → internal pseudo-skills → DB (Skill table) → filesystem fallback
  - Strips YAML front-matter from skill prompts
  - Uses Prisma `skill.findUnique({ where: { name: skillName } })`
- `prisma/schema.prisma` — includes `Skill` model: `{ id, name (unique), prompt (Text), version, updatedAt, createdAt }`
- `app/api/admin/seed-skills/route.ts` — existing seed endpoint that loads skills from `.claude/skills/` directory

### Existing Data Models
- `Skill` — `{ id: String, name: String @unique, prompt: String @db.Text, version: Int, updatedAt: DateTime, createdAt: DateTime }`
- `ForgeLessonLearned` — `{ id, runId?, phase, phaseName, error, fix, rootCause, preventionRule, language?, framework?, createdAt }`

### Existing API Endpoints
All forge API routes from Phase 5 are functional. Existing admin seed endpoint exists.

### Configured Environment
All env vars from prior phases.

## Technical Architecture (Phase-Relevant Subset)

### Stack
- Prisma 5.22.0 for Skill table access
- `SkillLoader.getSkillPromptAsync()` for prompt retrieval
- Existing seed infrastructure

### Data Flow
```
Agent call → SkillLoader.getSkillPromptAsync('forge-analyzer')
  → checks cache → checks DB → returns system prompt string

Validation failure → addForgeLessonLearned({ phase, error, fix, rootCause, preventionRule })
  → stored in ForgeLessonLearned table

Next run → buildForgeLessonsSection(language, framework)
  → queries ForgeLessonLearned → formats as prompt section → injected into agent prompts
```

### File Structure
```
src/services/forge/
├── agents/
│   ├── analyzer-agent.ts       # MODIFY — load prompt from Skill DB
│   ├── prd-agent.ts            # MODIFY — load prompt from Skill DB
│   ├── prompt-agent.ts         # MODIFY — load prompt from Skill DB
│   ├── scaffolder-agent.ts     # MODIFY — load prompt from Skill DB
│   ├── validator-agent.ts      # MODIFY — load prompt from Skill DB + record lessons
│   ├── archaeologist-agent.ts  # MODIFY — load prompt from Skill DB
│   ├── root-cause-agent.ts     # MODIFY — load prompt from Skill DB
│   ├── fix-planner-agent.ts    # MODIFY — load prompt from Skill DB
│   └── fix-scaffolder-agent.ts # MODIFY — load prompt from Skill DB
├── lessons-context.ts          # EXISTS — already functional

app/api/admin/seed-skills/
└── route.ts                    # MODIFY — add forge skill seeding
```

## Deliverables
1. 9 Skill records in database for forge agents (seeded via admin endpoint)
2. Updated all 9 agent modules to load system prompts from Skill records via `SkillLoader`
3. Integration between validator-agent validation failures and ForgeLessonLearned creation
4. Updated seed-skills endpoint to include forge skills

## Technical Specification

### Files to Modify

#### All 9 agent files (`src/services/forge/agents/*.ts`)
- **Current state:** Each agent has a hardcoded system prompt string
- **Changes:** Replace hardcoded prompt with a call to `SkillLoader.getSkillPromptAsync()`
- **Reason:** Prompts should be stored in the database for editability and consistency with the existing skill system

**Pattern for each agent:**

Before (Phase 1/2):
```typescript
export async function analyzeRepo(repoDir: string, tree: string, codeSamples: string[]): Promise<ConventionsProfile> {
  const systemPrompt = `You are a code convention analyzer. Analyze the following...`
  // ... LLM call with systemPrompt
}
```

After (Phase 6):
```typescript
import { SkillLoader } from '@/src/services/skill-loader'

export async function analyzeRepo(repoDir: string, tree: string, codeSamples: string[]): Promise<ConventionsProfile> {
  const systemPrompt = await SkillLoader.getSkillPromptAsync('forge-analyzer')
  // ... LLM call with systemPrompt (unchanged)
}
```

**Skill name mapping:**
| Agent file | Skill name |
|---|---|
| `analyzer-agent.ts` | `forge-analyzer` |
| `prd-agent.ts` | `forge-prd` |
| `prompt-agent.ts` | `forge-prompt` |
| `scaffolder-agent.ts` | `forge-scaffolder` |
| `validator-agent.ts` | `forge-validator` |
| `archaeologist-agent.ts` | `forge-archaeologist` |
| `root-cause-agent.ts` | `forge-root-cause` |
| `fix-planner-agent.ts` | `forge-fix-planner` |
| `fix-scaffolder-agent.ts` | `forge-fix-scaffolder` |

#### `src/services/forge/agents/validator-agent.ts` (additional changes)
- **Current state:** Returns validation results but doesn't record lessons
- **Changes:** After each fix cycle, record lessons via `addForgeLessonLearned()`
- **Reason:** Lessons must persist to improve future runs

```typescript
import { addForgeLessonLearned } from '../db'

// After validation fails and fixes are generated, for each fix:
for (const issue of result.issues) {
  await addForgeLessonLearned({
    runId,       // passed as parameter
    phase: issue.phaseNumber,      // 1-6 based on validation phase
    phaseName: issue.phase,        // 'Structure', 'Import Resolution', etc.
    error: issue.description,
    fix: correspondingFix.description,
    rootCause: issue.description,  // for validation, error IS the root cause
    preventionRule: `Ensure ${issue.phase} is correct: ${correspondingFix.description}`,
    language,    // from ConventionsProfile if available
    framework,   // from ConventionsProfile if available
  })
}
```

The `validateFiles` function signature needs to be updated to accept optional context:
```typescript
export async function validateFiles(
  files: ScaffoldedFile[],
  opts?: { runId?: string; language?: string; framework?: string }
): Promise<ValidationResult>
```

#### `app/api/admin/seed-skills/route.ts`
- **Current state:** Reads `.claude/skills/` directory and upserts Skill records
- **Changes:** Add forge skill seeding alongside existing skills
- **Reason:** Forge agent prompts need to be in the Skill table

The forge skill prompts should be defined as constants in this file (or in a separate `forge-skill-prompts.ts` file) and upserted with the `forge-` prefix names. Each prompt is the system prompt that was previously hardcoded in the agent module.

**Skill prompt content (9 skills):**

Each skill prompt should contain the exact system prompt that was hardcoded in the agent during Phases 1-2. The prompts instruct the LLM on its role and expected output format. They must be stored with the corresponding `forge-{name}` key.

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
- [ ] All 9 forge skill records exist in the Skill table after running the seed endpoint
- [ ] Each agent loads its system prompt from `SkillLoader.getSkillPromptAsync('forge-{name}')`
- [ ] If a skill is not found in DB, the agent falls back gracefully (SkillLoader has filesystem fallback)
- [ ] `validateFiles()` records ForgeLessonLearned entries when fixes are applied
- [ ] `buildForgeLessonsSection()` returns formatted prevention rules from recorded lessons
- [ ] A subsequent run's agent prompts include relevant lessons from prior runs
- [ ] The seed-skills endpoint doesn't duplicate or overwrite non-forge skills
- [ ] All existing tests pass (`npm test`)
- [ ] `npm run build` succeeds

## Constraints
- Do NOT change the SkillLoader class itself — use it as-is
- Do NOT modify the Skill Prisma model
- Do NOT change agent function signatures (except `validateFiles` which adds optional opts parameter)
- Do NOT change the pipeline orchestration (build-pipeline.ts, debug-pipeline.ts)
- Skill prompts must be the same content that was hardcoded in Phases 1-2 — do not rewrite them
- Use upsert for seeding to make the endpoint idempotent

## Dependencies
- **Packages:** None new
- **API keys required:** None (seeding is a DB operation)
- **External services:** Database (for Skill table writes)
