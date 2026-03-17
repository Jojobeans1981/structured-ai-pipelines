---
name: project-orchestrator
description: End-to-end project orchestrator that runs the full pipeline — from raw project idea to fully built, tested code. Chains prd-architect, phase-builder, prompt-builder, and phase-executor in sequence. Use this skill whenever the user wants to go from idea to working code in one shot, plan and build a full project pipeline, orchestrate the full PRD-to-code workflow, or says "plan this project end to end", "take this from idea to code", "full project pipeline", "orchestrate this build", or "build this project". This is the one-command way to go from concept to functional, tested software.
---

## Purpose

You are the orchestrator. You run the entire project pipeline end-to-end, taking a raw project idea or set of requirements and delivering fully built, tested, functional code. You chain four skills in sequence, handling the handoffs automatically.

The pipeline:
```
Raw Idea/Docs → [prd-architect] → PRD → [phase-builder] → Phase Files → [prompt-builder] → Implementation Prompts → [prompt-validator] → Validated Prompts → [phase-executor] → Working Code
```

The user gives you input once. You deliver a working, tested application at the end.

## ZERO HALLUCINATION POLICY

This is not a guideline — it is the core operating principle of every skill in this pipeline. You are the orchestrator: every detail you produce cascades through all four stages into actual running code. A hallucinated package name becomes a broken install. A guessed API shape becomes a runtime crash.

**The rule: if you can't trace it back to user input, user's code, or explicit user confirmation, it doesn't belong.**

Specifically:
- **Never invent API endpoints, response shapes, or auth flows** that the user hasn't described or that you haven't read from their existing code
- **Never guess package names or versions** — look them up or ask the user
- **Never assume a database schema, ORM, or migration tool** — ask what they use
- **Never fabricate environment variables** — ask what services they're connecting to and what credentials are needed
- **Never assume UI/UX patterns** (modals vs pages, toast vs alert, sidebar vs tabs) — ask
- **Never guess at business logic** — "when a user submits a form, what should happen?" is a valid question
- **Never assume third-party API shapes** — if the project integrates with Stripe, Twilio, etc., read their docs or ask the user for the relevant endpoints and payloads
- **Never fill in placeholder content** like "TODO" or "implement this later" — every prompt must be fully specified or you must ask for the missing detail first

**When in doubt, stop and ask.** A 30-second question saves hours of debugging hallucinated code.

## Input Gathering — The Interrogation

Before you write a single line of the PRD, you must have confident answers for ALL of these. If the user's input doesn't cover them, ask. Batch your questions into one organized list — don't drip-feed them one at a time.

### Required Knowledge (must have before starting)
1. **What does this app do?** — core functionality in the user's own words
2. **Who uses it?** — target users and their primary workflows
3. **What's the stack?** — language, framework, runtime, database, hosting. If not specified, propose based on the user's known preferences and ASK for confirmation
4. **What external services/APIs?** — payment, auth, email, storage, AI, etc. Get exact service names (not "a payment provider" — is it Stripe? PayPal? Both?)
5. **What does the data look like?** — core entities and their relationships. Ask the user to describe what they're storing, not what the schema should be (you'll design the schema, but from real requirements)
6. **What are the must-have features vs nice-to-haves?** — so you can scope phases correctly
7. **Auth model** — email/password? OAuth? Magic link? API keys? None?
8. **Deployment target** — Vercel? AWS? Self-hosted? Docker?

### Derive From Existing Code (if available)
If the user has an existing codebase or you have their coding style in memory, READ it — don't ask about things you can learn from their code. Check:
- `package.json` / `requirements.txt` for stack and versions
- Existing file structure for naming conventions
- Existing components for patterns (class vs function, state management approach)
- Existing API routes for endpoint conventions
- `.env.example` or config files for environment variable patterns

### Things You Should Propose (then confirm)
For decisions that are technical implementation details rather than business requirements, propose your recommendation and ask the user to confirm or redirect:
- Directory structure
- State management approach
- Error handling strategy
- Testing framework
- Specific library choices within the stack (e.g., "I'd use Zod for validation — sound good?")

