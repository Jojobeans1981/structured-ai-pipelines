# Metrics Tracker

## Purpose

Instruments both pipelines (build and diagnostic) to collect performance metrics, track success rates, and produce evidence that the system works. This is how you prove the workflow's value with data, not anecdotes.

## When to Use

- **Automatic**: Called by project-orchestrator and diagnostic-orchestrator at each stage transition
- **Standalone**: `/metrics` to generate a summary report from existing data
- **After any pipeline run**: Automatically records the run's metrics

## Non-Blocking Rule

Metrics collection must NEVER block the pipeline. If metrics fail to write (disk error, permission issue, malformed JSON), log a warning and continue. The pipeline's job is building/fixing software — metrics are observability, not a gate.

---

## Metrics Definitions

### Build Pipeline Metrics (per phase, per project)

| Metric | What It Measures | How It's Collected |
|--------|-----------------|-------------------|
| `stage_time_prd` | Wall-clock time: PRD start → user approval | Orchestrator timestamps |
| `stage_time_phases` | Wall-clock time: phase-builder start → user approval | Orchestrator timestamps |
| `stage_time_prompts` | Wall-clock time: prompt-builder start → user approval | Orchestrator timestamps |
| `stage_time_validation` | Wall-clock time: prompt-validator start → verdict | Orchestrator timestamps |
| `stage_time_execution` | Wall-clock time: phase-executor start → phase complete | Orchestrator timestamps |
| `approval_first_pass` | Did user approve stage output without revisions? (per stage) | Boolean per stage |
| `revision_count` | How many revision cycles before approval (per stage) | Count per stage |
| `prompts_total` | Total prompts generated for this phase | From prompt manifest |
| `prompts_passed_validation` | Prompts that passed prompt-validator | From validation report |
| `prompts_executed_clean` | Prompts that executed without issues | From execution log |
| `prompts_required_fix` | Prompts that needed mid-execution fixes | From execution log |
| `build_pass` | Did the build pass after all prompts? | Boolean |
| `tests_pass` | Did all tests pass after all prompts? | Boolean |
| `deviation_count` | User-approved deviations from prompts | From deviation log |
| `total_pipeline_time` | Idea → working code, total wall-clock | Sum of stage times |

### Diagnostic Pipeline Metrics (per bug, per project)

| Metric | What It Measures | How It's Collected |
|--------|-----------------|-------------------|
| `stage_time_intake` | Wall-clock time: intake start → user approval | Orchestrator timestamps |
| `stage_time_archaeology` | Wall-clock time: code-archaeologist start → approval | Orchestrator timestamps |
| `stage_time_rca` | Wall-clock time: root-cause-analyzer start → approval | Orchestrator timestamps |
| `stage_time_fix_plan` | Wall-clock time: fix-planner start → approval | Orchestrator timestamps |
| `stage_time_fix_prompts` | Wall-clock time: fix-prompt-builder start → approval | Orchestrator timestamps |
| `stage_time_fix_validation` | Wall-clock time: prompt-validator on fix prompts | Orchestrator timestamps |
| `stage_time_fix_execution` | Wall-clock time: fix-executor start → verified | Orchestrator timestamps |
| `rca_verdict` | CONFIRMED / STRONG HYPOTHESIS / INSUFFICIENT EVIDENCE | From RCA report |
| `rca_correct_first_time` | Was the root cause diagnosis correct? (did the fix work?) | Boolean — true if no loopback |
| `fix_success_first_attempt` | Bug fixed without looping back to earlier stage | Boolean |
| `loopback_count` | How many times pipeline looped to a previous stage | Count |
| `loopback_targets` | Which stages were looped back to | Array of stage names |
| `root_cause_category` | Category from lessons-learned | String |
| `time_to_diagnosis` | Intake → confirmed root cause | Sum of stages 1-3 |
| `time_to_fix` | Intake → verified fix | Sum of all stages |
| `files_changed` | Number of files modified by the fix | From fix log |

### Cross-Pipeline Metrics

| Metric | What It Measures | How It's Collected |
|--------|-----------------|-------------------|
| `bug_prevention_rate` | After a lesson is applied, does that category recur? | Compare pre/post lesson frequency |
| `repeat_pattern_count` | Same root cause category across diagnostic runs | From lessons-learned index |
| `category_distribution` | What types of bugs are most common | Aggregate of root_cause_category |

---

## Storage

All metrics stored in `docs/metrics/`:

```
docs/metrics/
├── build-metrics.json       ← Array of build pipeline run records
├── diagnostic-metrics.json  ← Array of diagnostic pipeline run records
├── summary.md               ← Human-readable report (regenerated on update)
```

### Build Run Record Schema

```json
{
  "id": "build_{timestamp}_{phase}",
  "project": "project-name",
  "phase": "phase-1",
  "date": "2026-03-17T14:30:00Z",
  "stage_times": {
    "prd": 180000,
    "phases": 60000,
    "prompts": 45000,
    "validation": 12000,
    "execution": 300000
  },
  "approvals": {
    "prd": { "first_pass": true, "revisions": 0 },
    "phases": { "first_pass": true, "revisions": 0 },
    "prompts": { "first_pass": false, "revisions": 1 },
    "validation": { "verdict": "WARNINGS", "blocked": 0, "warnings": 2 },
    "execution": { "first_pass": true, "revisions": 0 }
  },
  "prompts": {
    "total": 8,
    "passed_validation": 7,
    "executed_clean": 6,
    "required_fix": 2
  },
  "build_pass": true,
  "tests_pass": true,
  "deviation_count": 1,
  "total_pipeline_time_ms": 597000,
  "outcome": "success"
}
```

