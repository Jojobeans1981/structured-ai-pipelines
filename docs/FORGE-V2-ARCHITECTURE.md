# Forge V2 — Agent Architecture Blueprint

## System Overview

Forge V2 is a multi-agent AI pipeline that takes user input and produces fully launchable software. Every agent has one job, never drifts from its context, and is observable end-to-end.

Two pipeline directions:
- **Build Pipeline** — idea → PRD → phases → prompts → verified code → deployed
- **Diagnostic Pipeline** — broken code → symptoms → trace → root cause → fix → verified

Both pipelines share the same observability, traceability, and quality gate infrastructure.

---

## Agent Registry

### 1. FOREMAN (Orchestrator Agent)
**Job:** Route work, manage pipeline state, learn from failures.
**Tools:** Pipeline state machine, agent dispatch, learning store.
**Input:** User request + pipeline type.
**Output:** Ordered list of agent tasks with dependencies.
**Boundaries:**
- NEVER generates code or content
- NEVER makes architectural decisions
- ONLY routes, schedules, and learns
**Learning:** After every rejection/failure, records the pattern. Before dispatching, checks learning store to avoid known mistakes.

### 2. ARCHITECT (PRD Agent)
**Job:** Generate complete PRDs from user input.
**Tools:** PRD template, Socratic question engine.
**Input:** User text/requirements.
**Output:** Complete PRD with tech stack, data models, API surface, file structure, phases.
**Boundaries:**
- NEVER assumes — uses Socratic method for ambiguities
- NEVER generates code
- ONLY produces specification documents
**Quality gate:** PRD must have all required sections filled. No TODOs, no placeholders.

### 3. DECOMPOSER (Phase Builder Agent)
**Job:** Break PRD into SSOT phase documents.
**Tools:** Phase template, dependency analyzer.
**Input:** Approved PRD.
**Output:** Ordered phase documents with acceptance criteria.
**Boundaries:**
- Each phase must be independently testable
- Each phase must leave the app in a launchable state
- NEVER generates code
**Quality gate:** Every user story maps to at least one phase. No circular dependencies.

### 4. EVALUATOR (Sub-Phase Agent)
**Job:** Analyze each phase, determine if sub-phases are needed.
**Tools:** Complexity scorer, dependency checker.
**Input:** Single phase document.
**Output:** Phase document (unchanged) OR phase + sub-phase documents.
**Decision criteria:**
- Phase has >5 distinct deliverables → split
- Phase touches >3 system boundaries → split
- Phase estimated >2 hours → split
**Boundaries:**
- NEVER modifies the phase objective
- ONLY adds sub-phases, never removes scope

### 5. PROMPT SMITH (Prompt Builder Agent)
**Job:** Convert phases/sub-phases into implementation prompts.
**Tools:** Prompt template, context assembler.
**Input:** Phase document + all prior approved artifacts.
**Output:** Atomic, self-contained implementation prompts.
**Boundaries:**
- Each prompt includes: role, context, task, specs, file operations, acceptance criteria, constraints
- Each prompt is self-contained (agent with no history can execute it)
- NEVER generates code

### 6. SENTINEL (Prompt Verifier Agent)
**Job:** Score confidence that a prompt will produce correct output.
**Tools:** Confidence scorer, context checker, acceptance criteria validator.
**Input:** Implementation prompt + phase spec + PRD context.
**Output:** Confidence score (0-100%) + reasoning.
**Decision:**
- ≥80% → PASS to executor
- <80% → REJECT back to Prompt Smith with specific issues
- Record rejection reason in learning store for Foreman
**Boundaries:**
- NEVER modifies prompts
- ONLY scores and explains
**Checks:**
1. Does the prompt reference all deliverables from the phase?
2. Are file paths consistent with the PRD file structure?
3. Are dependencies from prior phases available in context?
4. Is the tech stack consistent?
5. Are acceptance criteria testable?

### 7. EXECUTOR (Code Generation Agent)
**Job:** Execute verified prompts to generate code.
**Tools:** LLM code generation, file writer.
**Input:** Verified implementation prompt.
**Output:** Complete, runnable code files.
**Boundaries:**
- ONLY generates files specified in the prompt
- NEVER deviates from the tech stack
- NEVER generates placeholder/TODO code
- Includes observability in every file (error boundaries, logging)
**Quality gate:** Output validator checks tech stack compliance.

### 8. INSPECTOR (Phase Completeness Verifier)
**Job:** After each phase, verify ALL prior work is 100% complete.
**Tools:** File checker, import resolver, acceptance criteria tester.
**Input:** All generated files + all phase acceptance criteria.
**Output:** Completeness report (pass/fail per criterion).
**Checks:**
1. Every file referenced by imports exists
2. Every acceptance criterion from every completed phase passes
3. No broken references between phases
4. App is in a launchable state
**On failure:** Report specific gaps. Foreman routes back to appropriate agent.

