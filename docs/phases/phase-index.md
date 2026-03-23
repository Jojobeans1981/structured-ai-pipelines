# Forge UI Integration — Phase Index

## Overview
Integration of forge-ui features (typed build/debug agents, two-stage approval, GitLab MR publishing, run history) into the structured-ai-pipelines main project.

Generated from: `docs/PRD-forge-ui-integration.md`

## Phases
| Phase | Name | Files Created | Files Modified | Key Deliverables |
|-------|------|---------------|----------------|------------------|
| 0 | Database Schema & Dependencies | 8 | 1 | Prisma migration (6 models), npm deps, type definitions, CRUD module |
| 1 | Build Pipeline Agents | 9 | 0 | 5 build agents, repo utils, markdown utils, lessons context, build pipeline orchestration |
| 2 | Debug Pipeline Agents | 5 | 0 | 4 debug agents, debug pipeline orchestration |
| 3 | GitLab MR Publishing | 1 | 0 | Gitbeaker publish function, token retrieval |
| 4 | Forge UI Components | 11 | 0 | 9 React components, Zustand store, SSE hook |
| 5 | API Routes & Pages | 9 | 1 | 6 API routes, 3 pages, sidebar link |
| 6 | Skills DB Seeding | 0 | 10 | 9 skill records, agent prompt loading from DB, lesson recording |

## Usage
Feed each phase document to the `/prompt-builder` skill to generate implementation prompts:
1. Start with `phase-0.md`
2. After implementing Phase 0, proceed to `phase-1.md`
3. Continue sequentially through all phases

## File Map
| File Path | Created In | Modified In |
|-----------|------------|-------------|
| `prisma/schema.prisma` | — | Phase 0 |
| `src/services/forge/types/conventions.ts` | Phase 0 | — |
| `src/services/forge/types/prd.ts` | Phase 0 | — |
| `src/services/forge/types/manifest.ts` | Phase 0 | — |
| `src/services/forge/types/scaffold.ts` | Phase 0 | — |
| `src/services/forge/types/bug.ts` | Phase 0 | — |
| `src/services/forge/types/fix.ts` | Phase 0 | — |
| `src/services/forge/types/sse.ts` | Phase 0 | — |
| `src/services/forge/db.ts` | Phase 0 | — |
| `src/services/forge/utils/repo.ts` | Phase 1 | — |
| `src/services/forge/utils/markdown.ts` | Phase 1 | — |
| `src/services/forge/lessons-context.ts` | Phase 1 | — |
| `src/services/forge/agents/analyzer-agent.ts` | Phase 1 | Phase 6 |
| `src/services/forge/agents/prd-agent.ts` | Phase 1 | Phase 6 |
| `src/services/forge/agents/prompt-agent.ts` | Phase 1 | Phase 6 |
| `src/services/forge/agents/scaffolder-agent.ts` | Phase 1 | Phase 6 |
| `src/services/forge/agents/validator-agent.ts` | Phase 1 | Phase 6 |
| `src/services/forge/build-pipeline.ts` | Phase 1 | — |
| `src/services/forge/agents/archaeologist-agent.ts` | Phase 2 | Phase 6 |
| `src/services/forge/agents/root-cause-agent.ts` | Phase 2 | Phase 6 |
| `src/services/forge/agents/fix-planner-agent.ts` | Phase 2 | Phase 6 |
| `src/services/forge/agents/fix-scaffolder-agent.ts` | Phase 2 | Phase 6 |
| `src/services/forge/debug-pipeline.ts` | Phase 2 | — |
| `src/services/forge/utils/publish.ts` | Phase 3 | — |
| `src/components/forge/mode-selector.tsx` | Phase 4 | — |
| `src/components/forge/build-form.tsx` | Phase 4 | — |
| `src/components/forge/debug-form.tsx` | Phase 4 | — |
| `src/components/forge/run-status-badge.tsx` | Phase 4 | — |
| `src/components/forge/mode-badge.tsx` | Phase 4 | — |
| `src/components/forge/log-viewer.tsx` | Phase 4 | — |
| `src/components/forge/plan-approval.tsx` | Phase 4 | — |
| `src/components/forge/diff-viewer.tsx` | Phase 4 | — |
| `src/components/forge/diagnosis-panel.tsx` | Phase 4 | — |
| `src/stores/forge-store.ts` | Phase 4 | — |
| `src/hooks/use-forge-stream.ts` | Phase 4 | — |
| `app/api/forge/runs/route.ts` | Phase 5 | — |
| `app/api/forge/runs/[id]/route.ts` | Phase 5 | — |
| `app/api/forge/runs/[id]/stream/route.ts` | Phase 5 | — |
| `app/api/forge/runs/[id]/advance/route.ts` | Phase 5 | — |
| `app/api/forge/runs/[id]/approve/route.ts` | Phase 5 | — |
| `app/api/forge/runs/[id]/reject/route.ts` | Phase 5 | — |
| `app/forge/page.tsx` | Phase 5 | — |
| `app/forge/runs/page.tsx` | Phase 5 | — |
| `app/forge/runs/[id]/page.tsx` | Phase 5 | — |
| `src/components/layout/sidebar.tsx` | — | Phase 5 |
| `app/api/admin/seed-skills/route.ts` | — | Phase 6 |
