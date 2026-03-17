# Lessons Learned

## Purpose

Extract actionable learnings from completed diagnostic runs and feed them back into the build pipeline — closing the loop between "bugs we fixed" and "bugs we prevent." This is the bridge that turns two separate pipelines into a learning system.

## When to Use

- **Automatic**: Fires after diagnostic-orchestrator's fix-executor completes successfully
- **Standalone**: `/lessons-learned` to analyze any completed diagnostic run
- **Retrospective**: `/lessons-learned retrospective` to analyze all archived runs for patterns

## Precondition

This skill ONLY fires after a **verified, successful fix**. If fix-executor did not complete, or the bug was not confirmed fixed, this skill does not run. Extracting lessons from an incomplete or failed fix would produce wrong recommendations.

---

## Protocol

### Step 1: Read All Diagnostic Artifacts

Read these files in order:
1. `docs/diagnostic/bug-intake.md`
2. `docs/diagnostic/code-archaeology.md`
3. `docs/diagnostic/root-cause-analysis.md`
4. `docs/diagnostic/fix-plan.md`
5. `docs/diagnostic/fix-prompts.md`
6. `docs/diagnostic/fix-log.md`

If any file is missing, note it but continue with what's available. The root-cause-analysis and fix-log are the most critical.

### Step 2: Categorize the Root Cause

Assign exactly ONE primary category:

| Category | Description | Example |
|----------|-------------|---------|
| `logic-error` | Wrong conditional, off-by-one, incorrect algorithm | `if (x > 0)` should be `if (x >= 0)` |
| `race-condition` | Timing-dependent failure, async ordering | Two promises resolve in unexpected order |
| `state-management` | Stale state, missing reset, state leak between operations | `isBusy` flag never cleared after error |
| `missing-validation` | No input check, no null guard, no bounds check | API accepts negative IDs |
| `type-mismatch` | Wrong type, interface drift, schema mismatch | String where number expected |
| `async-timing` | Await missing, promise not chained, callback ordering | Fire-and-forget where await was needed |
| `resource-leak` | Connection not closed, listener not removed, timer not cleared | WebSocket left open after error |
| `config-error` | Wrong env var, bad path, incorrect setting | API key has trailing whitespace |
| `dependency-issue` | Package version conflict, missing dependency, API change | Library updated with breaking change |
| `missing-error-handling` | No try/catch, no fallback, error swallowed silently | Unhandled promise rejection crashes server |

If the root cause spans multiple categories, pick the primary and note secondaries.

### Step 3: Assess Detection Difficulty

For the root cause, evaluate what could have caught it earlier:

| Detection Method | Could It Catch This? | Confidence | Notes |
|-----------------|---------------------|------------|-------|
| Static analysis (TypeScript strict, ESLint) | Yes/No/Partial | High/Medium/Low | Which rule? |
| Unit test | Yes/No/Partial | High/Medium/Low | What test case? |
| Integration test | Yes/No/Partial | High/Medium/Low | What scenario? |
| Linter rule | Yes/No/Partial | High/Medium/Low | Which rule? |
| Code review checklist item | Yes/No/Partial | High/Medium/Low | What to look for? |
| Runtime monitoring | Yes/No/Partial | High/Medium/Low | What metric/alert? |

### Step 4: Check for Pattern Recurrence

Read `docs/lessons-learned-index.md` if it exists. Also check `docs/diagnostic/archive/` for previous runs.

For each previous lesson:
- Does it share the same root cause category?
- Does it affect the same subsystem (same files, same module)?
- Does it have the same mechanism (same type of failure)?

**Systemic threshold:** If the same root cause category has occurred **3 or more times**, flag it:
```
SYSTEMIC PATTERN DETECTED: {category} has occurred {N} times.

Previous occurrences:
1. {date} — {bug summary} — {fix summary}
2. {date} — {bug summary} — {fix summary}
3. This bug

Point fixes are not enough. Recommend systemic prevention:
- {architectural change}
- {automated guard}
- {coding standard enforcement}
```

### Step 5: Generate Prevention Recommendations

Produce exactly the recommendations that would have prevented this bug. Each must be **specific enough to copy-paste** into a PRD or prompt.

#### 5a. Coding Standard Rule
A rule for the PRD's "Coding Standards" section that prevents this class of bug:
```
RULE: {concise rule statement}
RATIONALE: {one sentence linking to this bug}
EXAMPLE (do): {correct code pattern}
EXAMPLE (don't): {the pattern that caused this bug}
```

