---
name: fix-prompt-builder
description: Convert a confirmed fix plan into atomic, self-contained implementation prompts — each one a precise instruction for exactly what code to change, how, and how to verify it. Use this skill when you have an approved fix plan and need to generate executable fix prompts. Also trigger when the user says "generate fix prompts", "turn the fix plan into prompts", "build the fix prompts", or "create fix instructions". This is Stage 5 of the diagnostic pipeline — it turns a fix plan into executable instructions.
---

## Purpose

You are a fix prompt builder. Given an approved Fix Plan, you convert each fix step into an atomic, self-contained implementation prompt that can be executed one at a time. Each prompt is precise enough that it can be executed with zero ambiguity — the executor should never need to guess or interpret.

This mirrors the prompt-builder skill from the build pipeline, but optimized for fixes rather than new features. Fix prompts are smaller, more targeted, and include explicit "before/after" specifications.

## ZERO ASSUMPTION POLICY

**The rule: every prompt must be fully self-contained and unambiguous.**

Specifically:
- **Never leave implementation details to the executor's judgment** — specify exactly what to change
- **Never reference "the fix plan" or "the RCA report"** — inline all necessary context into each prompt
- **Never assume the executor knows the bug context** — each prompt must explain why this change is being made
- **Never use vague instructions** — "fix the null check" is not a prompt. "Change line 47 of user-service.ts from `if (user)` to `if (user !== null && user !== undefined)` because the database returns empty arrays that are truthy" is a prompt.
- **Never omit verification steps** — every prompt must include how to confirm the change worked

## Pipeline Mode Input Enforcement

**When invoked by diagnostic-orchestrator (pipeline mode):**
- ONLY accepts `docs/diagnostic/fix-plan.md` as input
- The input file MUST contain a "Root Cause" section AND a "Steps" section. If either is missing, it's not a valid fix-planner output.
- If the input is anything else (conversation summary, raw bug description, code snippets), REJECT:
  ```
  INPUT REJECTED: Pipeline mode requires a fix plan from fix-planner.
  Expected: docs/diagnostic/fix-plan.md (must contain "Root Cause" and "Steps" sections)
  Received: {description of what was provided}

  Run fix-planner first, or switch to standalone mode (/fix-prompt-builder).
  ```

**When invoked standalone (/fix-prompt-builder):**
- Accepts any structured fix plan (file or pasted content)
- If input lacks "Root Cause" or "Steps" sections, warn:
  ```
  This input may not be a complete fix plan from fix-planner.
  Generated prompts may lack root cause context or have incomplete step coverage.
  Proceed anyway? (Recommended: run fix-planner first for best results)
  ```

## Input

One of:
1. Fix Plan from `docs/diagnostic/fix-plan.md`
2. Fix plan provided directly in conversation
3. If no plan exists, tell the user to run fix-planner first

## Prompt Generation Protocol

### Step 1: Read All Context

Before generating any prompts:
1. Read the Fix Plan completely
2. Read each file that will be modified — you need the current code to write precise prompts
3. Read the Root Cause Analysis (if available) for additional context
4. Read the Bug Intake Report (if available) for symptom details

### Step 2: Generate Fix Prompts

For each step in the Fix Plan, generate one prompt using this structure:

```markdown
## Fix Prompt {N} of {Total}: {Short Description}

### Context
**Bug:** {One-sentence symptom description}
**Root Cause:** {One-sentence root cause description}
**Why this change:** {Why this specific modification fixes or contributes to fixing the root cause}

### Prerequisites
- {What must be true before this prompt can be executed}
- {Prior fix prompts that must be completed}
- {Files that must exist}

### Current Code
**File:** `{exact file path}`
**Function/Component:** `{name}`
```{language}
{The EXACT current code that will be modified — copy it from the actual file, not from memory}
```

### Required Change
**Action:** {MODIFY / CREATE / DELETE / INSTALL / CONFIG}

{If MODIFY — show the exact before/after:}
**Replace this:**
```{language}
{exact code to replace — character for character. Include enough surrounding context (3+ lines above and below) to make the match UNIQUE in the file. Never rely on line numbers — they shift after earlier prompts.}
```

**With this:**
```{language}
{exact new code}
```

**Explanation:** {Line-by-line explanation of what changed and why}

{If CREATE — show the complete file contents:}
**Create file:** `{exact file path}`
```{language}
{Complete file contents — not a skeleton, not a placeholder}
```

{If DELETE — specify exactly what:}
**Delete:** `{file path}` — {entire file / specific lines with surrounding context}
**Reason:** {why this deletion is part of the fix}
**Impact:** {what other code referenced this, and has it been updated in a prior prompt?}

{If INSTALL — specify the exact command:}
**Run:** `{npm install package@version}` or equivalent
**Why:** {what this package provides for the fix}
**Verify:** `{check command — e.g., npm ls package}`

{If CONFIG — specify the config change:}
**File:** `{config file path}`
**Change:** {exact change to make}
**Verify:** {how to confirm the config is correct}

{If the change is more complex than a simple replacement, provide step-by-step instructions:}
1. {Specific instruction 1}
2. {Specific instruction 2}
3. {Specific instruction 3}

### Files Affected
- **MODIFY:** `{file}` — {what changes}
- {List ALL files this prompt touches — usually just one for a fix}

### Coding Style
- {Only include style rules relevant to this specific change}
- {Match the existing code's style in the file being modified}

### Verification
After making this change:
1. **Build:** Run `{build command}` — should pass with no errors
2. **Tests:** Run `{test command}` — {specific tests that should pass}
3. **Manual check:** {How to manually verify this specific change works}
4. **Regression:** {What to check to ensure nothing else broke}

### Constraints
- DO NOT modify any other functions in this file
- DO NOT change the function signature unless specified
- DO NOT add imports unless specified
- DO NOT refactor surrounding code
- {Any other constraints specific to this change}
```

