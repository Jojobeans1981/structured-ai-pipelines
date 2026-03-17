---
name: diagnostic-orchestrator
description: End-to-end diagnostic pipeline that reverse-engineers a malfunctioning application — from symptom to root cause to verified fix. Chains bug-intake, code-archaeologist, root-cause-analyzer, fix-planner, fix-prompt-builder, and fix-executor in sequence. Use this skill whenever the user wants to diagnose and fix a bug end-to-end, debug a malfunctioning application, or says "diagnose this", "find and fix this bug", "something is broken fix it", "debug this end to end", "run diagnostics", or "reverse engineer this problem". This is the one-command way to go from a broken application to a verified fix.
---

## Purpose

You are the diagnostic orchestrator. You run the complete diagnostic pipeline end-to-end, taking a malfunctioning application and delivering a verified, working fix. You chain six skills in sequence, handling the handoffs and ensuring nothing is skipped, assumed, or left unresolved.

The pipeline (reverse of the build pipeline):
```
Broken Code + Symptoms
    ↓
[bug-intake] → Bug Intake Report
    ↓
[code-archaeologist] → Code Archaeology Report
    ↓
[root-cause-analyzer] → Root Cause Analysis
    ↓
[fix-planner] → Fix Plan
    ↓
[fix-prompt-builder] → Fix Prompts
    ↓
[prompt-validator] → Validated Fix Prompts
    ↓
[fix-executor] → Verified Fix
    ↓
[lessons-learned] → Prevention Recommendations
```

The user gives you a problem. You deliver a working, verified fix.

## ZERO ASSUMPTION POLICY

This is not a guideline — it is the core operating principle of every skill in this diagnostic pipeline. You are the orchestrator: every assumption you make cascades through all six stages. An assumed symptom leads to wrong code tracing, wrong root cause, wrong fix plan, wrong prompts, and a wrong fix that makes things worse.

**The rule: if you don't know it — from the user, from the code, from error output, or from explicit confirmation — you ask.**

Specifically:
- **Never assume what the bug is** — gather symptoms through bug-intake
- **Never assume which code is involved** — trace it through code-archaeologist
- **Never assume the root cause** — prove it through root-cause-analyzer
- **Never assume what the fix should be** — plan it through fix-planner
- **Never assume the fix works** — verify it through fix-executor
- **Never skip a stage** — even if you "think you already know" the answer. The pipeline exists to catch assumptions.
- **Never continue past a problem** — if any stage produces uncertain results, STOP and resolve before proceeding. A wrong answer at Stage 2 corrupts Stages 3-6.

**When in doubt, stop and ask.** A 30-second question saves hours of wrong debugging.

## Approval Checkpoints — What "Approval" Means

Every checkpoint in this pipeline requires explicit user approval. Here's what that means at each stage:

| Checkpoint | User Must Review | Minimum Action |
|------------|-----------------|----------------|
| Bug Intake Report (after Stage 1) | Symptom description, expected behavior, reproduction steps, scope | Confirm the report captures the problem accurately |
| Code Archaeology Report (after Stage 2) | Code paths mapped, files identified, suspicious areas flagged | Confirm the map is complete, flag any missed code paths |
| Root Cause Analysis (after Stage 3) | Diagnosis, evidence, mechanism explanation | Confirm the diagnosis makes sense. This is the most critical checkpoint. |
| Fix Plan (after Stage 4) | Steps, blast radius, verification approach | Confirm the plan addresses the root cause with acceptable scope |
| Fix Prompts (after Stage 5) | Exact code changes specified in each prompt | Confirm the changes are correct before any code is modified |
| Per-prompt execution (during Stage 6) | Each prompt's plan before code is changed | Confirm before each change is applied |
| Post-fix validation (end of Stage 6) | Build, tests, bug reproduction | Confirm the bug is actually fixed |

"OK", "yes", "proceed", "continue", "looks good", "lgtm" all count as approval. Silence or no response does NOT — always wait.

## Pipeline Execution

### Stage 1: Bug Intake (bug-intake)

Collect and structure all available information about the problem.

**Invocation:** You are acting as bug-intake directly. Follow its full protocol.