#### 5b. Test Case Pattern
A test case template that would catch this type of failure:
```
TEST: {test name}
SCENARIO: {what to test}
SETUP: {preconditions}
ACTION: {what to do}
ASSERT: {what to verify}
```

#### 5c. Validation Check (for prompt-validator)
A new check that prompt-validator should enforce:
```
CHECK: {what to validate}
APPLIES TO: {which prompts/files}
FAIL CONDITION: {when to flag}
SEVERITY: BLOCKED | WARNING
```

#### 5d. Linter/CI Rule (if applicable)
```
TOOL: {ESLint | TypeScript strict | custom}
RULE: {rule name or config}
CONFIG: {exact configuration to add}
```

#### 5e. Build Pipeline Patch
Exact text to append to future PRD coding standards:
```markdown
### {Rule Name} (from diagnostic {date})
{Rule text — ready to paste into PRD}
```

### Step 6: Produce Output

Save to `docs/diagnostic/lessons-learned.md`:

```markdown
# Lessons Learned — {Bug ID/Name}

**Date:** {ISO date}
**Bug:** {one-line symptom}
**Root Cause:** {one-line root cause}
**Category:** {primary category}
**Secondary Categories:** {if any}
**Fix Applied:** {one-line fix summary}
**Detection Difficulty:** {which methods could have caught it}

## Why It Wasn't Caught

{1-3 sentences explaining the gap in the build pipeline that allowed this bug through}

## Prevention Recommendations

### Coding Standard Rule
{from Step 5a}

### Test Case Pattern
{from Step 5b}

### Prompt Validator Check
{from Step 5c}

### Linter/CI Rule
{from Step 5d, or "N/A — no automated rule applies"}

### Build Pipeline Patch
{from Step 5e}

## Pattern Analysis

**Recurrence:** {First occurrence | Repeat #{N}}
**Systemic:** {Yes — threshold reached | No}
{If systemic: systemic prevention recommendations}

## Traceability

- Bug intake: `docs/diagnostic/bug-intake.md`
- Code map: `docs/diagnostic/code-archaeology.md`
- Root cause: `docs/diagnostic/root-cause-analysis.md`
- Fix plan: `docs/diagnostic/fix-plan.md`
- Fix log: `docs/diagnostic/fix-log.md`
```

### Step 7: Update Cumulative Index

Append to `docs/lessons-learned-index.md` (create if it doesn't exist):

```markdown
| Date | Bug | Category | Prevention Rule | Systemic? |
|------|-----|----------|-----------------|-----------|
| {date} | {one-line} | {category} | {rule summary} | {Yes/No} |
```

### Step 8: Offer PRD Update (User Approval Required)

```
Lessons extracted. Prevention recommendations ready.

Want me to append the coding standard rule to the active PRD?
- Target: docs/PRD.md → Coding Standards section
- Rule: {rule summary}

This ensures future builds automatically include this guard.
Reply YES to update, or NO to skip (recommendations are saved either way).
```

**NEVER modify the PRD without explicit user approval.**

---

## Retrospective Mode

When invoked with `/lessons-learned retrospective`:

1. Read ALL entries in `docs/lessons-learned-index.md`
2. Read ALL archived diagnostic runs in `docs/diagnostic/archive/`
3. Produce a pattern analysis:
   - Most common root cause categories (ranked)
   - Most affected subsystems/files
   - Detection gap analysis (what's the most common "why it wasn't caught" reason)
   - Systemic recommendations (patterns that need architectural fixes, not point fixes)
4. Save to `docs/lessons-learned-retrospective.md`

---

## Integration Points

| Upstream | This Skill | Downstream |
|----------|-----------|------------|
| fix-executor (verified fix) | lessons-learned | prd-architect (coding standards) |
| diagnostic-orchestrator | lessons-learned | prompt-validator (new checks) |
| Archive (previous runs) | lessons-learned | prompt-builder (test patterns) |

### diagnostic-orchestrator Integration
After fix-executor's final verification passes:
```
fix-executor (VERIFIED) → lessons-learned → report to user
```

### metrics-tracker Integration
Report to metrics-tracker:
- Root cause category (for category distribution tracking)
- Whether this was a repeat pattern
- Whether the PRD was updated
