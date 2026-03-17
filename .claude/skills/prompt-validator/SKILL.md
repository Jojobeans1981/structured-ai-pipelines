# Prompt Validator

## Purpose

Pre-flight validation that checks implementation prompts against the actual codebase state BEFORE execution begins. Catches mismatches that would cause phase-executor or fix-executor to fail mid-build.

This is the quality gate between prompt generation and execution — in both pipelines.

## When to Use

- **Build pipeline**: Between prompt-builder and phase-executor
- **Diagnostic pipeline**: Between fix-prompt-builder and fix-executor
- **Standalone**: `/prompt-validator` to validate any prompts file against current codebase

## ZERO ASSUMPTION POLICY

If it can't verify a reference by reading actual files, it flags it as `UNVERIFIABLE`. Never assume a file exists because the name looks reasonable. Never assume a type is correct because it was in the prompts. Read every file. Check every reference.

---

## Pipeline Mode Input Enforcement

**When invoked by project-orchestrator or diagnostic-orchestrator (pipeline mode):**
- Build pipeline: ONLY accepts `docs/prompts/phase-{N}-prompts.md`
- Diagnostic pipeline: ONLY accepts `docs/diagnostic/fix-prompts.md`
- Mode is `blocking` — execution CANNOT proceed until all BLOCKED issues are resolved
- If any other input is provided, REJECT:
  ```
  INPUT REJECTED: Pipeline mode requires prompts from prompt-builder or fix-prompt-builder.
  Expected: docs/prompts/phase-{N}-prompts.md or docs/diagnostic/fix-prompts.md
  Received: {description of what was provided}
  ```

**When invoked standalone (/prompt-validator):**
- Accepts any prompts file path
- Mode is `report-only` — produces the report, user decides what to do

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `target` | YES | `phase-N` (validates `docs/prompts/phase-{N}-prompts.md`) or `diagnostic` (validates `docs/diagnostic/fix-prompts.md`) or a specific file path |
| `mode` | NO | `pipeline` (blocks on BLOCKED issues) or `standalone` (report only). Default: `standalone` |

---

## Validation Protocol

### Step 1: Load Prompts and State

1. Read the target prompts file
2. Parse each prompt — extract:
   - Files it reads (imports, references)
   - Files it creates or modifies
   - Functions, classes, types, interfaces it references
   - Functions, classes, types, interfaces it creates
   - Import paths
   - Environment variables referenced
   - API endpoints referenced
3. Load the current state:
   - **Build pipeline**: Read `docs/state/phase-{N-1}-actual.md` if it exists. If phase 1, read the codebase directly.
   - **Diagnostic pipeline**: Read the current codebase directly (no prior state file).

### Step 2: Build Dependency Graph

For the prompt sequence, build a dependency graph:
- Prompt 1 creates `src/types/user.ts` with `User` interface
- Prompt 3 imports `User` from `src/types/user.ts`
- This is VALID — prompt 3 depends on prompt 1, and prompt 1 comes first

Track what exists at each point in the sequence:
```
Before Prompt 1: {codebase state}
After Prompt 1:  {codebase state} + {files/types created by prompt 1}
After Prompt 2:  {above} + {files/types created by prompt 2}
...
```

### Step 3: Validate Each Prompt

For each prompt in order, check:

#### 3a. File References
- Every file path referenced (read/import) must either:
  - Exist on disk RIGHT NOW, OR
  - Be created by a PRIOR prompt in the sequence
- If neither: **BLOCKED** — `File not found: {path}. Not in codebase, not created by prior prompts.`

#### 3b. Type/Interface References
- Every type, interface, class, or function referenced must either:
  - Exist in the codebase (verify by reading the source file), OR
  - Be created by a prior prompt
- If neither: **BLOCKED** — `Type not found: {name}. Not in codebase, not created by prior prompts.`

#### 3c. Import Path Resolution
- Every import statement must resolve to a real file (considering TypeScript path aliases, index files, package.json exports)
- If unresolvable: **BLOCKED** — `Import cannot resolve: {import path}`

#### 3d. "Before" Code Verification
- If the prompt includes "before" code (code to be replaced), read the actual file and verify the "before" code exists character-for-character
- If it doesn't match: **BLOCKED** — `Before code mismatch in {file}:{line}. Prompt expects:\n{expected}\nActual:\n{actual}`

#### 3e. Environment Variables
- Every `process.env.VARIABLE` or `import.meta.env.VARIABLE` referenced must either:
  - Exist in `.env`, `.env.example`, or `.env.local`, OR
  - Be documented in the prompt as "to be added"
- If neither: **WARNING** — `Environment variable {name} not found in .env files`

#### 3f. API Endpoint References
- Every fetch/axios/API call to an internal endpoint must either:
  - Exist in the codebase (verify by searching route definitions), OR
  - Be created by a prior prompt
