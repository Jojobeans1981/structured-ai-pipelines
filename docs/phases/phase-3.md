# Phase 3: GitLab MR Publishing
## Project: Forge UI Integration

## Phase Objective
Add the ability to publish generated or fixed code as GitLab merge requests, using Gitbeaker for the GitLab API and simple-git for local operations.

## Current State (What Exists Before This Phase)
Phases 0, 1, and 2 are complete.

### Existing Files (Phase 0 deliverables)
- `src/services/forge/types/*` — All type definitions (conventions, prd, manifest, scaffold, bug, fix, sse)
- `src/services/forge/db.ts` — All CRUD functions including `saveForgeRunResult(runId, { mrUrl, mrIid, branch, title })`

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

### Existing Files (Phase 2 deliverables)
- `src/services/forge/agents/archaeologist-agent.ts` — exports `mapCodePaths()`
- `src/services/forge/agents/root-cause-agent.ts` — exports `analyzeRootCause()`
- `src/services/forge/agents/fix-planner-agent.ts` — exports `planFix()`
- `src/services/forge/agents/fix-scaffolder-agent.ts` — exports `scaffoldFix()`
- `src/services/forge/debug-pipeline.ts` — exports `runDebugPipelineStage1()`, `runDebugPipelineStage2()`

### Existing Files (Pre-existing project infrastructure)
- `src/lib/auth.ts` — NextAuth config with GitLab OAuth provider
- `src/lib/prisma.ts` — Prisma client singleton
- `prisma/schema.prisma` — includes `Account` model with `access_token` field (stores GitLab OAuth token)

### Existing Data Models
- `Account` model stores `access_token` from GitLab OAuth — this is the token we use for Gitbeaker
- `ForgeRunResult` model stores MR result: `mrUrl`, `mrIid`, `branch`, `title`

### Existing API Endpoints
No forge API endpoints yet (Phase 5).

### Configured Environment
- `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET`, `GITLAB_BASE_URL` — GitLab OAuth config
- `DATABASE_URL` — for Account token lookup
- `@gitbeaker/rest@^41.0.0` installed in Phase 0

## Technical Architecture (Phase-Relevant Subset)

### Stack
- `@gitbeaker/rest@^41.0.0` — GitLab API client
- `simple-git@^3.27.0` — local git operations (already used by repo.ts)
- Prisma 5.22.0 — for Account token lookup

### Data Flow
```
POST /api/forge/runs/[id]/approve (Phase 5 will call this)
    ↓
Retrieve GitLab access_token from Account table
    ↓
publishToGitLab():
  1. Parse repoUrl → extract host + project path
  2. Create/checkout branch in work dir (simple-git)
  3. Write files to disk
  4. Stage + commit + push (simple-git)
  5. Create merge request (Gitbeaker API)
  6. Return { mrUrl, mrIid, branch, title }
```

### File Structure
```
src/services/forge/
├── utils/
│   ├── repo.ts         # EXISTS from Phase 1
│   ├── markdown.ts     # EXISTS from Phase 1
│   └── publish.ts      # NEW — GitLab MR publishing
```

## Deliverables
1. `src/services/forge/utils/publish.ts` — GitLab MR publishing via Gitbeaker

## Technical Specification

### Files to Create

#### `src/services/forge/utils/publish.ts`
- **Path:** `src/services/forge/utils/publish.ts`
- **Purpose:** Publishes generated/fixed code as a GitLab merge request
- **Key exports:** `publishToGitLab()`, `getGitLabToken()`
- **Dependencies:** `@gitbeaker/rest` (Gitlab class), `simple-git`, `@/src/lib/prisma`, `fs` (writeFileSync, mkdirSync), `path` (join, dirname)
- **Details:**

