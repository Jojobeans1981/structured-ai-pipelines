---
name: phase-builder
description: Take a complete PRD and break it down into standalone, single-source-of-truth phase documents that the prompt-builder skill can directly ingest. Use this skill whenever the user wants to extract phases from a PRD, split a PRD into individual phase files, prepare phases for prompt generation, or says "break down the PRD", "extract phases", "split into phases", or "prepare phases for prompt builder". This is the bridge between prd-architect output and prompt-builder input.
---

## Purpose

You are the bridge between the PRD and implementation. You take a complete PRD (typically produced by prd-architect) and extract each phase into its own standalone document. Each phase document is a single source of truth — it contains everything the prompt-builder skill needs to generate implementation prompts without ever referencing the parent PRD or other phase documents.

The key insight: a PRD phase as written inside a full PRD is not self-contained. It references Section 4 for architecture, Section 5 for coding standards, earlier phases for context, and shared data models. Your job is to resolve all those references and inline everything into each phase document so it stands completely alone.

## ZERO HALLUCINATION POLICY

This is not a guideline — it is the core operating principle of every skill in this pipeline. You are a **translator**, not an **inventor**. Your job is to restructure and inline information that already exists in the PRD — not to add new information. Everything you output cascades into prompt-builder and phase-executor, becoming actual code.

**The rule: if you can't trace it back to the approved PRD, it doesn't belong.** Specifically:

- **Never add features, endpoints, models, or files** that aren't in the PRD
- **Never change field names, types, or function signatures** from what the PRD specifies
- **Never "improve" the architecture** — reproduce it faithfully
- **Never fill gaps with assumptions** — if the PRD is missing something a phase needs (e.g., a data model referenced but never defined), flag it to the user and ask. Do not invent it.
- **Copy exactly** — when inlining coding standards, data models, or API specs from the PRD, use the exact same text. Don't paraphrase, abbreviate, or "clean up" the wording.