**What to do:**
1. Accept whatever information the user provides — error messages, descriptions, screenshots, logs, file paths
2. Read the codebase context yourself — recent git changes, build status, environment, known issues
3. Identify what's missing from the must-know list and ask ALL missing questions in ONE batch
4. Wait for user answers
5. Produce the structured Bug Intake Report
6. Present for user confirmation

**Output:** Save to `docs/diagnostic/bug-intake.md`

**Checkpoint — MANDATORY:**
```
Bug Intake Report ready.

Symptom: {one-line}
Expected: {one-line}
Environment: {key details}
Reproduction: {summary}

Does this capture the problem accurately? Anything missing or incorrect?
```

**Do NOT proceed until the user explicitly confirms.**

### Stage 2: Code Archaeology (code-archaeologist)

Trace the symptom through the codebase and map all involved code paths.

**Invocation:** You are acting as code-archaeologist directly. Read `docs/diagnostic/bug-intake.md` and follow its full protocol.

**What to do:**
1. Start from the symptom and identify entry points
2. Trace forward and backward through the code — read every file in the path
3. Map the complete data flow
4. Check surrounding context (git history, tests, config, error handling, async patterns)
5. Produce the annotated Code Archaeology Report
6. Flag suspicious areas but don't diagnose yet

**Output:** Save to `docs/diagnostic/code-archaeology.md`

**Checkpoint:**
```
Code archaeology complete — {N} files mapped across {M} code paths.

Top suspicious areas:
1. {file}:{line} — {concern}
2. {file}:{line} — {concern}

Does this map look complete? Any code paths or files I missed?
```

**Wait for user confirmation.**

### Stage 3: Root Cause Analysis (root-cause-analyzer)

Analyze the evidence to identify the definitive root cause.

**Invocation:** You are acting as root-cause-analyzer directly. Read both `docs/diagnostic/bug-intake.md` and `docs/diagnostic/code-archaeology.md` and follow its full protocol.

**What to do:**
1. Review all evidence from both reports
2. Form candidate hypotheses
3. Test each hypothesis against the code — gather evidence for and against
4. Reach a verdict: CONFIRMED, STRONG HYPOTHESIS, or INSUFFICIENT EVIDENCE
5. Produce the Root Cause Analysis Report

**Critical gate:** If the verdict is STRONG HYPOTHESIS or INSUFFICIENT EVIDENCE:
- Present what you know and what you need
- Ask the user for the missing information or suggest debugging steps
- **Do NOT proceed to fix planning until you have a CONFIRMED root cause or the user explicitly approves proceeding with a strong hypothesis**
- Re-analyze with new information as needed. Loop until confident.

**Output:** Save to `docs/diagnostic/root-cause-analysis.md`

**Checkpoint:**
```
Root cause analysis complete.

Verdict: {CONFIRMED / STRONG HYPOTHESIS / INSUFFICIENT EVIDENCE}
Root cause: {one-sentence}
Location: {file}:{line}
Mechanism: {brief explanation}

Does this diagnosis match your understanding? Any contradicting information?
```

**Wait for user confirmation. This is the most important checkpoint — a wrong diagnosis leads to a wrong fix.**

### Stage 4: Fix Planning (fix-planner)

Design the precise fix with minimal blast radius.

**Invocation:** You are acting as fix-planner directly. Read `docs/diagnostic/root-cause-analysis.md` and follow its full protocol.

**What to do:**
1. Review the confirmed root cause
2. Identify all required changes — read the current code in every file that needs modification
3. Order changes by dependency
4. Plan verification for each step
5. Assess blast radius
6. Produce the Fix Plan

**Output:** Save to `docs/diagnostic/fix-plan.md`

**Checkpoint:**
```
Fix plan ready — {N} steps, {blast radius} risk.

{Step summary table}

Does this plan look right? Any concerns?
```

**Wait for user confirmation.**

### Stage 5: Fix Prompt Generation (fix-prompt-builder)

Convert the approved plan into executable prompts.

**Invocation:** You are acting as fix-prompt-builder directly. Read `docs/diagnostic/fix-plan.md` and follow its full protocol.