```typescript
import { Gitlab } from '@gitbeaker/rest'
import simpleGit from 'simple-git'
import { prisma } from '@/src/lib/prisma'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

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

// Retrieve the GitLab access token from the Account record
// Queries Account where provider='gitlab' and userId matches
// Returns the access_token string
// Throws if no GitLab account linked or token is missing
export async function getGitLabToken(userId: string): Promise<string>
// Implementation:
// const account = await prisma.account.findFirst({
//   where: { userId, provider: 'gitlab' },
//   select: { access_token: true },
// })
// if (!account?.access_token) throw new Error('No GitLab account linked. Please re-authenticate.')
// return account.access_token

// Publish files as a GitLab merge request
export async function publishToGitLab(opts: PublishOptions & { token: string }): Promise<PublishResult>
```

**Implementation steps for `publishToGitLab`:**

1. **Parse repoUrl** to extract GitLab host and project path:
   ```typescript
   // Handle formats:
   // https://labs.gauntletai.com/user/repo.git
   // https://labs.gauntletai.com/user/repo
   // https://gitlab.com/group/subgroup/repo
   const url = new URL(opts.repoUrl.replace(/\.git$/, ''))
   const host = url.origin
   const projectPath = url.pathname.slice(1) // remove leading /
   ```

2. **Generate branch name** if not provided:
   ```typescript
   const branch = opts.branchName ?? `forge/${opts.repoUrl.includes('debug') ? 'fix' : 'feature'}-${Date.now().toString(36)}`
   ```

3. **Create Gitbeaker client:**
   ```typescript
   const gl = new Gitlab({ host, token: opts.token })
   ```

4. **Git operations** in work dir using simple-git:
   ```typescript
   const git = simpleGit(opts.workDir)
   await git.checkoutLocalBranch(branch)

   // Write all files
   for (const file of opts.files) {
     const fullPath = join(opts.workDir, file.path)
     mkdirSync(dirname(fullPath), { recursive: true })
     writeFileSync(fullPath, file.content, 'utf-8')
   }

   await git.add('.')
   await git.commit(`forge: ${opts.title}`)
   await git.push('origin', branch)
   ```

5. **Create merge request** via Gitbeaker:
   ```typescript
   const mr = await gl.MergeRequests.create(projectPath, branch, 'main', opts.title, {
     description: opts.description,
     removeSourceBranch: true,
   })
   ```
   Note: The target branch should be detected from the repo's default branch. Use `gl.Projects.show(projectPath)` to get `default_branch` and pass that instead of hardcoded 'main'.

6. **Return result:**
   ```typescript
   return {
     mrUrl: mr.web_url,
     mrIid: mr.iid,
     branch,
     title: opts.title,
   }
   ```

**Error handling:**
- If git push fails (e.g., permissions), throw with descriptive message
- If MR creation fails (e.g., branch already has MR), throw with Gitbeaker error
- If token is invalid/expired, throw instructing re-authentication

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
- [ ] `publishToGitLab` compiles without TS errors
- [ ] `getGitLabToken` correctly queries the Account table for GitLab access tokens
- [ ] Function correctly extracts project path from `https://labs.gauntletai.com/user/repo.git` format
- [ ] Function correctly extracts project path from `https://gitlab.com/group/subgroup/repo` format
- [ ] Branch naming generates `forge/{type}-{shortId}` when no branch name provided
- [ ] File writing creates necessary directories recursively
- [ ] MR creation targets the repo's actual default branch (not hardcoded 'main')
- [ ] All existing tests pass (`npm test`)

## Constraints
- Do NOT create any API routes — the approve route (Phase 5) will call `publishToGitLab`
- Do NOT create any UI components — those belong to Phase 4
- Do NOT modify the build or debug pipelines from Phases 1/2
- The token parameter must be passed in by the caller (API route) — this function should not directly access the session

## Dependencies
- **Packages:** `@gitbeaker/rest@^41.0.0`, `simple-git@^3.27.0` (installed in Phase 0)
- **API keys required:** GitLab access token (from Account record, at runtime)
- **External services:** GitLab API (for MR creation), Git (for push)