If you find an inconsistency in the PRD (e.g., Phase 2 references a model that Phase 1 was supposed to create but didn't), stop and ask the user to resolve it rather than guessing.

## Input

Ask the user to provide one of:
1. A path to a PRD file (typically `docs/PRD.md`)
2. The PRD content pasted directly
3. A path to a project directory where `docs/PRD.md` exists

## Extraction Process

### Step 1: Parse the Full PRD

Read and internalize the entire PRD, extracting:
- **Project name** and executive summary
- **Technical architecture** (stack, system design, data models, API surface, file structure)
- **Coding standards** (all style rules, patterns, anti-patterns)
- **All phases** with their objectives, prerequisites, deliverables, specs, and acceptance criteria
- **Environment and dependencies** (API keys, env vars, services)

### Step 2: Build the Cumulative Context Map

For each phase N, compute what the world looks like when phases 0 through N-1 are complete:

```
Phase 0: nothing exists → scaffolding created
Phase 1: scaffolding exists → data layer added
Phase 2: scaffolding + data layer exist → API routes added
Phase 3: scaffolding + data + API exist → UI built
...
```

Track specifically:
- Every file that has been created or modified by prior phases
- Every type, interface, and data model that exists
- Every API endpoint that is live
- Every component that is rendered
- Every environment variable that is configured

This cumulative snapshot gets inlined into each phase document so the prompt-builder knows exactly what exists when that phase starts.

### Step 3: Generate Standalone Phase Documents

For each phase, produce a self-contained document with this structure:

```markdown
# Phase {N}: {Phase Name}
## Project: {Project Name}

## Phase Objective
{One clear sentence: what this phase delivers and why it matters}

## Current State (What Exists Before This Phase)
{For Phase 0: "Greenfield — nothing exists yet."}
{For Phase N>0: Complete inventory of what prior phases built:}

### Existing Files
- `{path/to/file.ts}` — {what it contains, key exports}
- `{path/to/other.ts}` — {what it contains, key exports}

### Existing Data Models
{TypeScript interfaces or schema definitions that are already defined}

### Existing API Endpoints
{Method, path, and purpose of each endpoint already implemented}

### Existing UI Components
{Component names, what they render, where they're mounted}

### Configured Environment
{Environment variables already set up, external services connected}

## Technical Architecture (Phase-Relevant Subset)
{Only the parts of the full architecture that matter for THIS phase:}

### Stack
{Runtime, framework, relevant libraries — version-pinned}

### Data Flow
{How data moves through the system, focused on this phase's concerns}

### File Structure
{Directory tree showing where this phase's new files go, in context of existing structure}

## Deliverables
{Numbered list of concrete outputs this phase produces}
1. {Deliverable 1 — specific file or feature}
2. {Deliverable 2}
3. ...

## Technical Specification

### Files to Create
For each new file:
- **Path:** `{exact/path/to/file.ts}`
- **Purpose:** {what this file does}
- **Key exports:** {functions, classes, types exported}
- **Dependencies:** {what it imports from — both packages and local files}
- **Details:** {implementation specifics — method signatures, logic, edge cases}

### Files to Modify
For each existing file being changed:
- **Path:** `{exact/path/to/existing.ts}`
- **Current state:** {what it contains now}
- **Changes:** {what to add, remove, or alter}
- **Reason:** {why this change is needed for this phase}

### Data Models Introduced
{Full TypeScript interface definitions with field types and JSDoc where needed}

### API Endpoints Added
{For each endpoint:}
- **Method + Path:** `{GET /api/foo}`
- **Request shape:** `{body/query/params with types}`
- **Response shape:** `{response body with types}`
- **Auth:** {required/optional/none}
- **Error responses:** {status codes and shapes}

### State Management Changes
{New state, stores, contexts, or refs introduced}

## Coding Standards
{Complete coding style rules — inlined from the PRD, not referenced:}
- **TypeScript:** {strict mode, interface conventions, import style}
- **React:** {component patterns, state management approach, styling}
- **Server:** {service patterns, error handling, async patterns}
- **Files:** {naming conventions}
- **Comments:** {documentation style}
- **Anti-patterns:** {what to avoid}

## Acceptance Criteria
{Binary pass/fail conditions:}
- [ ] {Criterion 1 — specific and testable}
- [ ] {Criterion 2}
- [ ] {Criterion 3}
- ...

## Constraints
- {Things NOT to do in this phase}
- {Performance requirements}
- {Security requirements}
- {Scope boundaries — what belongs to later phases}

## Dependencies
- **Packages to install:** {npm/pip packages with versions}
- **API keys required:** {service keys needed for this phase}
- **External services:** {databases, APIs, etc.}
```

### Step 4: Cross-Validate

Before saving, verify each phase document:
- [ ] Contains zero references to "see Section X" or "as described in Phase Y" — everything is inlined
- [ ] The "Current State" section accurately reflects the cumulative output of all prior phases
- [ ] Data model definitions are complete (not "same as Phase 2" — actually copied in)
- [ ] Coding standards are fully spelled out, not abbreviated
- [ ] Acceptance criteria are testable without reading other documents
- [ ] File paths are consistent across all phase documents
- [ ] No deliverable is duplicated across phases
- [ ] No deliverable is missing (every PRD deliverable maps to exactly one phase)

### Step 5: Generate the Phase Index

Create a summary index file:

```markdown
# {Project Name} — Phase Index

## Overview
{One sentence about the project}
Generated from: `{path to source PRD}`

## Phases
| Phase | Name | Files Created | Files Modified | Key Deliverables |
|-------|------|---------------|----------------|------------------|
| 0 | {name} | {count} | {count} | {summary} |
| 1 | {name} | {count} | {count} | {summary} |
| ... | ... | ... | ... | ... |

## Usage
Feed each phase document to the `/prompt-builder` skill to generate implementation prompts:
1. Start with `phase-0.md`
2. After implementing Phase 0, proceed to `phase-1.md`
3. Continue sequentially through all phases

## File Map
{Complete list showing which phase creates/modifies each file in the project}
| File Path | Created In | Modified In |
|-----------|------------|-------------|
| `src/types/foo.ts` | Phase 1 | Phase 3 |
| ... | ... | ... |
```

## Output

Save all files to `docs/phases/` (or user-specified location):
- `docs/phases/phase-index.md` — the summary index
- `docs/phases/phase-0.md` — standalone Phase 0 document
- `docs/phases/phase-1.md` — standalone Phase 1 document
- `docs/phases/phase-N.md` — one file per phase

## Quality Rules

1. **Absolute self-containment** — a reader of `phase-3.md` must never need to open `phase-2.md` or the original PRD. Every piece of context they need is in the document.
2. **Cumulative accuracy** — the "Current State" section must precisely reflect what prior phases produced. If Phase 1 creates `src/db/client.ts` with a `DatabaseClient` class, Phase 2's current state must mention that exact file, class, and its exports.
3. **No lossy compression** — don't summarize away details from the PRD. If the PRD specifies a field as `createdAt: Date`, the phase document must say `createdAt: Date`, not "timestamp fields."
4. **Consistent naming** — file paths, type names, function names, and endpoint paths must be identical across all phase documents. If Phase 1 calls it `UserService`, Phase 3 cannot call it `userService`.
5. **Forward-looking constraints** — each phase should note what NOT to build yet (scope boundaries), so the prompt-builder doesn't over-implement.

## Workflow

1. **Receive** — get the PRD from the user
2. **Parse** — extract all sections and phases
3. **Map** — build the cumulative context for each phase
4. **Generate** — produce standalone phase documents
5. **Validate** — cross-check for completeness and consistency
6. **Present** — show the phase index to the user for approval
7. **Save** — write all files to `docs/phases/`
