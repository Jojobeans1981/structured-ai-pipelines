# Phase 4: Forge UI Components
## Project: Forge UI Integration

## Phase Objective
Build all React components, Zustand store, and SSE hook for the forge feature using the existing shadcn/Radix design system.

## Current State (What Exists Before This Phase)
Phases 0–3 are complete.

### Existing Files (Phase 0 deliverables — types used as component props)
- `src/services/forge/types/sse.ts` — exports `SSELogEvent`, `SSEPlanEvent`, `SSEDiagnosisEvent`, `SSEDiffEvent`, `SSEStatusEvent`, `SSEDoneEvent`, `SSEEvent`
- `src/services/forge/types/fix.ts` — exports `FixPlanStep`, `RootCause`, `FixPlan`, `FixFile`
- `src/services/forge/types/scaffold.ts` — exports `ScaffoldedFile`

### Existing Files (Pre-existing UI infrastructure)
- `src/components/ui/` — shadcn/Radix component library including: `button.tsx`, `input.tsx`, `textarea.tsx`, `badge.tsx`, `card.tsx`, `tabs.tsx`, `scroll-area.tsx`, and others
- `src/components/layout/sidebar.tsx` — Main app sidebar navigation
- `src/stores/pipeline-store.ts` — Zustand store for existing pipeline (pattern to follow)
- `src/hooks/use-pipeline-stream.ts` — SSE connection hook for existing pipeline (pattern to follow)
- Existing dark theme using Tailwind CSS with custom colors (ember, flame)
- `react-syntax-highlighter@16.1.1` available for code display

### Existing Data Models
All Forge models from Phase 0. Relevant for components:
- `ForgeRun` — status, stage, mode, repoUrl, prdTitle, prdSummary, error, createdAt, completedAt
- `ForgeRunLog` — step, level, message
- `ForgeRunDiff` — files (JSON array of {path, content}), lintPassed, testsPassed, errors
- `ForgeRunDiagnosis` — rootCause, affectedFiles, fixPlan
- `ForgeRunResult` — mrUrl, mrIid, branch, title

### Configured Environment
All prior phases configured. No new env vars needed for UI.

## Technical Architecture (Phase-Relevant Subset)

### Stack
- React 18, TypeScript 5 (strict mode)
- shadcn/Radix UI primitives (Button, Input, Textarea, Badge, Card, Tabs, ScrollArea)
- Tailwind CSS 3.4.1 with dark theme
- Zustand 5.0.12 for state management
- `react-syntax-highlighter@16.1.1` for code display
- `EventSource` API for SSE connections

### Data Flow
```
UI Components → API Routes (Phase 5) → Pipeline Services (Phases 1-3)

BuildForm/DebugForm → POST /api/forge/runs → creates run, navigates to detail page
RunDetailView → GET /api/forge/runs/[id] → loads initial state
LogViewer → EventSource /api/forge/runs/[id]/stream → receives SSE events
PlanApproval → parent triggers advance → LogViewer reconnects to /advance
DiffViewer → POST /api/forge/runs/[id]/approve → publishes MR
```

### File Structure
```
src/
├── components/forge/
│   ├── mode-selector.tsx      # NEW
│   ├── build-form.tsx         # NEW
│   ├── debug-form.tsx         # NEW
│   ├── run-status-badge.tsx   # NEW
│   ├── mode-badge.tsx         # NEW
│   ├── log-viewer.tsx         # NEW
│   ├── plan-approval.tsx      # NEW
│   ├── diff-viewer.tsx        # NEW
│   └── diagnosis-panel.tsx    # NEW
├── stores/
│   └── forge-store.ts         # NEW
└── hooks/
    └── use-forge-stream.ts    # NEW
```

## Deliverables
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

## Technical Specification

### Files to Create

#### `src/stores/forge-store.ts`
- **Path:** `src/stores/forge-store.ts`
- **Purpose:** Zustand store tracking forge run state for the UI
- **Key exports:** `useForgeStore` (Zustand hook)
- **Dependencies:** `zustand`
- **Details:**

