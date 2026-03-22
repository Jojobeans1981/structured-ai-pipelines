# Gauntlet Forge — Product Requirements Document

## 1. Executive Summary

Gauntlet Forge is a self-correcting AI code generation platform. Users describe what they want in plain language, and the forge produces a complete, runnable project — source code, tests, Dockerfile, CI pipeline, and SBOM — through a structured, observable, multi-agent pipeline.

The core value: **type a sentence, get a downloadable project that compiles and runs.**

## 2. How It Works

```
User types "build me a todo app with React and Tailwind"
    ↓
IntakeAgent generates a DAG execution plan
    ↓
PRD → Phases → Prompts (Sentinel-scored) → Code Generation
    ↓
Completeness Pass (fills missing package.json, configs, entry points)
    ↓
Dependency Resolver (scans imports, ensures all deps declared)
    ↓
Build Verification (Docker sandbox / static analysis)
    ↓
Auto-Fix Loop (if build fails, retries with error feedback, up to 3 cycles)
    ↓
Test Scaffolding + Dockerfile + CI/CD + SBOM + Secret Scan
    ↓
Download ZIP (or live Docker preview)
```

## 3. Architecture

### Execution Engine
- **DAG Executor**: Topological sort, parallel execution, dependency tracking
- **IntakeAgent**: LLM-powered plan generation from natural language
- **GraphExpander**: Dynamic DAG expansion after phase discovery
- **TriageAgent**: Failure recovery (retry with context, reroute to earlier node, escalate to human)

### Quality Gates
- **SentinelAgent**: Pre-execution confidence scoring (rejects prompts below 80%)
- **InspectorAgent**: Post-execution completeness verification
- **OutputValidator**: Tech stack enforcement (filters wrong-language files)
- **SecretScanner**: Detects leaked API keys, tokens, credentials
- **SBOMScanner**: Dependency vulnerability scanning (CycloneDX 1.5)

### Self-Correction
- **Auto-Fix Loop**: Build failures auto-retry executor stages with error feedback
- **LearningStore**: Records failure patterns, injects warnings into future runs
- **CompletenessPass**: Scaffolds missing config files (package.json, tsconfig, entry points)
- **DependencyResolver**: Scans imports, ensures all npm packages declared

### Delivery
- **ZipGenerator**: Download complete project as ZIP
- **DockerfileGenerator**: Multi-stage Dockerfile, docker-compose.yml, .dockerignore
- **CIGenerator**: GitHub Actions workflow (build, test, lint, Docker push)
- **TestGenerator**: Vitest/pytest/go test scaffolding
- **DockerSandbox**: Live preview with auto-cleanup

### Observability
- **TraceLogger**: Span-based distributed tracing per pipeline run
- **CostTracker**: Per-stage token usage and USD cost estimation
- **CostGuard**: Per-run and daily budget enforcement
- **MetricsService**: Build pass rate, worked-out-of-box rate, auto-fix rate, cost per run
- **Feedback Loop**: Post-download thumbs up/down with comment → feeds LearningStore

## 4. Tech Stack

| Technology | Purpose |
|-----------|---------|
| Next.js 14 (App Router) | Full-stack framework |
| TypeScript 5 | Type safety |
| Tailwind CSS 3 | Styling |
| shadcn/ui | Component library |
| Prisma 5 | ORM |
| PostgreSQL (Neon) | Serverless database |
| NextAuth.js 4 | Authentication (GitLab OAuth) |
| Anthropic SDK | Claude API |
| Groq SDK | Llama fallback |
| Zustand | Client state |
| Zod | Validation |
| JSZip | ZIP generation |
| Vitest | Testing |

## 5. Data Model

### Core Tables
- **User**: Auth, encrypted API key
- **Project**: Name, description, files
- **PipelineRun**: DAG execution state, auto-approve flag
- **PipelineStage**: Individual DAG node with status, artifact, tokens, cost
- **ProjectFile**: Generated source code files
- **Skill**: Pipeline skill prompts (loaded from DB, not filesystem)

### Quality Tables
- **ConfidenceScore**: Sentinel evaluation results
- **CompletenessCheck**: Inspector verification per phase
- **LearningEntry**: Failure patterns for self-improvement
- **AgentVote**: Multi-agent decision records
- **TraceEvent**: Span-based execution trace

### Analytics Tables
- **PipelineMetric**: Per-run aggregated metrics
- **ProjectFeedback**: Post-download user feedback
- **SpecCache**: Cached execution plans (30-day TTL)

## 6. API Surface

### Pipeline
- `POST /api/projects/[id]/pipeline/start` — Start a run (with autoApprove flag)
- `GET /api/pipeline/[runId]` — Get run status and stages
- `GET /api/pipeline/[runId]/nodes/[nodeId]/stream` — SSE stream for node execution
- `POST /api/pipeline/[runId]/stages/[stageId]/approve` — Approve a stage
- `POST /api/pipeline/[runId]/stages/[stageId]/reject` — Reject with feedback
- `POST /api/pipeline/[runId]/plan/approve` — Approve execution plan
- `GET /api/pipeline/[runId]/estimate` — Cost estimate and budget status

### Project
- `GET /api/projects/[id]/download` — Download project as ZIP
- `POST /api/projects/[id]/preview` — Launch Docker live preview
- `DELETE /api/projects/[id]/preview` — Stop preview container
- `POST /api/projects/[id]/feedback` — Submit post-download feedback

### Admin
- `POST /api/admin/seed-skills` — Seed skills from filesystem to database
- `GET /api/metrics` — Dashboard metrics summary
- `GET /api/metrics/history` — Run history
- `GET /api/metrics/prompt-health` — Sentinel pass rates
- `GET /api/learning` — Learning store patterns

## 7. Execution Modes

### Auto-Pilot (Default)
Pipeline runs start-to-finish without human intervention. The auto-fix loop handles build failures. Completeness pass fills missing files. Sentinel catches bad prompts.

### Manual Review
Toggle "Auto-pilot" off in the start dialog. Each stage pauses for approval. User can edit artifacts, reject with feedback, or approve to continue.

## 8. Environment Variables

### Required
- `DATABASE_URL` — PostgreSQL connection string (Neon)
- `NEXTAUTH_URL` — App URL
- `NEXTAUTH_SECRET` — Auth secret
- `GITLAB_CLIENT_ID` / `GITLAB_CLIENT_SECRET` — GitLab OAuth
- `GITLAB_BASE_URL` — GitLab instance URL
- `ENCRYPTION_KEY` — AES key for API key encryption
- `ANTHROPIC_API_KEY` — Default Anthropic key (users add their own)

### Optional
- `GROQ_API_KEY` / `GROQ_MODEL` — Groq/Llama fallback
- `OLLAMA_URL` / `OLLAMA_MODEL` — Local Ollama fallback
- `FORGE_MAX_AUTO_FIX` — Max auto-fix cycles (default: 3)
- `FORGE_RUN_BUDGET_USD` — Per-run cost limit (default: $5.00)
- `FORGE_DAILY_BUDGET_USD` — Per-user daily limit (default: $20.00)
- `FORGE_CACHE_TTL_DAYS` — Spec cache TTL (default: 30)
- `FORGE_BUILD_TIMEOUT` — Build verification timeout ms (default: 120000)
- `FORGE_OUTPUT_DIR` — Local disk output directory
