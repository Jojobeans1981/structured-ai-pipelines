# Pipeline Studio — Presentation Prep Sheet
## Defense Presentation | 45 Minutes Prep

---

## 1. ONE-LINER (memorize this)

> "Pipeline Studio is an agentic AI platform that replaces unstructured prompting with auditable, checkpoint-driven decision trees — where AI agents execute and humans steer."

---

## 2. THE PROBLEM (30 seconds)

- Developers paste code into ChatGPT, get back a wall of text, copy-paste it, pray it works
- No structure, no audit trail, no ability to course-correct mid-generation
- When it goes wrong, you start over from scratch — zero memory of what failed
- **There is no workflow, just gambling**

---

## 3. THE SOLUTION (60 seconds)

Pipeline Studio runs **structured AI pipelines** where:

1. **Each stage is an autonomous AI agent** — it receives the full context chain from every prior stage
2. **Every stage pauses at a checkpoint** — human reviews the output
3. **Three actions at each checkpoint:**
   - **Approve** → agent moves to next stage with this artifact as context
   - **Reject + feedback** → agent re-runs THIS stage, incorporating your feedback as a constraint
   - **Edit** → human modifies the output directly, agent uses edited version going forward
4. **This creates a decision tree at runtime** — every choice branches the path, and the full history is tracked

**The pipeline doesn't just generate code. It builds a traceable decision graph.**

---

## 4. TWO PIPELINE TYPES

### Build Pipeline (5 stages)
```
Idea → PRD Generation → Architecture Design → Code Generation → Test Generation → Code Review
```
- Takes a project idea and builds it end-to-end
- Each stage feeds into the next
- Human approves at every gate

### Diagnostic Pipeline (8 stages)
```
Bug Report → Symptom Analysis → Code Archaeology → Reproduction → Root Cause Analysis → Fix Planning → Fix Execution → Verification
```
- Takes a bug description + code files
- Systematically traces from symptom to verified fix
- Root cause gets a confidence verdict: CONFIRMED / STRONG HYPOTHESIS / INSUFFICIENT

---

## 5. WHAT MAKES IT "AGENTIC DECISION TREEING"

**Traditional AI tools:** Linear. Prompt → Response. No memory. No structure.

**Pipeline Studio:**

```
                    [Stage 1: PRD]
                         |
                    ✓ APPROVE
                         |
                    [Stage 2: Architecture]
                        / \
              REJECT(feedback)  ✓ APPROVE
                    /               \
        [Stage 2: v2 w/ feedback]   [Stage 3: Code Gen]
                    |                      |
              ✓ APPROVE               EDIT(modified)
                    |                      |
              [Stage 3: Code Gen]    [Stage 4: Tests]
```

**Key properties:**
- **Branching** — rejections create new branches, not restarts
- **Context accumulation** — every agent sees the full history including rejections
- **Emergent structure** — the tree isn't predefined, it grows from human decisions
- **Auditable** — every node, branch, and decision is stored in the database
- **Feedback loops** — rejection reasons become constraints for the next attempt

---

## 6. TECH STACK (rapid fire)

| Layer | Tech | Why |
|-------|------|-----|
| Frontend | Next.js 14 (App Router) | Server components + API routes in one project |
| UI | Tailwind + shadcn/ui | Production-grade components, fast iteration |
| State | Zustand | Lightweight, no boilerplate vs Redux |
| Streaming | Server-Sent Events (SSE) | Real-time token streaming from AI to browser |
| Auth | NextAuth + GitLab OAuth | Enterprise-ready, pluggable providers |
| Database | PostgreSQL + Prisma | Type-safe ORM, relational data fits pipeline stages |
| AI | Anthropic Claude API | Best-in-class for structured reasoning tasks |
| Encryption | AES-256-GCM | User API keys encrypted at rest |

---

## 7. ARCHITECTURE OVERVIEW (whiteboard this)

```
Browser (React)
    ↕ SSE stream (real-time tokens)
    ↕ REST API (CRUD + actions)
Next.js API Routes
    ↓
┌─────────────────────────┐
│    Pipeline Engine       │  ← orchestrates stage transitions
│    Stage Executor        │  ← calls Claude API per stage
│    Skill Loader          │  ← loads stage-specific prompts
└─────────────────────────┘
    ↓
PostgreSQL (Prisma)
    - Users, Projects
    - PipelineRuns, PipelineStages (the decision tree)
    - ProjectFiles (generated code)
    - PipelineMetrics (timing data)
```