```typescript
import { create } from 'zustand'
import type { FixPlanStep } from '@/src/services/forge/types/fix'

interface ForgeRunLog {
  step: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

interface ForgeDiff {
  files: Array<{ path: string; content: string }>
  lintPassed: boolean
  testsPassed: boolean
  errors: string[]
}

interface ForgeDiagnosis {
  rootCause: string
  affectedFiles: string[]
  fixPlan: FixPlanStep[]
}

interface ForgePlanData {
  prdTitle?: string
  prdSummary?: string
  prdFullText?: string
  rootCause?: string
  affectedFiles?: string[]
  fixPlan?: FixPlanStep[]
}

interface ForgeResult {
  mrUrl: string
  mrIid: number
  branch: string
  title: string
}

interface ForgeState {
  status: string
  stage: string | null
  logs: ForgeRunLog[]
  diff: ForgeDiff | null
  diagnosis: ForgeDiagnosis | null
  result: ForgeResult | null
  planData: ForgePlanData | null
  advanceStreamUrl: string | null

  setStatus: (status: string) => void
  setStage: (stage: string | null) => void
  addLog: (log: ForgeRunLog) => void
  setDiff: (diff: ForgeDiff) => void
  setDiagnosis: (diagnosis: ForgeDiagnosis) => void
  setResult: (result: ForgeResult) => void
  setPlanData: (data: ForgePlanData) => void
  triggerAdvance: (runId: string) => void
  reset: () => void
}

export const useForgeStore = create<ForgeState>((set) => ({
  status: 'pending',
  stage: null,
  logs: [],
  diff: null,
  diagnosis: null,
  result: null,
  planData: null,
  advanceStreamUrl: null,

  setStatus: (status) => set({ status }),
  setStage: (stage) => set({ stage }),
  addLog: (log) => set((s) => ({ logs: [...s.logs, log] })),
  setDiff: (diff) => set({ diff }),
  setDiagnosis: (diagnosis) => set({ diagnosis }),
  setResult: (result) => set({ result }),
  setPlanData: (data) => set({ planData: data }),
  triggerAdvance: (runId) => set({
    status: 'running',
    stage: null,
    planData: null,
    advanceStreamUrl: `/api/forge/runs/${runId}/advance`,
  }),
  reset: () => set({
    status: 'pending', stage: null, logs: [], diff: null,
    diagnosis: null, result: null, planData: null, advanceStreamUrl: null,
  }),
}))
```

#### `src/hooks/use-forge-stream.ts`
- **Path:** `src/hooks/use-forge-stream.ts`
- **Purpose:** Hook that connects to SSE URLs and dispatches events to the forge store
- **Key exports:** `useForgeStream()`
- **Dependencies:** `react` (useEffect, useCallback), `./stores/forge-store` (useForgeStore)
- **Details:**

```typescript
import { useEffect, useCallback } from 'react'
import { useForgeStore } from '@/src/stores/forge-store'

// Connects to an SSE URL, listens for log/diff/diagnosis/plan/status/done events
// Dispatches to forge store
// Cleans up EventSource on unmount or URL change
// Accepts optional url parameter — when null, does nothing
export function useForgeStream(url: string | null): void
```

Implementation:
- Create `EventSource(url)` when url is non-null
- `log` event → `addLog()`
- `diff` event → `setDiff()`
- `diagnosis` event → `setDiagnosis()`
- `plan` event → `setPlanData()` + `setStage('plan')`
- `status` event → `setStatus()` + optionally `setStage()`
- `done` event → `es.close()`
- `onerror` → `es.close()`
- Return cleanup that closes the EventSource

