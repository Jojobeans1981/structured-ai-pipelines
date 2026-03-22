# Gauntlet Forge

**Type a sentence. Get a runnable project.**

Gauntlet Forge is a self-correcting AI code generation platform. It turns natural language into complete, downloadable projects — source code, tests, Dockerfile, CI pipeline, and dependency security scan — through a structured, multi-agent pipeline that fixes its own build errors.

```
"Build me a todo app with React and Tailwind"
    → PRD → Phases → Code → Verify → Auto-Fix → Tests → Docker → CI → Download
```

**Live at:** https://structured-ai-pipelines.vercel.app

## What It Does

1. You describe what you want
2. The forge generates a DAG execution plan
3. Each stage runs through Claude — PRD, phase extraction, prompt generation, code execution
4. A completeness pass fills missing config files (package.json, tsconfig, entry points)
5. Build verification catches errors; the auto-fix loop retries with error context (up to 3 cycles)
6. Tests, Dockerfile, CI pipeline, and SBOM are scaffolded automatically
7. You download a ZIP that compiles and runs

## Quick Start

Visit https://structured-ai-pipelines.vercel.app, sign in with GitLab, add your Anthropic API key in Settings, create a project, and click **Start Pipeline**.

Auto-pilot is on by default — the pipeline runs end-to-end without stopping.

## Admin Commands

### Database

```bash
# Push schema changes to production (Neon)
DATABASE_URL="<neon-url>" npx prisma db push

# Pull production env vars
npx vercel env pull .env.local

# Regenerate Prisma client after schema changes
npx prisma generate
```

### Skills

Skills (pipeline prompts) are stored in the database, not the filesystem. To update them:

```bash
# Seed all skills from local .claude/skills/ to production database
DATABASE_URL="<neon-url>" node -e "
const { PrismaClient } = require('@prisma/client');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const prisma = new PrismaClient();
const skills = ['prd-architect','phase-builder','prompt-builder','prompt-validator','phase-executor','educator','project-orchestrator','bug-intake','code-archaeologist','root-cause-analyzer','fix-planner','fix-prompt-builder','fix-executor','lessons-learned','diagnostic-orchestrator','metrics-tracker','code-mentor'];
async function seed() {
  for (const name of skills) {
    const p = join(process.cwd(), '.claude', 'skills', name, 'SKILL.md');
    if (!existsSync(p)) continue;
    await prisma.skill.upsert({ where: { name }, create: { name, prompt: readFileSync(p, 'utf-8') }, update: { prompt: readFileSync(p, 'utf-8') } });
    console.log('Seeded:', name);
  }
  await prisma.\$disconnect();
}
seed();
"

# Or via the API (when running locally with .claude/skills/ present):
curl -X POST http://localhost:3000/api/admin/seed-skills
```

### Vercel Environment Variables

```bash
# List current env vars
npx vercel env ls

# Add a new env var
echo "value" | npx vercel env add VAR_NAME production

# Remove an env var
npx vercel env rm VAR_NAME production
```

### Testing

```bash
# Run all tests (29 smoke tests + metrics tests)
npx vitest run

# Run with verbose output
npx vitest run --reporter verbose

# Watch mode
npx vitest
```

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `FORGE_MAX_AUTO_FIX` | `3` | Max auto-fix cycles before escalating |
| `FORGE_RUN_BUDGET_USD` | `5.00` | Max spend per pipeline run |
| `FORGE_DAILY_BUDGET_USD` | `20.00` | Max spend per user per day |
| `FORGE_CACHE_TTL_DAYS` | `30` | Spec cache duration |
| `FORGE_BUILD_TIMEOUT` | `120000` | Build verification timeout (ms) |

## Architecture

### Pipeline Flow

```
User Input
    ↓
IntakeAgent → DAG Execution Plan
    ↓
┌─────────────────────────────────────────────┐
│  PRD Architect                              │
│  Phase Builder → Graph Expander             │
│  ┌──────────────────────────────────┐       │
│  │ Per Phase:                       │       │
│  │  Prompt Builder (Sentinel-scored)│       │
│  │  Phase Executor (code gen)       │       │
│  └──────────────────────────────────┘       │
│  Build Verification                         │
│  ├─ PASS → Scaffold tests/Docker/CI/SBOM    │
│  └─ FAIL → Auto-fix loop (retry with errors)│
└─────────────────────────────────────────────┘
    ↓
Download ZIP / Docker Preview
```

### Services (src/services/)

| Service | What It Does |
|---------|-------------|
| `intake-agent` | Generates DAG from natural language |
| `dag-executor` | Executes DAG with topological sort, parallel nodes |
| `graph-expander` | Dynamically adds nodes after phase discovery |
| `triage-agent` | Failure recovery: retry, reroute, or escalate |
| `stage-executor` | Runs individual skill through Claude |
| `skill-loader` | Loads skill prompts from DB (filesystem fallback) |
| `sentinel-agent` | Pre-execution confidence scoring |
| `inspector-agent` | Post-execution completeness check |
| `completeness-pass` | Scaffolds missing config files |
| `dependency-resolver` | Scans imports, fills package.json |
| `output-validator` | Filters wrong-language files |
| `file-manager` | Extracts code files from LLM output |
| `build-verifier` | npm install + build verification |
| `docker-sandbox` | Isolated Docker build + health check + live preview |
| `test-generator` | Vitest/pytest/go test scaffolding |
| `dockerfile-generator` | Multi-stage Dockerfile + compose |
| `ci-generator` | GitHub Actions workflow |
| `sbom-scanner` | CycloneDX SBOM + vulnerability scan |
| `secret-scanner` | API key / credential detection |
| `cost-tracker` | Per-stage token + USD tracking |
| `cost-guard` | Budget enforcement |
| `learning-store` | Failure pattern memory |
| `trace-logger` | Span-based execution tracing |
| `metrics-service` | Dashboard analytics |
| `zip-generator` | Project ZIP download |

### Key Metrics (Dashboard at /metrics)

| Metric | What It Tells You |
|--------|-------------------|
| Build Pass Rate | % of runs that compiled without auto-fix |
| Worked Out of Box | % of users who confirmed output worked |
| Auto-Fix Rate | How often the self-correction loop fires |
| Avg LLM Time | Execution time excluding human wait |
| Avg Cost / Run | Token cost per pipeline run |
| Sentinel Pass Rate | Prompt quality before execution |

## License

MIT