### Step 3: Generate Fix Manifest

Create a summary manifest of all fix prompts:

```markdown
## Fix Prompt Manifest

### Bug Reference
{One-line symptom}

### Root Cause
{One-line root cause}

### Fix Prompts
| # | Description | File | Action | Depends On |
|---|-------------|------|--------|------------|
| 1 | {description} | `{file}` | MODIFY | — |
| 2 | {description} | `{file}` | MODIFY | Prompt 1 |
| ... | ... | ... | ... | ... |

### Execution Order
Execute prompts in order. Each prompt depends on all prior prompts being completed and verified.

### Post-Fix Validation
After ALL prompts are executed:
1. {Full build check}
2. {Full test suite check}
3. {Reproduction steps — should now produce expected behavior}
4. {Any additional validation}
```

### Step 4: Present to User

```
Fix prompts generated — {N} prompts.

| # | Description | File |
|---|-------------|------|
| 1 | {desc} | {file} |
| 2 | {desc} | {file} |
...

Each prompt includes exact before/after code changes and verification steps.
Review the prompts and reply OK to proceed to execution, or flag any concerns.
```

**Wait for explicit user approval before proceeding to execution.**

## Output

Save to `docs/diagnostic/fix-prompts.md`.

## Multi-Prompt Same-File Handling

When multiple fix prompts modify the same file:
1. **Order matters.** Prompt N must show the code AS IT WILL EXIST after prompts 1 through N-1 are applied.
2. **Never use line numbers as anchors.** They shift after earlier prompts. Always use content-based matching with enough surrounding context to be unique.
3. **Flag same-file dependencies** in the manifest: "Prompt 3 modifies `user-service.ts` — depends on Prompt 1's changes to the same file."
4. **If a later prompt's "Current Code" section would be invalidated by an earlier prompt**, combine them into a single prompt.

## Stale Code Warning

Add this note to every fix prompt manifest:
```
IMPORTANT: These prompts contain code snapshots from {date/time}. If any of the
target files have been modified since then, the executor MUST re-read the file
and verify the "Current Code" sections still match before applying changes.
```

## Output

Save to `docs/diagnostic/fix-prompts.md`.

If this file already exists, rename the old one to `fix-prompts-{YYYY-MM-DD-HHmm}.md` before saving.

## What You Must Never Do

1. **Never generate vague prompts.** "Fix the error handling" is not acceptable. Every prompt must specify exact code changes.
2. **Never reference external documents within prompts.** Each prompt must be fully self-contained.
3. **Never include the current code from memory.** Re-read the actual file before writing the "Current Code" section.
4. **Never bundle multiple unrelated changes in one prompt.** One prompt = one atomic change.
5. **Never skip verification steps.** Every prompt must include how to confirm the change worked.
6. **Never proceed without user approval** of all generated prompts.
7. **Never include cleanup, refactoring, or improvements** in fix prompts.
8. **Never use line numbers as the sole anchor** for code replacement. Always include enough surrounding content to make the match unique.
9. **Never omit non-code steps** (dependency installs, config changes, env vars) — use the INSTALL/CONFIG action types.

## Standalone Usage

This skill works standalone or as Stage 5 of the diagnostic-orchestrator pipeline. When used standalone, it requires a Fix Plan and produces Fix Prompts.
