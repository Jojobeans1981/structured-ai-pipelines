# Gauntlet Forge — Athena Digital Case Study Response

## Executive Summary

Gauntlet Forge is a working software factory that takes a feature specification and outputs complete, verified, deployable code — with full observability, human-in-the-loop gates, and a self-improving learning system. It is deployed and running at https://structured-ai-pipelines.vercel.app.

This is not a prototype or a design document. It is a production system with 25 services, 26 API endpoints, 15 specialized agents, and a complete audit trail for every decision made.

---

## How Forge Addresses Each Requirement

### 1. Codebase Intelligence

**The question:** How does the factory learn each product's conventions?

**Forge's answer:** Skill-based prompt architecture with context chaining.

Each stage in the pipeline runs a **skill** — a reusable prompt template loaded from `.claude/skills/{name}/SKILL.md`. The PRD Architect skill enforces zero-hallucination policy and extracts coding style from the user's existing codebase. The Phase Executor skill injects the approved PRD, phase spec, and all prior artifacts as context — so every code generation call sees the full picture of what exists.

**Concrete implementation:**
- `SkillLoader` (src/services/skill-loader.ts) — loads and caches skill prompts at runtime
- `DAGExecutor.getNodeContext()` — chains artifacts from dependency nodes, not just the previous stage
- `StageExecutor` — streams code through Claude/Groq with full context window
- 21 specialized skills covering build, diagnostic, and cross-cutting concerns

**How it stays current:** Context is assembled at execution time from the latest approved artifacts. No stale index — every run reads the current state.

**Scaling to 7 repos:** Skills are stack-agnostic templates. The PRD stage captures the target repo's tech stack, conventions, and patterns. The Executor receives this as context. The same pipeline handles React, Python, Go — the intelligence is in the prompt, not hardcoded per repo.

---

### 2. Orchestration & Decomposition

**The question:** How does "add payment methods" decompose into ordered tasks?

**Forge's answer:** DAG-based execution with dynamic graph expansion.

When a user starts a pipeline, the **Intake Agent** generates a Directed Acyclic Graph (DAG) of execution nodes — not a linear list. The user approves the plan before execution begins. Phases that don't depend on each other can run in parallel. When the Phase Builder produces phases, the **Graph Expander** dynamically creates new nodes (prompt-builder → phase-executor pairs) for each phase.

**Concrete pipeline for "Payment Methods":**

```
User Input → PRD Generation → Phase Extraction → [Phase 0: DB Migration]
                                                  [Phase 1: API Endpoints]  (depends on Phase 0)
                                                  [Phase 2: React Components] (depends on Phase 1)
                                                  [Phase 3: Tests]  (depends on Phases 1+2)
                                                  [Phase 4: Config & Permissions]
                                                → Build Verification → Final Review
```

Each phase goes through: Prompt Builder → **Sentinel Verification** (≥80% confidence required) → Phase Executor → **Inspector Verification** (completeness check) → Human Approval.

**How this beats BMAD:**
- BMAD is linear. Forge is a DAG with parallel execution.
- BMAD loses context between personas. Forge chains every approved artifact forward via `getNodeContext()`.
- BMAD has no rejection loop. Forge's Sentinel rejects bad prompts back to the Phase Builder with specific issues.

**How this beats Ralph:**
- Ralph is nondeterministic — same input, different execution paths. Forge's DAG is deterministic: approved plan = exact execution order.
- Ralph is a black box. Forge logs every decision to `TraceEvent` with span hierarchy — fully debuggable.
- Ralph can't do human-in-the-loop mid-pipeline. Forge gates every stage.

**Mid-pipeline failure recovery:**
- `TriageAgent` (src/services/triage-agent.ts) — decides: retry with error context, reroute to earlier stage, or escalate to human
- `LearningStore` (src/services/learning-store.ts) — records every failure pattern so the system doesn't repeat it

**Implementation:**
- `IntakeAgent` — generates execution plan from user input
- `DAGExecutor` — validates plan, manages topological execution, handles parallel nodes
- `GraphExpander` — dynamically creates new nodes after Phase Builder completes
- `AgentCoordinator` — spawns 5 concurrent analysis agents for routing decisions

---

### 3. Quality & Verification

**The question:** How do you build verification into the pipeline rather than bolting it on?

**Forge's answer:** Three verification layers at three points in the pipeline.

**Layer 1: Sentinel (Pre-Execution)**
Before any code is generated, the **Sentinel Agent** scores the implementation prompt's confidence (0-100%). It checks 7 dimensions:
1. Does the prompt reference all deliverables from the phase?
2. Are file paths consistent with the PRD?
3. Are dependencies from prior phases available?
4. Is the tech stack consistent?
5. Are acceptance criteria testable?
6. Is there enough detail for complete (not stub) code?
7. Is the prompt self-contained?