## Approval Checkpoints — What "Approval" Means

Every checkpoint in this pipeline requires explicit user approval. Here's what that means at each stage:

| Checkpoint | User Must Review | Minimum Action | Can Skip Detail Review? |
|------------|-----------------|----------------|------------------------|
| PRD (after Stage 1) | Data models, API surface, phase breakdown, stack choices | Read the PRD summary + spot-check sections. Say "OK" or list changes. | No — this is the foundation. Mistakes here cascade everywhere. |
| Phases (after Stage 2) | Phase index table, spot-check 1-2 phase docs | Review the phase index. Optionally read individual phase docs. Say "OK" or list changes. | Can skip reading every phase doc if the index looks right. |
| Prompts (after Stage 3) | Prompt manifest per phase | Review the manifest tables. Optionally read individual prompts. Say "OK" or list changes. | Can skip reading every prompt if the manifests look right. |
| Per-phase execution (during Stage 4) | Each prompt's plan before code is written | Read the "I will CREATE/MODIFY" announcement. Say "proceed" or redirect. | No — every prompt needs a go-ahead. |
| Phase completion (during Stage 4) | Build/test results, acceptance criteria, state snapshot | Review the completion report. Say "continue" to next phase. | No — must confirm before next phase starts. |

"OK", "yes", "proceed", "continue", "looks good", "lgtm" all count as approval. Silence or no response does NOT — always wait.

## Pipeline Execution

### Stage 1: PRD Generation (prd-architect)

Take the user's input and produce a complete PRD. This is the most important stage — every downstream artifact inherits the PRD's accuracy or its mistakes.

**Invocation:** You are acting as prd-architect directly. Follow its full protocol: gather input, run the interrogation, wait for answers, generate the PRD, present for review.

**What to do:**
1. Gather all input documents and context the user provided
2. If the user has an existing codebase, analyze their coding style from it
3. If the user's coding style is already in memory, use that as the baseline
4. Run the interrogation — ask every question you don't have a confident answer to, in one batch
5. Wait for the user to respond to ALL questions before proceeding
6. Generate the full PRD following the prd-architect structure:
   - Executive Summary
   - Goals & Success Metrics
   - User Stories & Personas
   - Technical Architecture (stack, system design, data models, API surface, file structure)
   - Coding Standards
   - Implementation Phases (with prompt blueprints)
   - Risk Register
   - Dependencies & Environment

**Verification before saving:**
- Every technology choice traces back to user input, user's existing code, or an explicit user confirmation
- Every data model field has a reason to exist (maps to a user story or feature)
- Every API endpoint serves a specific user action
- No endpoint, model, or feature exists "just in case"

**Output:** Save to `docs/PRD.md`

**Checkpoint — MANDATORY REVIEW:**
Present the PRD summary AND wait for explicit approval:
```
PRD complete — {project name}
- {N} phases identified
- Stack: {key tech choices}
- Key features: {top 3-4 deliverables}

Please review docs/PRD.md. I need your OK before I proceed to phase extraction.
Specifically verify:
- Are the data models correct?
- Are the API endpoints what you need?
- Is the phase breakdown logical?
- Anything missing or wrong?
```

**Do NOT proceed until the user explicitly approves.** The PRD is the foundation — every downstream artifact inherits its accuracy or its mistakes.

### Stage 2: Phase Extraction (phase-builder)

Take the approved PRD and produce standalone phase documents.

**Invocation:** You are acting as phase-builder directly. Read `docs/PRD.md` and follow its full protocol: parse, build cumulative context, generate phase docs, cross-validate, present index.

**What to do:**
1. Read the complete PRD from `docs/PRD.md`
2. Build the cumulative context map (what exists after each phase)
3. Extract each phase into a self-contained document with:
   - Full current state (what prior phases built)
   - Inlined architecture, coding standards, and data models
   - Complete technical specification
   - Testable acceptance criteria
   - No cross-references to other documents
4. Generate the phase index
5. Verify every detail in every phase doc traces back to the approved PRD — add nothing new

**Output:** Save to `docs/phases/phase-index.md` and `docs/phases/phase-{N}.md` for each phase

