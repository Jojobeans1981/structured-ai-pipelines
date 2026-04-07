# Forge Live-Lite Benchmark Plan

- Scenarios: 3
- Required score dimensions: 4/5

## Scorecard

| Dimension | Required | Description |
|---|---|---|
| buildable | Yes | The run produces a dependency-clean project that can install and build successfully. |
| previewable | Yes | The run produces a project that passes preview preflight and avoids false-ready launch states. |
| artifact-completeness | Yes | The final artifact set includes required entrypoints, startup scripts, and framework scaffolding. |
| guardrail-behavior | Yes | Delivery guard and verification gates route broken output back through repair instead of promoting it. |
| scenario-intent | No | The output reflects the scenario’s expected signals, such as strategy alignment, dashboarding, or repo recovery. |

## Scenarios

### Greenfield Focus Board
- ID: greenfield-focus-board
- Type: greenfield
- Repo URL: benchmark://greenfield/focus-board
- Spec File: focus-board.md
- Expected signals: package.json, index.html, src/main, previewable, vite
- Prompt: Build a previewable kanban-style task manager called Focus Board. It should let a user create tasks, edit them, delete them, and move them between Todo, Doing, and Done columns. Include a clean responsive layout, simple task filtering, and local persistence so the data stays after refresh. The output must be a complete runnable web app with all required files, valid startup scripts, correct dependencies, and a usable live preview.

### Repo Recovery Vite Import Repair
- ID: repo-recovery-vite-import
- Type: repo-recovery
- Repo URL: benchmark://repo-recovery/vite-import
- Spec File: vite-import-repair.md
- Expected signals: package.json, src/main, import-repair, previewable, delivery-guard-pass
- Prompt: Recover a broken Vite/React repo so it becomes previewable again. The current app has a main entry file that imports ./App, but the actual app component file was generated under a different path. Repair the project so startup scripts, imports, and preview boot all work without manual fixes.

### Weekly Commit Module Strategy Build
- ID: weekly-commit-module-strategy
- Type: strategic-module
- Repo URL: benchmark://strategic/weekly-commit-module
- Spec File: weekly-commit-module.md
- Expected signals: package.json, index.html, src/main, manager-dashboard, previewable
- Prompt: Build a previewable weekly commit module that lets users create weekly commitments, link them to strategy, prioritize them, reconcile planned versus actual work, and give managers a team visibility view. The output must stay deployable or at least previewable, with complete config, startup scripts, and dependency integrity.