**Below 80% → rejected back to Phase Builder** with specific issues. The rejection is recorded in the Learning Store so the system improves.

**Layer 2: Output Validator (Post-Generation)**
After code is generated, the **Output Validator** checks:
- Generated file extensions match the specified tech stack (React project → no .py files)
- Wrong-stack files are automatically filtered before saving
- Empty files and TODO placeholders are flagged

**Layer 3: Inspector (Post-Phase)**
After each phase is approved, the **Inspector Agent** verifies:
- All imports resolve to existing files
- All acceptance criteria from ALL completed phases still pass
- No stubs or placeholder code
- The app is in a launchable state

**Layer 4: Docker Sandbox (Build Verification)**
On environments with Docker, a `node:20-slim` container:
1. Copies all generated files
2. Runs `npm install`
3. Runs `npm run build`
4. Starts the app and health-checks port 3000/5173
5. Reports pass/fail with full stdout/stderr

**Implementation:**
- `SentinelAgent` — confidence scoring with 80% threshold
- `OutputValidator` — tech stack enforcement
- `InspectorAgent` — completeness verification
- `DockerSandbox` — isolated build execution
- `ConfidenceScore` model — persists every score with checks and attempt number
- `CompletenessCheck` model — persists every phase verification

---

### 4. Human Interface & Trust

**The question:** What does the engineer see? How do they intervene?

**Forge's answer:** Transparency at every layer.

**What the engineer sees:**

1. **Plan Approval** — Before execution starts, the engineer sees the full DAG: every stage, dependencies, parallel groups. They approve the plan or modify it.

2. **Progress Bar** — During execution: "3 of 7 stages complete (43%)" with elapsed timer, colored pills per stage (green=done, orange=running, yellow=awaiting).

3. **Streaming Output** — Real-time token-by-token streaming as code generates. The engineer watches the AI work.

4. **Sentinel Verdict** — After prompt generation, the engineer sees: "✅ Sentinel: 87% confidence — PASSED" with check-by-check breakdown. If it fails: "❌ 62% confidence — Issues: missing Zustand store reference from Phase 1."

5. **Checkpoint Gates** — Every stage pauses for approval. The engineer can:
   - **Approve** — proceed to next stage
   - **Reject with feedback** — stage re-runs with their corrections injected
   - **Respond** — answer questions the AI asked (Socratic method)
   - **Edit** — modify the artifact directly before approving

6. **Build Summary** — After completion: duration (wall clock vs compute), tokens, cost, files generated, ROI estimate, 8 verification checks with pass/fail, SHA-256 tamper-evident hash.

7. **Pipeline Trace** — Full event timeline: every stage start/complete, agent spawn, vote, decision, approval, rejection — with timestamps, token counts, and costs.

8. **Metrics Dashboard** — Across all runs: success rate, first-pass rate, avg duration, total tokens, total cost.

**How trust is built:**
- The engineer starts by reviewing everything (current state)
- The Sentinel score gives them confidence in prompt quality before code generates
- The Inspector confirms completeness after each phase
- The trace timeline proves exactly what happened and why
- The learning store shows the system getting better over runs

**Implementation:**
- `PipelineView` component — orchestrates the full UI
- `ProgressBar` — real-time progress
- `CheckpointGate` — approve/reject/respond/edit
- `TraceTimeline` — event timeline with expandable spans
- `BuildSummaryPanel` — post-build report with verification
- `CostDisplay` — real-time cost tracking
- `MetricsCards` — dashboard with averages

---

## The Worked Example: Payment Methods

**Input:** "Add payment methods management to merchant dashboard. CRUD with Vault integration, audit logging, permission gate."

**Stage 1: PRD Generation** (prd-architect skill)
→ Produces complete PRD: entity fields, API endpoints, file structure, acceptance criteria
→ Engineer approves

**Stage 2: Phase Extraction** (phase-builder skill)
→ Breaks into 5 phases: DB Migration, API Layer, React Components, Tests, Config
→ Each phase has specific deliverables and acceptance criteria
→ Engineer approves

**Stage 3-7: For each phase:**
→ Prompt Builder generates implementation prompt
→ **Sentinel scores confidence** (e.g., 91% — all checks pass)
→ Engineer approves prompt
→ Phase Executor generates code (streaming, real-time)
→ **Output Validator** checks tech stack compliance
→ **Inspector verifies** completeness against all prior phases
→ Files saved to database
→ Engineer approves code
→ **Docker Sandbox** runs npm install + build (when available)