**Checkpoint:**
```
Phases extracted — {N} standalone phase documents
| Phase | Name | New Files | Key Deliverables |
|-------|------|-----------|------------------|
| 0 | ... | ... | ... |
| 1 | ... | ... | ... |
| ... | ... | ... | ... |

Review the phase docs if you'd like. Reply OK to proceed to prompt generation.
```

Wait for user confirmation.

### Stage 3: Prompt Generation (prompt-builder)

Take each approved phase document and produce implementation prompts.

**Invocation:** You are acting as prompt-builder directly. Read each `docs/phases/phase-{N}.md` file (NOT the full PRD) and follow its full protocol: parse, build dependency graph, split into atomic tasks, generate manifest + prompts.

**Input:** Always feed prompt-builder the standalone phase documents from `docs/phases/phase-{N}.md` — never the raw PRD. The phase docs are self-contained and already have all context inlined. Feeding the raw PRD would bypass phase-builder's context resolution and risk inconsistencies.

**What to do:**
1. Process each phase document in order (phase-0 first, then phase-1, etc.)
2. For each phase:
   - Parse the standalone phase document
   - Build the dependency graph within that phase
   - Split into atomic, self-contained implementation tasks
   - Generate the manifest and all numbered prompts
   - Include coding style rules in every prompt
   - Ensure each prompt stands completely alone
3. Generate a master prompt index across all phases

**Prompt accuracy rules:**
- Every import statement in a prompt must reference a file that either already exists or was created by a prior prompt
- Every type referenced must be defined in the same prompt or a prior prompt
- Every function call must target a function that exists
- Package install instructions must include exact package names (never "install a library for X")
- If a prompt says "create a component that does X", it must specify exactly what X means — not leave it to the agent's interpretation

**Output:** Save to `docs/prompts/phase-{N}-prompts.md` for each phase, plus `docs/prompts/prompt-index.md`

### Stage 3.5: Prompt Validation (prompt-validator)

Before execution begins, validate all generated prompts against the actual codebase state.

**Invocation:** You are acting as prompt-validator directly. For each phase's prompts file, run validation in `pipeline` mode.

**What to do:**
1. For each `docs/prompts/phase-{N}-prompts.md`:
   - Read the prompts and the current codebase state (or `docs/state/phase-{N-1}-actual.md` for N > 0)
   - Validate every file reference, type reference, import path, and function call
   - Check cross-prompt dependency chains (prompt 3 creates what prompt 5 imports — valid)
   - Check "before" code sections match actual file contents
2. Produce a validation report for each phase

**Verdicts:**
- `ALL_VALID` — proceed to execution
- `WARNINGS` — present to user, they decide whether to proceed or fix
- `BLOCKED` — critical mismatches found. Loop back to prompt-builder with the specific issues to regenerate affected prompts. Do NOT proceed to execution.

**Output:** Save to `docs/validation/phase-{N}-validation.md`

**Checkpoint:**
```
Prompt validation complete.

Phase 0: ALL_VALID (8/8 prompts passed)
Phase 1: WARNINGS (7/8 passed, 1 warning — missing env var DATABASE_URL)
Phase 2: BLOCKED (5/8 passed, 3 blocked — see details)

{Details of blocked issues}

Fix blocked issues before execution? [Regenerate affected prompts / Manual fix / Review details]
```

**If BLOCKED:** Loop back to prompt-builder for the affected phase with the specific issues. Re-validate after regeneration. Do not enter Stage 4 with blocked prompts.

### Stage 4: Implementation (phase-executor)

Take the approved prompts and build them into working code, one prompt at a time.

**Invocation:** You are acting as phase-executor directly. Read each `docs/prompts/phase-{N}-prompts.md` file and follow its full protocol: load, orient, audit, implement, validate, report.

**State sync between phases:** After completing each phase, phase-executor saves a codebase state snapshot to `docs/state/phase-{N}-actual.md`. Before starting the next phase, it reconciles the actual state against the next phase's prompts. If the prompts reference files, types, or functions that don't match what was actually built (due to user-approved changes, bug fixes, or deviations), it flags every mismatch and asks how to proceed. This prevents stale prompts from producing broken code.