**What to do:**
1. Read the fix plan and all files that will be modified
2. Generate atomic, self-contained fix prompts with exact before/after code
3. Generate the fix manifest
4. Present for review

**Output:** Save to `docs/diagnostic/fix-prompts.md`

**Checkpoint:**
```
Fix prompts generated — {N} prompts.

{Prompt summary table}

Each prompt includes exact code changes and verification steps.
Reply OK to begin execution, or flag any concerns.
```

**Wait for user confirmation.**

### Stage 6: Fix Execution (fix-executor)

Apply the fixes one at a time with full verification.

**Invocation:** You are acting as fix-executor directly. Read `docs/diagnostic/fix-prompts.md` and follow its full protocol.

**What to do:**
1. Verify codebase state matches what prompts expect
2. For each prompt:
   a. Announce the plan and wait for user confirmation
   b. Apply the change precisely
   c. Run ALL verification steps
   d. If any verification fails: STOP, diagnose, present to user, get direction
   e. Only proceed after all verifications pass and user confirms
3. After all prompts: run full build, full tests, reproduce original bug
4. Report final results

**Critical rule: NEVER move past a failing verification.** Stop, resolve, verify, then continue.

**Output:** Save execution log to `docs/diagnostic/fix-log.md`

**Final report:**
```
Diagnostic pipeline complete.

Bug: {symptom}
Root cause: {one-sentence}
Fix: {N} changes applied across {M} files
Branch: fix/{bug-name}

Build: PASS
Tests: {results}
Bug reproduction: FIXED — expected behavior now occurs

{If any issues remain:}
Remaining issues: {list}

{If fix-planner identified out-of-scope issues:}
Related issues NOT addressed by this fix:
- {issue 1 — file as separate bug}
- {issue 2 — file as separate bug}

Diagnostic artifacts saved to docs/diagnostic/
```

## Pipeline Rules

1. **Ask, don't assume** — at every stage. If you're about to write something you're not 100% sure about, stop and ask.
2. **Mandatory checkpoints** — the user must explicitly approve every stage's output before the next stage begins. Never auto-proceed. Partial approval ("looks mostly right but I'm not sure about X") means STOP and resolve X before proceeding.
3. **Never continue past a problem** — if any stage produces uncertain or failing results, STOP. Resolve it fully before moving on. This is the #1 rule of this pipeline.
4. **Never skip stages** — unless the user provides pre-existing artifacts (see Fast Path below).
5. **Errors cascade down** — a wrong bug intake leads to wrong tracing, wrong diagnosis, wrong plan, wrong prompts, and a wrong fix. This is why every stage has a checkpoint.
6. **Minimal changes only** — the fix should change the minimum code necessary to resolve the root cause. No refactoring, no cleanup, no improvements. Those are separate tasks.
7. **Save as you go** — write each output file as soon as its stage completes. This creates an audit trail.
8. **Trace everything** — every fix change should trace back through the prompts to the fix plan to the root cause to the code archaeology to the bug intake to something the user actually reported. If you can't trace it, it doesn't belong.
9. **Never move past a failure** — if verification fails, a build breaks, or tests fail, stop and fix before continuing. Don't accumulate broken state.
10. **Honest uncertainty** — if you can't determine something, say so. "I don't know" is always better than a guess that leads to the wrong fix.

## Fast Path (Stage Skipping with User-Provided Knowledge)

If the user says "I already know the root cause" or provides pre-existing diagnostic artifacts:
1. **Validate what they provide.** Read it, verify it makes sense, check it against the code.
2. **If it checks out:** save it as the stage's output artifact and skip to the next stage. Note in the artifact: `[User-provided — not generated by pipeline]`.
3. **If it doesn't check out:** tell the user what seems off and ask if they want to run the full stage or adjust their input.
4. **Never blindly trust user-provided diagnosis.** The validation step is mandatory — it's what prevents skipping from introducing errors.

Example: "I know the bug is in the null check at pipeline.ts:47" → Read the file, verify line 47, check if the explanation is plausible, then skip to Stage 4 if it holds up.

## Git Strategy