### Diagnostic Run Record Schema

```json
{
  "id": "diag_{timestamp}_{bug_name}",
  "project": "project-name",
  "bug": "ISS-015",
  "date": "2026-03-17T14:30:00Z",
  "stage_times": {
    "intake": 120000,
    "archaeology": 90000,
    "rca": 150000,
    "fix_plan": 60000,
    "fix_prompts": 45000,
    "fix_validation": 10000,
    "fix_execution": 180000
  },
  "rca_verdict": "CONFIRMED",
  "rca_correct_first_time": true,
  "fix_success_first_attempt": true,
  "loopback_count": 0,
  "loopback_targets": [],
  "root_cause_category": "async-timing",
  "time_to_diagnosis_ms": 360000,
  "time_to_fix_ms": 655000,
  "files_changed": 2,
  "outcome": "success"
}
```

### JSON Write Protocol

1. Read existing file (or initialize empty array `[]`)
2. Parse JSON
3. Push new record
4. Write entire file back
5. If parse fails (corrupted file), back up to `{filename}.bak`, start fresh array with current record
6. All timestamps are ISO 8601
7. All durations are in milliseconds

---

## Summary Report Format

`docs/metrics/summary.md` — regenerated from JSON data every time `/metrics` is invoked or a pipeline completes:

```markdown
# Pipeline Metrics Summary

**Generated:** {ISO date}
**Data range:** {earliest run date} → {latest run date}

## Overview

| Pipeline | Total Runs | Success Rate | Avg Time |
|----------|-----------|-------------|----------|
| Build | {N} | {%} | {formatted} |
| Diagnostic | {N} | {%} | {formatted} |

## Build Pipeline

### Stage Performance
| Stage | Avg Time | First-Pass Approval Rate | Avg Revisions |
|-------|----------|------------------------|---------------|
| PRD | {time} | {%} | {N} |
| Phases | {time} | {%} | {N} |
| Prompts | {time} | {%} | {N} |
| Validation | {time} | Pass: {%}, Warn: {%}, Block: {%} | — |
| Execution | {time} | {%} | {N} |

### Prompt Quality
- Validation first-pass rate: {%}
- Execution clean rate: {%}
- Average deviations per phase: {N}

### Trends (last 5 vs previous 5)
| Metric | Previous 5 | Last 5 | Trend |
|--------|-----------|--------|-------|
| Total time | {avg} | {avg} | {arrow up/down} |
| First-pass approval | {%} | {%} | {arrow} |
| Prompt validation pass | {%} | {%} | {arrow} |

## Diagnostic Pipeline

### Stage Performance
| Stage | Avg Time | First-Pass Approval Rate |
|-------|----------|------------------------|
| Intake | {time} | {%} |
| Archaeology | {time} | {%} |
| Root Cause | {time} | {%} |
| Fix Plan | {time} | {%} |
| Fix Prompts | {time} | {%} |
| Fix Validation | {time} | Pass: {%} |
| Fix Execution | {time} | {%} |

### Diagnostic Accuracy
- Root cause correct first time: {%}
- Fix success first attempt: {%}
- Average loopback count: {N}
- Average time to diagnosis: {formatted}
- Average time to fix: {formatted}

### Root Cause Distribution
| Category | Count | % of Total |
|----------|-------|-----------|
| {category} | {N} | {%} |
| ... | ... | ... |

### Trends (last 5 vs previous 5)
| Metric | Previous 5 | Last 5 | Trend |
|--------|-----------|--------|-------|
| Time to fix | {avg} | {avg} | {arrow} |
| First-attempt success | {%} | {%} | {arrow} |
| RCA accuracy | {%} | {%} | {arrow} |

## Cross-Pipeline

### Bug Prevention
| Category | Bugs Before Lesson | Bugs After Lesson | Prevention Rate |
|----------|-------------------|-------------------|-----------------|
| {category} | {N} | {N} | {%} |

### Top Failure Points
1. {stage} — {failure description} — {frequency}
2. ...

### Recommendations
{Data-driven suggestions based on the metrics}
- Example: "prompt-builder has a 40% first-pass validation failure rate — consider adding more context to phase docs"
- Example: "async-timing bugs account for 60% of diagnostics — add an async patterns coding standard"
```

---

## Integration Points

### project-orchestrator
At each stage transition, record:
```
metrics.recordStageStart('prd', projectName, phaseId)
// ... stage runs ...
metrics.recordStageEnd('prd', approved=true, revisions=0)
```

### diagnostic-orchestrator
Same pattern, with diagnostic stage names.

### prompt-validator
After validation, record:
```
metrics.recordValidation(target, verdict, blockedCount, warningCount)
```

### lessons-learned
After extraction, record:
```
metrics.recordRootCauseCategory(bugId, category, isRepeat)
```

### Standalone
`/metrics` reads both JSON files and regenerates `summary.md`.

---

## Key Rules

1. **Never block the pipeline** — metrics are observability, not a gate
2. **Append-only** — never overwrite previous data, only add new records
3. **Regenerate summary on every update** — summary always reflects all data
4. **ISO 8601 timestamps** — no ambiguity
5. **Millisecond durations** — consistent unit across all measurements
6. **Graceful degradation** — if JSON is corrupted, back up and start fresh