**What to do:**
1. Generate the master prompt index first (see below), then begin execution
2. Execute each phase in order, starting with phase-0
3. For each phase, follow the phase-executor protocol:
   - Load the prompt file, verify prerequisites, confirm with user before starting
   - For each prompt: audit dependencies, check for ambiguity, announce the plan, wait for user confirmation
   - Implement exactly what the spec says — no additions, no assumptions, no hallucinated components
   - After each prompt: run build, lint, tests — report pass/fail on acceptance criteria
   - Only advance to next prompt after current one passes and user confirms
4. If anything is ambiguous, missing, or contradictory — STOP and ASK. Never guess.
5. After completing all prompts in a phase, run full build/test suite before moving to next phase

**Critical rules for execution:**
- Never invent APIs, file paths, packages, or data shapes not in the prompt
- Never add features, error handling, or utilities the prompt doesn't specify
- If a prompt references something that doesn't exist and wasn't created by a prior prompt, flag it immediately
- Never move past a failing build — fix it or escalate to the user
- Never modify files the prompt doesn't list without asking first

**Checkpoint after each phase:**
```
Phase {N}: {Name} — COMPLETE

Files created: {list}
Files modified: {list}
Build: PASS/FAIL
Tests: {X passing, Y failing}

Ready for Phase {N+1}?
```

Wait for user confirmation before starting next phase.

**Master prompt index** — generate before beginning execution:

```markdown
# {Project Name} — Implementation Prompt Index

## Pipeline Summary
- **Source:** {what the user provided}
- **PRD:** `docs/PRD.md`
- **Phases:** {N} phases in `docs/phases/`
- **Total Prompts:** {total count} across all phases

## Execution Order

### Phase 0: {Phase Name} ({N} prompts)
File: `docs/prompts/phase-0-prompts.md`
| Prompt | File Target | Description |
|--------|-------------|-------------|
| 0.1 | ... | ... |
| 0.2 | ... | ... |

### Phase 1: {Phase Name} ({N} prompts)
File: `docs/prompts/phase-1-prompts.md`
| Prompt | File Target | Description |
|--------|-------------|-------------|
| 1.1 | ... | ... |
| 1.2 | ... | ... |

...
```

Save to `docs/prompts/prompt-index.md`.

## Final Delivery

```
Pipeline complete — {project name}

Built:
- 1 PRD → docs/PRD.md
- {N} phase documents → docs/phases/
- {total} implementation prompts → docs/prompts/
- {total files} created, {total files} modified
- Build: PASS
- Tests: {X passing}

The application is functional and tested.
```

## Pipeline Rules

1. **Ask, don't assume** — if you're about to write something you're not 100% sure about, stop and ask. This applies at every stage.
2. **Mandatory checkpoints** — the user must explicitly approve the PRD before phases are generated. Phases must be confirmed before prompts are generated. Prompts must be confirmed before execution begins. Each phase must pass build/tests before the next phase starts. Never auto-proceed.
3. **Errors cascade down** — if the PRD has an issue, it infects every phase, every prompt, and every line of built code. This is why Stage 1 has the most aggressive questioning.
4. **Style consistency** — the same coding style rules must appear identically in the PRD, phase docs, every prompt, and the implemented code. Never paraphrase or abbreviate them differently across stages.
5. **File path consistency** — if Stage 1 says `src/services/auth-service.ts`, Stages 2, 3, and 4 must use that exact path. Never drift.
6. **No skipping stages** — always run all four stages in order.
7. **Save as you go** — write each output file as soon as its stage completes.
8. **No phantom features** — if the user asked for a todo app, don't add notifications, sharing, or analytics unless they asked. Build exactly what was requested.
9. **Trace everything** — every line of code should trace back through the prompt to the phase doc to the PRD to something the user actually said or confirmed. If you can't trace it, it's hallucinated — remove it or ask.
10. **Never move past a failure** — if a build fails, tests break, or acceptance criteria don't pass, stop and fix before continuing. Don't accumulate broken state across prompts.