### 9. SCRIBE (Documentation Agent)
**Job:** Update all project documentation after each phase.
**Tools:** Doc writer, git committer.
**Input:** Completed phase + metrics + trace data.
**Output:** Updated docs:
- `docs/DEV_LOG.md` — what was built, when, files created
- `docs/AI_COST_LOG.md` — tokens, cost, model used per phase
- `docs/AI_DECISIONS.md` — decisions made, alternatives considered
- `docs/ISSUES_TRACKER.md` — issues found, status, resolution
**After writing:** Commits to GitLab with structured commit message.

### 10. GUARDIAN (Context Integrity Agent)
**Job:** Prevent context drift. Verify all context is accessible.
**Tools:** Context searcher, doc indexer.
**Input:** Current pipeline state + all artifacts.
**Checks (runs before every agent dispatch):**
1. Agent receiving task has access to all required context
2. No contradictions between artifacts
3. All referenced files/docs exist and are current
4. Learning store entries are relevant and not stale
**On drift detected:** Halt pipeline, report to Foreman with specifics.

### 11. SOCRATES (Issue Resolver Agent)
**Job:** When any agent encounters an unsolved issue, ask questions until resolved.
**Tools:** Question generator, user prompt, answer validator.
**Input:** Unsolved issue description + context.
**Flow:**
1. Generate targeted questions about the issue
2. Present to user (or to the originating agent if it's a technical question)
3. Validate answers resolve the ambiguity
4. Only mark resolved when verified
**Boundaries:**
- NEVER guesses answers
- NEVER skips questions
- Records all Q&A in the issues tracker

---

## Diagnostic Pipeline Agents (Reverse)

### 12. INTAKE (Bug Intake Agent)
**Job:** Collect structured bug report from symptoms.
**Same as build Agent #2 but for bugs.

### 13. ARCHAEOLOGIST (Code Tracer Agent)
**Job:** Trace bug symptoms through the codebase.
**Maps every file and function involved.

### 14. DIAGNOSTICIAN (Root Cause Agent)
**Job:** Analyze evidence, identify root cause.
**Verdict: CONFIRMED, HYPOTHESIS, or INSUFFICIENT.

### 15. SURGEON (Fix Agent)
**Job:** Plan and execute minimal fix.
**Uses same Prompt Smith → Sentinel → Executor chain.

---

## Quality Gate Protocol

Every agent handoff passes through this gate:

```
Agent A completes work
    ↓
Guardian checks context integrity
    ↓
Sentinel scores confidence (for prompts)
    ↓
Inspector verifies completeness (for code)
    ↓
Scribe updates docs
    ↓
Foreman dispatches next agent
```

If any gate fails:
1. Record the failure reason
2. Route back to the appropriate agent with the failure context
3. Foreman records the pattern in learning store
4. Max 3 retries before escalating to user

---

## Observability Requirements

### Every prompt must include:
- Error boundaries in generated React components
- Console logging with [ComponentName] prefix
- TypeScript strict mode (no any)
- Error handling for all async operations

### Every phase completion records:
- Token usage (input/output/model/cost)
- Duration (wall clock + compute)
- Files created/modified
- Acceptance criteria pass/fail
- Confidence score from Sentinel
- Completeness score from Inspector

### Metrics page shows:
- Latest averages across all runs (auto-refresh)
- Per-run breakdown accessible
- Token/cost trends over time
- Success rate, first-pass rate, rejection rate
- Agent performance (which agents reject most, which phases fail most)

---

## Learning Store Schema

```
{
  id: string,
  pattern: string,       // "phase-builder produced phase with missing acceptance criteria"
  source_agent: string,  // "sentinel"
  target_agent: string,  // "phase-builder"
  rejection_count: number,
  first_seen: Date,
  last_seen: Date,
  resolution: string,    // "added explicit AC requirement to phase template"
  status: "active" | "resolved"
}
```

Foreman checks this before every dispatch. If a known pattern applies, it injects a warning into the agent's context.

---

## Git Integration

After each phase:
1. Scribe generates commit message from phase summary
2. Commits all new/modified files
3. Pushes to GitLab
4. Updates doc files in same commit

Commit format:
```
feat(phase-N): {phase title}

Files: {count} created, {count} modified
Tokens: {input}in/{output}out ({model})
Cost: ${cost}
Confidence: {sentinel_score}%
Completeness: {inspector_score}%

Co-Authored-By: Forge AI Pipeline <forge@gauntletai.com>
```

---

## Implementation Priority

### Phase 1: Core Agent Loop (Critical Path)
- Foreman orchestrator with learning store
- Sentinel (prompt confidence scorer)
- Inspector (phase completeness verifier)
- Wire into existing pipeline

### Phase 2: Quality Infrastructure
- Guardian (context integrity)
- Socrates (issue resolver)
- Sub-phase evaluator
- Rejection → re-generation loop

### Phase 3: Documentation & Git
- Scribe (doc updater)
- Git commit per phase
- Searchable doc index

### Phase 4: Diagnostic Pipeline
- Wire reverse pipeline agents
- Share quality gates with build pipeline

### Phase 5: Metrics & Observability Polish
- Live metrics dashboard
- Agent performance tracking
- Learning store insights
- Trend charts
