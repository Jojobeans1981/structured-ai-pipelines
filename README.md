# Structured AI Development Pipelines

**Build software in record time with record accuracy.**

Two mirrored pipelines — one builds applications, one reverse-engineers and fixes them — sharing the same architecture. Both produce auditable artifacts at every stage. Both require human approval at every checkpoint. Both are composable.

```
BUILD:     Idea --> PRD --> Phases --> Prompts --> Validation --> Working Code
DIAGNOSE:  Bug --> Intake --> Code Map --> Root Cause --> Fix Plan --> Fix Prompts --> Validation --> Verified Fix --> Lessons Learned
```

## What This Solves

AI coding tools today either give you a black box (Devin, Sweep) or a chat window (Cursor, Copilot). Neither gives you what enterprise software development actually needs: **structured, auditable, verifiable pipelines with human checkpoints at every decision point.**

This system:
- **Decomposes complex projects** into atomic, dependency-ordered implementation prompts with validation gates between stages
- **Produces an auditable artifact at every stage** — every line of code traces back through prompts to phase docs to the PRD to something a human actually said
- **Reverse-engineers bugs** through a structured 8-stage diagnostic pipeline with proven root causes and verified fixes
- **Connects build and diagnose into a learning system** — every bug fixed feeds prevention rules back into future builds

## Quick Start

### Prerequisites
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and configured

### Installation

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/structured-ai-pipelines.git