#### `src/components/forge/mode-selector.tsx`
- **Path:** `src/components/forge/mode-selector.tsx`
- **Purpose:** Build/Debug mode toggle using shadcn Tabs
- **Key exports:** `ModeSelector` (default export)
- **Dependencies:** shadcn `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- **Details:**
  - `'use client'` directive
  - Two tabs: "Build Feature" (value='build') and "Debug & Fix" (value='debug')
  - Build tab renders `<BuildForm />`
  - Debug tab renders `<DebugForm />`
  - Default value: 'build'

#### `src/components/forge/build-form.tsx`
- **Path:** `src/components/forge/build-form.tsx`
- **Purpose:** Feature spec input form with paste/upload toggle
- **Key exports:** `BuildForm` (default export)
- **Dependencies:** `react` (useState, useRef), `next/navigation` (useRouter), shadcn `Button`, `Input`, `Textarea`
- **Details:**
  - `'use client'` directive
  - State: inputMode ('paste' | 'upload'), specText, repoUrl, branchName, submitting, error
  - Toggle between paste (Textarea) and upload (file input accepting .md, .txt)
  - Form submission:
    - Upload mode: creates FormData with repoUrl, specFile, optional branchName → `POST /api/forge/runs`
    - Paste mode: JSON body with mode='build', repoUrl, specContent, optional branchName → `POST /api/forge/runs`
  - On success: `router.push(\`/forge/runs/${data.runId}\`)`
  - Error display in red box

#### `src/components/forge/debug-form.tsx`
- **Path:** `src/components/forge/debug-form.tsx`
- **Purpose:** Bug description + repo URL form
- **Key exports:** `DebugForm` (default export)
- **Dependencies:** `react` (useState), `next/navigation` (useRouter), shadcn `Button`, `Input`, `Textarea`
- **Details:**
  - `'use client'` directive
  - State: bugDescription, repoUrl, branchName, submitting, error
  - Textarea for bug description with placeholder: "What's broken?\n\nError logs:\n[paste error output here]"
  - JSON body with mode='debug', repoUrl, bugDescription, optional branchName → `POST /api/forge/runs`
  - On success: `router.push(\`/forge/runs/${data.runId}\`)`

#### `src/components/forge/run-status-badge.tsx`
- **Path:** `src/components/forge/run-status-badge.tsx`
- **Purpose:** Color-coded status pill component
- **Key exports:** `RunStatusBadge` (default export)
- **Dependencies:** shadcn `Badge` or raw span with Tailwind classes
- **Details:**
  - Props: `{ status: string }`
  - Color mapping:
    - `pending` → gray bg
    - `running` → blue bg with pulse animation
    - `awaiting_approval` → amber bg
    - `publishing` → blue bg with pulse animation
    - `complete` → green bg
    - `failed` → red bg
    - `rejected` → gray bg with line-through or muted style

#### `src/components/forge/mode-badge.tsx`
- **Path:** `src/components/forge/mode-badge.tsx`
- **Purpose:** Build/Debug mode indicator
- **Key exports:** `ModeBadge` (default export)
- **Dependencies:** shadcn `Badge` or raw span
- **Details:**
  - Props: `{ mode: 'build' | 'debug' }`
  - `build` → indigo bg, text "Build"
  - `debug` → orange bg, text "Debug"

#### `src/components/forge/log-viewer.tsx`
- **Path:** `src/components/forge/log-viewer.tsx`
- **Purpose:** Real-time streaming log display with auto-scroll
- **Key exports:** `LogViewer` (default export)
- **Dependencies:** `react` (useRef, useEffect), `@/src/stores/forge-store` (useForgeStore), `@/src/hooks/use-forge-stream`
- **Details:**
  - `'use client'` directive
  - Props: `{ runId: string, initialStatus: string }`
  - Reads logs from forge store
  - Connects to SSE via `useForgeStream()`:
    - Initial stream: `/api/forge/runs/${runId}/stream` (when status is 'pending' or 'running')
    - Advance stream: reads `advanceStreamUrl` from store
  - Auto-scrolls to bottom via `useRef` + `scrollIntoView({ behavior: 'smooth' })`
  - Level color mapping:
    - `info` → `text-gray-300`
    - `warn` → `text-yellow-400`
    - `error` → `text-red-400`
    - `success` → `text-green-400`
  - Displays step prefix: `[{step}]` in gray
  - "Waiting for pipeline to start..." placeholder when empty

#### `src/components/forge/plan-approval.tsx`
- **Path:** `src/components/forge/plan-approval.tsx`
- **Purpose:** PRD/diagnosis review with approve/reject buttons
- **Key exports:** `PlanApproval` (default export)
- **Dependencies:** `react` (useState), `@/src/stores/forge-store` (useForgeStore), shadcn `Button`, `Card`
- **Details:**
  - `'use client'` directive
  - Props: `{ runId: string, mode: 'build' | 'debug' }`
  - Reads planData from forge store
  - Build mode display:
    - PRD title (if present)
    - PRD summary (if present)
    - Collapsible full PRD text (toggle button "Show full PRD ▼" / "Hide full PRD ▲")
  - Debug mode display:
    - Root cause in highlighted box (red/orange theme)
    - Affected files as monospace list
    - Fix plan as ordered list with action badges (create=green, modify=yellow, delete=red)
  - "Approve" button → calls `useForgeStore.triggerAdvance(runId)`
  - "Reject" button → calls `POST /api/forge/runs/${runId}/reject`, then `setStatus('rejected')`
  - Header text differs by mode:
    - Build: "Review Plan Before Building"
    - Debug: "Review Diagnosis Before Fixing"

#### `src/components/forge/diff-viewer.tsx`
- **Path:** `src/components/forge/diff-viewer.tsx`
- **Purpose:** Generated code review with file list, lint/test badges, approve/reject
- **Key exports:** `DiffViewer` (default export)
- **Dependencies:** `react` (useState), `@/src/stores/forge-store` (useForgeStore), shadcn `Button`
- **Details:**
  - `'use client'` directive
  - Props: `{ runId: string }`
  - Reads diff from forge store
  - Lint/test status badges (green ✓ or red ✗)
  - File count display
  - Error list (if any) in red box
  - File list: each file as a collapsible section
    - Button with file path, ▼/▲ toggle
    - Expanded: `<pre>` with green text, monospace, max-height with scroll
  - "Approve & Push MR" button:
    - Calls `POST /api/forge/runs/${runId}/approve`
    - On success: `setResult(data)`, `setStatus('complete')`
  - "Reject" button:
    - Calls `POST /api/forge/runs/${runId}/reject`
    - On success: `setStatus('rejected')`
  - Loading states for both buttons

#### `src/components/forge/diagnosis-panel.tsx`
- **Path:** `src/components/forge/diagnosis-panel.tsx`
- **Purpose:** Root cause, affected files, and fix plan display
- **Key exports:** `DiagnosisPanel` (default export)
- **Dependencies:** None (pure display component)
- **Details:**
  - Props: `{ rootCause: string, affectedFiles: string[], fixPlan: FixPlanStep[] }`
  - "Diagnosis" header in orange
  - Root cause text in orange-themed box
  - "Affected Files" section with monospace file paths
  - "Fix Plan" section as ordered list:
    - Each step has: number, action badge (create=green, modify=yellow, delete=red), file path (monospace), description

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
- [ ] All components render without React errors
- [ ] `ModeSelector` shows Build and Debug tabs, renders correct form
- [ ] `BuildForm` validates required fields (specText/file and repoUrl) before submission
- [ ] `BuildForm` supports both paste and file upload modes
- [ ] `DebugForm` validates required fields (bugDescription and repoUrl) before submission
- [ ] `RunStatusBadge` shows correct color for all 7 statuses
- [ ] `ModeBadge` shows correct color for build (indigo) and debug (orange)
- [ ] `LogViewer` auto-scrolls to bottom when new logs arrive
- [ ] `PlanApproval` shows PRD content for build mode
- [ ] `PlanApproval` shows diagnosis content for debug mode
- [ ] `DiffViewer` shows files with expandable code blocks
- [ ] `DiffViewer` shows lint/test badges
- [ ] `DiagnosisPanel` shows root cause, affected files, and fix plan
- [ ] `useForgeStore` correctly manages all state transitions
- [ ] All existing tests pass (`npm test`)

## Constraints
- Do NOT create any API routes — those belong to Phase 5
- Do NOT create any page-level components (app/forge/) — those belong to Phase 5
- Do NOT modify any existing components outside `src/components/forge/`
- Do NOT modify the sidebar — that's done in Phase 5
- Use existing shadcn/Radix primitives — do not install new UI libraries
- Match the existing dark theme (gray-900/950 backgrounds, white/gray text)

## Dependencies
- **Packages:** All already installed (zustand, react-syntax-highlighter, shadcn/Radix)
- **API keys required:** None (UI only)
- **External services:** None (UI only, API routes come in Phase 5)