---

## 8. DATABASE SCHEMA (9 models)

- **User** — GitLab OAuth profile + encrypted API key
- **Project** — user's project with name, description, status
- **PipelineRun** — one execution of a pipeline (build or diagnostic)
- **PipelineStage** — single node in the decision tree (status, artifact, feedback)
- **ProjectFile** — generated code files (path, content, language)
- **PipelineMetric** — timing and token usage per stage
- Account, Session, VerificationToken — NextAuth internals

---

## 9. KEY FEATURES TO DEMO

1. **GitLab OAuth sign-in** → shows enterprise auth integration
2. **Create a project** → clean dashboard UI
3. **Start a build pipeline** → watch SSE streaming in real-time (the terminal output)
4. **Hit a checkpoint** → show the approval gate with full artifact
5. **REJECT with feedback** → THIS IS THE MONEY SHOT — show the agent re-running with your constraint
6. **Approve and advance** → show context accumulation
7. **Settings page** → encrypted API key management
8. **Metrics page** → pipeline performance tracking

---

## 10. ANTICIPATED QUESTIONS & ANSWERS

**Q: "Why not just use ChatGPT / Cursor / Copilot?"**
> Those are single-turn or inline tools. They don't maintain structured state across multiple reasoning stages. Pipeline Studio chains agents with full context, checkpoints, and audit trails. It's the difference between a calculator and a spreadsheet.

**Q: "What happens if the AI generates bad output?"**
> That's exactly what the checkpoint system solves. You reject it with specific feedback, and the agent re-runs with that feedback as a constraint. You never lose context. The decision tree preserves the full history of attempts.

**Q: "How is this different from LangChain / CrewAI / AutoGen?"**
> Those frameworks chain agents programmatically with no human oversight. Pipeline Studio puts the human IN the loop at every stage. The decision tree emerges from human judgment, not pre-coded logic.

**Q: "Can it handle real-world projects?"**
> The build pipeline generates full project scaffolding — files, tests, architecture docs. The diagnostic pipeline does systematic root cause analysis. Both produce real, downloadable code.

**Q: "What about cost / token usage?"**
> Every stage tracks token usage and timing in the metrics table. Users bring their own API key (encrypted at rest). The metrics dashboard shows cost per pipeline run.

**Q: "What's next?"**
> Three things: (1) Visual decision tree rendering — see your branch history as a graph, (2) Agent self-evaluation — pre-checkpoint validation before presenting to human, (3) Cross-run learning — patterns from past decisions inform future pipeline runs.

**Q: "Why Claude over GPT-4?"**
> Claude excels at structured, multi-step reasoning and follows complex system prompts more reliably. Critical for a pipeline where each stage needs to honor the full context chain.

---

## 11. CONFIDENCE BOOSTERS

**Lines of code:** ~5,000+ across 60+ files
**Models:** 9 Prisma models
**API routes:** 15 endpoints
**Components:** 25+ React components
**Pipeline stages:** 13 total (5 build + 8 diagnostic)
**Security:** AES-256-GCM encryption, ownership checks on every endpoint, Zod validation on all inputs

---

## 12. CLOSING STATEMENT (memorize this)

> "AI development today is unstructured and unauditable. Pipeline Studio introduces agentic decision treeing — where autonomous AI agents execute structured pipelines, humans make strategic decisions at every checkpoint, and the entire decision history is preserved. It's not about replacing developers. It's about giving them a systematic, traceable workflow for AI-assisted development."

---

## 13. DEMO CHECKLIST (before presenting)

- [ ] App running at localhost:3000
- [ ] Database migrated (`npx prisma db push`)
- [ ] GitLab OAuth works (can sign in)
- [ ] API key saved in Settings
- [ ] Can create a project
- [ ] Can start a pipeline and see streaming
- [ ] Browser dev tools CLOSED (don't show console errors)
- [ ] Font size increased in browser (Ctrl + twice)
- [ ] Dark mode ON (looks better for demos)