# Copy the skills into your Claude Code configuration
cp -r structured-ai-pipelines/.claude/skills/* ~/.claude/skills/
```

That's it. The skills are now available in every Claude Code session.

### Build a New Application

```
/project-orchestrator
```

Provide your idea. The orchestrator handles the rest — asking questions, producing artifacts, building code, one verified stage at a time.

### Diagnose and Fix a Bug

```
/diagnostic-orchestrator
```

Describe the symptom. The orchestrator traces it through the code, identifies root cause, plans the fix, generates instructions, executes them, verifies the fix works, and extracts lessons.

### Use Individual Stages

Every skill works standalone:

```
/prd-architect          — create a PRD from a project idea
/phase-builder          — extract standalone phases from a PRD
/prompt-builder         — generate implementation prompts from a phase doc
/prompt-validator       — validate prompts against codebase state
/phase-executor         — execute prompts into working code
/bug-intake             — document a bug with structured intake
/code-archaeologist     — trace a bug through the codebase
/root-cause-analyzer    — identify the definitive root cause
/fix-planner            — plan the minimal fix
/fix-prompt-builder     — generate atomic fix instructions
/fix-executor           — apply fixes with verification
/lessons-learned        — extract prevention recommendations
/metrics                — generate pipeline performance report
/code-mentor            — real-time teaching during any stage
```

## Architecture

### Build Pipeline (6 stages)

| Stage | Skill | Input | Output | Artifact |
|-------|-------|-------|--------|----------|
| 1 | `prd-architect` | Raw idea + requirements | Complete PRD | `docs/PRD.md` |
| 2 | `phase-builder` | PRD | Standalone phase docs (SSOT) | `docs/phases/phase-{N}.md` |
| 3 | `prompt-builder` | Phase doc | Atomic implementation prompts | `docs/prompts/phase-{N}-prompts.md` |
| 3.5 | `prompt-validator` | Prompts + codebase state | Validation report | `docs/validation/phase-{N}-validation.md` |
| 4 | `phase-executor` | Validated prompts | Working, tested code | Git commits + `docs/state/phase-{N}-actual.md` |

### Diagnostic Pipeline (8 stages)

| Stage | Skill | Input | Output | Artifact |
|-------|-------|-------|--------|----------|
| 1 | `bug-intake` | Symptoms, errors, logs | Structured bug report | `docs/diagnostic/bug-intake.md` |
| 2 | `code-archaeologist` | Bug report | Annotated code map | `docs/diagnostic/code-archaeology.md` |
| 3 | `root-cause-analyzer` | Code map + evidence | Proven diagnosis | `docs/diagnostic/root-cause-analysis.md` |
| 4 | `fix-planner` | Root cause | Ordered fix steps | `docs/diagnostic/fix-plan.md` |
| 5 | `fix-prompt-builder` | Fix plan | Atomic fix instructions | `docs/diagnostic/fix-prompts.md` |
| 5.5 | `prompt-validator` | Fix prompts + codebase | Validation report | `docs/validation/diagnostic-validation.md` |
| 6 | `fix-executor` | Validated fix prompts | Verified fix | Git commits + `docs/diagnostic/fix-log.md` |
| 7 | `lessons-learned` | All diagnostic artifacts | Prevention recommendations | `docs/diagnostic/lessons-learned.md` |

### Cross-Pipeline Intelligence

```
BUILD --> deploys code --> bug found --> DIAGNOSE --> fix verified --> LESSONS LEARNED --> BUILD (coding standards updated) --> fewer bugs
```

The lessons-learned skill closes the loop: every bug diagnosed feeds prevention rules back into the build pipeline's coding standards. The metrics-tracker proves it's working with data.

## What Makes This Different

### vs. Devin / Sweep (Autonomous Agents)
They're black boxes. You assign a task, wait, and review a PR. No intermediate artifacts, no checkpoints, no visibility into decisions.

**We produce an auditable artifact at every stage.** Every line of code traces back through prompts to phase docs to the PRD. If something is wrong, you know exactly which stage introduced the error.

### vs. Cursor / Windsurf / Cline (IDE Agents)
They're reactive — good at individual tasks, but no structured process. Quality depends entirely on prompt quality.

**We decompose complex projects into atomic, dependency-ordered prompts** with validation gates between stages. A 50-file application gets built in verified steps where each step's output is the next step's verified input.

### vs. Kiro (Amazon) — Spec-Driven IDE
Kiro is closest with 3-phase spec-driven development. But:
- **No reverse pipeline.** Kiro can't diagnose a bug.
- **No prompt validation.** Tasks aren't validated against codebase state before execution.
- **No lessons-learned feedback loop.** Bugs don't feed back into future build standards.
- **Limited composability.** You can't run "just the design stage" on an existing project.

**We have 6 forward stages + 8 reverse stages, all composable, with validation and feedback loops.**

### vs. Everyone
**Nobody has a structured diagnostic pipeline.** Every tool either debugs as part of its forward loop (black box) or offers rollback/checkpoint (undo, not diagnose).

**Nobody connects build and diagnose into a learning system.** We do.

## Core Principles

### 1. Zero Assumptions
Every skill asks questions instead of guessing. A 30-second clarification prevents hours of debugging hallucinated code.

### 2. Mandatory Human Checkpoints
Every stage requires explicit user approval before the next stage begins. The human is always in the loop at every decision point.

### 3. Auditable Artifacts
Every stage produces a file. Every file is the single source of truth for the next stage. Every decision is traceable.

### 4. Composable Stages
Every skill works standalone or orchestrated. Use the full pipeline for new projects. Use individual stages for targeted work.

### 5. Never Continue Past a Problem
If any stage produces uncertain results, the pipeline stops and asks for help. Problems are resolved where they occur, not accumulated across stages.

## Skill Inventory (16 skills)

### Build Pipeline
| Skill | Purpose |
|-------|---------|
| `prd-architect` | Requirements to complete PRD |
| `phase-builder` | PRD to standalone phase documents |
| `prompt-builder` | Phase doc to atomic implementation prompts |
| `prompt-validator` | Validates prompts against codebase state |
| `phase-executor` | Executes prompts into working, tested code |
| `project-orchestrator` | Chains all stages end-to-end |

### Diagnostic Pipeline
| Skill | Purpose |
|-------|---------|
| `bug-intake` | Symptoms to structured bug report |
| `code-archaeologist` | Bug report to annotated code map |
| `root-cause-analyzer` | Code map to proven root cause |
| `fix-planner` | Root cause to ordered fix steps |
| `fix-prompt-builder` | Fix plan to atomic fix instructions |
| `fix-executor` | Fix prompts to verified fix |
| `lessons-learned` | Diagnostic results to prevention recommendations |
| `diagnostic-orchestrator` | Chains all stages end-to-end |

### Cross-Pipeline
| Skill | Purpose |
|-------|---------|
| `metrics-tracker` | Performance data across both pipelines |
| `code-mentor` | Real-time teaching during any stage |

## Artifact Trail

Every piece of code is fully traceable:

**Build:** User Input -> `docs/PRD.md` -> `docs/phases/phase-N.md` -> `docs/prompts/phase-N-prompts.md` -> `docs/validation/phase-N-validation.md` -> `docs/state/phase-N-actual.md` -> Git commit

**Diagnostic:** User Report -> `docs/diagnostic/bug-intake.md` -> `docs/diagnostic/code-archaeology.md` -> `docs/diagnostic/root-cause-analysis.md` -> `docs/diagnostic/fix-plan.md` -> `docs/diagnostic/fix-prompts.md` -> `docs/validation/diagnostic-validation.md` -> `docs/diagnostic/fix-log.md` -> `docs/diagnostic/lessons-learned.md` -> Git commit

## License

MIT License - see [LICENSE](LICENSE) for details.