- If neither: **WARNING** — `API endpoint {method} {path} not found`

#### 3g. Package Dependencies
- Every import from `node_modules` (non-relative import) must be in `package.json`
- If not: **WARNING** — `Package {name} not in package.json. Prompt should include install step.`

### Step 4: Cross-Prompt Consistency

Check across all prompts in the sequence:
- No two prompts create the same file (unless one explicitly modifies what the other created)
- No prompt deletes a file that a later prompt reads
- Type definitions used across prompts are consistent (same field names, same types)
- Function signatures used across prompts match (same parameters, same return types)

If inconsistent: **BLOCKED** — `Cross-prompt inconsistency: Prompt {A} defines {name} as {X}, but Prompt {B} uses it as {Y}`

---

## Verdicts

| Verdict | Meaning | Pipeline Mode Action |
|---------|---------|---------------------|
| `ALL_VALID` | Every prompt passed all checks | Proceed to execution |
| `WARNINGS` | Minor issues found (missing env vars, uninstalled packages) | Present warnings, user decides whether to proceed |
| `BLOCKED` | Critical mismatches (missing files, wrong types, broken imports) | HALT — must fix before execution. List every issue. |

---

## Output

Save validation report to:
- Build pipeline: `docs/validation/phase-{N}-validation.md`
- Diagnostic pipeline: `docs/validation/diagnostic-validation.md`
- Standalone: `docs/validation/prompt-validation-{filename}.md`

### Report Format

```markdown
# Prompt Validation Report

**Target:** {prompts file path}
**Date:** {ISO date}
**Mode:** {pipeline | standalone}
**Verdict:** {ALL_VALID | WARNINGS | BLOCKED}

## Summary

- Prompts validated: {N}
- Passed: {N}
- Warnings: {N}
- Blocked: {N}

## Results

### Prompt 1: {prompt title}
**Status:** PASS | WARNING | BLOCKED

{If WARNING or BLOCKED:}
| Issue | Severity | Reference | Details |
|-------|----------|-----------|---------|
| File not found | BLOCKED | `src/services/auth.ts` | Not in codebase, not created by prior prompts |
| Missing env var | WARNING | `JWT_SECRET` | Not in .env files |

### Prompt 2: {prompt title}
...

## Blocked Issues (Must Fix)

{Numbered list of every BLOCKED issue with recommended fix}

1. **Prompt 3** references `src/types/user.ts` which doesn't exist.
   - **Fix:** Add a prompt before Prompt 3 that creates this file, OR update Prompt 3 to create it inline.

2. **Prompt 5** imports `UserService.getUser()` but Prompt 2 created `UserService.findUser()`.
   - **Fix:** Update Prompt 5 to use `findUser()`, OR update Prompt 2 to use `getUser()`.

## Warnings (Review Recommended)

{Numbered list of every WARNING with context}

## Dependency Graph

{Visual representation of prompt dependencies}
Prompt 1 → creates src/types/user.ts
Prompt 2 → creates src/services/user-service.ts (imports from Prompt 1)
Prompt 3 → modifies src/services/user-service.ts (depends on Prompt 2)
Prompt 4 → creates src/routes/users.ts (imports from Prompt 2)
```

---

## Checkpoint

After validation completes, present:

```
Prompt validation complete.

Verdict: {ALL_VALID | WARNINGS | BLOCKED}
Prompts: {passed}/{total} passed
Issues: {blocked_count} blocked, {warning_count} warnings

{If BLOCKED:}
{List blocked issues}

These must be resolved before execution can begin.

{If WARNINGS:}
{List warnings}

Proceed with warnings, or fix first?

{If ALL_VALID:}
All prompts validated. Ready for execution.
```

**In pipeline mode:** If BLOCKED, return control to the orchestrator with the blocked issues. The orchestrator must resolve them (by asking the user or re-running prompt-builder) before proceeding.

**In standalone mode:** Present the report and let the user decide.

---

## Integration Points

| Pipeline | Upstream | Downstream |
|----------|----------|------------|
| Build | prompt-builder | phase-executor |
| Diagnostic | fix-prompt-builder | fix-executor |

### project-orchestrator Integration
Insert between prompt-builder and phase-executor:
```
prompt-builder → prompt-validator → phase-executor
```
If prompt-validator returns BLOCKED, loop back to prompt-builder with the issues.

### diagnostic-orchestrator Integration
Insert between fix-prompt-builder and fix-executor:
```
fix-prompt-builder → prompt-validator → fix-executor
```
If prompt-validator returns BLOCKED, loop back to fix-prompt-builder with the issues.

### metrics-tracker Integration
Report to metrics-tracker:
- Pass rate (% of prompts that pass on first validation)
- Most common issue types
- Blocked vs warning ratio