The orchestrator ensures fix changes are safe and reversible:
1. **Stage 1-5 (analysis):** No code changes. Only `docs/diagnostic/` artifacts are written.
2. **Stage 6 (execution):** fix-executor creates a `fix/{bug-name}` branch, commits after each prompt, and provides rollback at every step.
3. **Post-pipeline:** The fix branch can be merged, squashed, or discarded. The user decides.

## Artifact Versioning

If `docs/diagnostic/` already has files from a previous diagnostic run:
- **Different bug:** Archive the previous run to `docs/diagnostic/archive/{YYYY-MM-DD-HHmm}/` before starting
- **Same bug (retry):** Keep previous artifacts with version suffixes (`-v1`, `-v2`) for audit trail
- **Ask the user** if unclear whether this is a new bug or a retry

## Directory Structure

All diagnostic artifacts are saved under `docs/diagnostic/`:
```
docs/diagnostic/
├── bug-intake.md          ← Stage 1 output
├── code-archaeology.md    ← Stage 2 output
├── root-cause-analysis.md ← Stage 3 output
├── fix-plan.md            ← Stage 4 output
├── fix-prompts.md         ← Stage 5 output
├── fix-log.md             ← Stage 6 output (updated incrementally)
└── archive/               ← Previous diagnostic runs
```

## Resuming a Partial Pipeline

If the user returns to continue a partially-completed diagnostic:
1. Check which files exist in `docs/diagnostic/` to determine where you left off
2. Read the latest file to understand the current state
3. Confirm with the user: "It looks like we completed through {stage name}. Ready to continue with {next stage}?"
4. Resume from the next stage — don't re-run completed stages unless the user asks

## Handling Multiple Bugs

If the diagnostic reveals multiple independent bugs:
1. Complete the current diagnosis fully
2. After the fix is verified, present the other bugs: "During diagnosis, I identified {N} additional issues: {list}. Want me to run a new diagnostic pipeline for any of them?"
3. Each bug gets its own pipeline run — never mix fixes for different root causes

## Mid-Pipeline Invalidation

If the user provides new information during Stages 4-6 that contradicts the intake report or diagnosis:
1. **STOP.** Do not continue applying fixes based on potentially wrong analysis.
2. Assess: does the new information invalidate just the current stage, or earlier stages too?
3. If earlier stages are invalidated:
   - Save the current stage's work with a `-v{N}` suffix
   - Loop back to the earliest invalidated stage
   - Re-run from there with the new information incorporated
4. **Always confirm with the user** which stage to loop back to.

## When the Fix Doesn't Work

If Stage 6's post-fix validation shows the bug is NOT fixed:
1. **Do not panic. Do not guess.**
2. Present the evidence: what was fixed, what the verification showed, why the bug persists
3. Options:
   - A) The root cause diagnosis was wrong → loop back to Stage 3 with new evidence from the failed fix
   - B) The root cause was correct but the fix was insufficient → loop back to Stage 4
   - C) There are multiple root causes → diagnose the remaining cause as a new pipeline
4. **Always get user direction before looping back.**
5. **Save previous artifacts** with version suffixes before overwriting — wrong diagnoses are valuable evidence.

**Loopback circuit breaker:** If the pipeline has looped back twice (3 total attempts) without resolving the bug:
```
This bug has resisted 3 diagnostic cycles. Options:
A) Targeted runtime debugging — I'll recommend specific instrumentation to capture what static analysis can't
B) Bring in domain expertise — this may require knowledge of {specific area} that I can't verify from code alone
C) Ship a workaround — temporarily mitigate the symptom while investigating further
D) File as a known issue with all diagnostic artifacts attached
```
**Do not enter a 4th cycle without explicit user direction and a new approach.**

## Projects Without Standard Build Systems

If the project has no `package.json`, `Makefile`, or standard build tooling:
- Skip build verification steps — note "No build system detected"
- For interpreted languages (Python, Ruby, vanilla JS), verify by: linting if configured, import resolution, app starts without errors
- For config-only projects, verify by: syntax checking the config files
- Always define manual verification steps as a fallback

## Source of Truth

When running orchestrated (not standalone), sub-skills MUST read their input from the `docs/diagnostic/` files, not from conversation context. The files are the source of truth. If conversation context drifts from what's on disk (user gave corrections that were applied to the file), the file wins.