**Stage 8: Final Review**
→ Build Summary: 14 files, 2.3k tokens, $0.12, all verification checks pass
→ Engineer downloads ZIP or views files in browser

**Total:** Specification → deployable code with full audit trail.

---

## Observability & Traceability

Every pipeline run produces:

| Artifact | Storage | Purpose |
|----------|---------|---------|
| TraceEvent records | Neon Postgres | Every event with span hierarchy |
| ConfidenceScore records | Neon Postgres | Sentinel evaluation per prompt |
| CompletenessCheck records | Neon Postgres | Inspector verification per phase |
| AgentVote records | Neon Postgres | Concurrent agent decisions |
| LearningEntry records | Neon Postgres | Failure patterns for improvement |
| PipelineMetric records | Neon Postgres | Run-level aggregates |
| Build Summary JSON | Exportable | Tamper-evident with SHA-256 hash |

**Query any run:** `GET /api/pipeline/{runId}/trace` returns the complete audit trail.

---

## Architecture Diagram

```
                        ┌─────────────────────────┐
                        │     User Input / PRD     │
                        └────────────┬────────────┘
                                     │
                        ┌────────────▼────────────┐
                        │   FOREMAN (Orchestrator) │
                        │  + Learning Store        │
                        └────────────┬────────────┘
                                     │
                   ┌─────────────────┼─────────────────┐
                   │                 │                   │
          ┌────────▼──────┐  ┌──────▼───────┐  ┌──────▼───────┐
          │  PRD Architect │  │ Phase Builder │  │ Prompt Smith │
          └────────┬──────┘  └──────┬───────┘  └──────┬───────┘
                   │                │                   │
                   │                │          ┌────────▼────────┐
                   │                │          │    SENTINEL     │
                   │                │          │  (≥80% gate)    │
                   │                │          └────────┬────────┘
                   │                │                   │
                   │                │          ┌────────▼────────┐
                   │                │          │    EXECUTOR     │
                   │                │          │  (code gen)     │
                   │                │          └────────┬────────┘
                   │                │                   │
                   │                │          ┌────────▼────────┐
                   │                │          │   INSPECTOR     │
                   │                │          │  (completeness) │
                   │                │          └────────┬────────┘
                   │                │                   │
                   └────────────────┼───────────────────┘
                                    │
                        ┌───────────▼───────────┐
                        │   Docker Sandbox      │
                        │   (build verification)│
                        └───────────┬───────────┘
                                    │
                        ┌───────────▼───────────┐
                        │   Human Review Gate   │
                        └───────────┬───────────┘
                                    │
                        ┌───────────▼───────────┐
                        │  Build Summary + Trace │
                        │  + Metrics + Audit     │
                        └───────────────────────┘
```

---

## V1 Scope (60-Day) vs Later Phases

| Feature | V1 (Built) | Later |
|---------|-----------|-------|
| Build pipeline (idea → code) | ✅ | |
| Diagnostic pipeline (bug → fix) | ✅ | |
| DAG execution with parallel nodes | ✅ | |
| Human-in-the-loop gates | ✅ | |
| Sentinel prompt verification | ✅ | |
| Inspector completeness verification | ✅ | |
| Learning store (self-improvement) | ✅ | |
| Output tech stack validator | ✅ | |
| Docker sandbox build verification | ✅ | |
| Full observability (trace, metrics, cost) | ✅ | |
| Multi-model fallback (Claude → Groq → Ollama) | ✅ | |
| Git commit per phase | | Phase 2 |
| Guardian (context drift detection) | | Phase 2 |
| Socrates (issue resolver) | | Phase 2 |
| Sub-phase evaluator | | Phase 2 |
| Codebase indexing (existing repo analysis) | | Phase 3 |
| Template marketplace | | Phase 3 |
| Multi-repo support (7 products) | | Phase 3 |

---

## Key Metrics

- **25 services** powering the pipeline
- **15 specialized agents** each with one job
- **26 API endpoints** covering the full lifecycle
- **14 database models** for complete data capture
- **21 skills** (reusable prompt templates)
- **3 verification layers** (Sentinel, Validator, Inspector)
- **4 LLM fallback chain** (Claude → Groq → Ollama → static rules)
- **Full audit trail** — every decision, every token, every dollar

---

## Live Demo

**URL:** https://structured-ai-pipelines.vercel.app
**Auth:** GitLab OAuth via labs.gauntletai.com
**Source:** https://labs.gauntletai.com/guisseppepanetta/gauntlet-forge
