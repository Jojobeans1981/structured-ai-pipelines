# Subsystem 4: State + Runtime + Control Plane
## Python Control Plane — Architecture Document
### Author: Guisseppe Panetta | Team: may-the-fource-be-with-us

---

## 1. Purpose

The control plane is the central nervous system of AI Factory. Every other subsystem feeds into it or builds on top of it. It manages three concerns:

1. **State** — where is every pipeline run right now?
2. **Runtime** — what should execute next?
3. **Dispatch** — which agent/model handles each task?

Nothing moves without the control plane authorizing it. Nothing executes without the control plane tracking it. Nothing completes without the control plane recording it.

---

## 2. Core Components

### 2.1 StateMachine

Manages the lifecycle of every pipeline run and every stage within it.

```
Run Lifecycle:
  created → planning → awaiting_plan_approval → executing → completed
                                                          → failed
                                                          → cancelled

Stage Lifecycle:
  pending → running → awaiting_approval → approved → (next stage)
                                        → rejected → running (retry with feedback)
```

**Key properties:**
- Every state transition is validated — you cannot skip states
- Every transition is timestamped and logged
- Rejected stages preserve their previous output and the user's feedback
- The retry count is tracked per stage (max retries configurable per node)

```python
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

class RunStatus(Enum):
    CREATED = "created"
    PLANNING = "planning"
    AWAITING_PLAN_APPROVAL = "awaiting_plan_approval"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class StageStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    SKIPPED = "skipped"
    FAILED = "failed"

VALID_TRANSITIONS: dict[RunStatus, list[RunStatus]] = {
    RunStatus.CREATED: [RunStatus.PLANNING, RunStatus.CANCELLED],
    RunStatus.PLANNING: [RunStatus.AWAITING_PLAN_APPROVAL, RunStatus.FAILED],
    RunStatus.AWAITING_PLAN_APPROVAL: [RunStatus.EXECUTING, RunStatus.CANCELLED],
    RunStatus.EXECUTING: [RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED],
}

VALID_STAGE_TRANSITIONS: dict[StageStatus, list[StageStatus]] = {
    StageStatus.PENDING: [StageStatus.RUNNING, StageStatus.SKIPPED],
    StageStatus.RUNNING: [StageStatus.AWAITING_APPROVAL, StageStatus.FAILED],
    StageStatus.AWAITING_APPROVAL: [StageStatus.APPROVED, StageStatus.REJECTED],
    StageStatus.REJECTED: [StageStatus.RUNNING],  # retry loop
    StageStatus.APPROVED: [],  # terminal
    StageStatus.SKIPPED: [],   # terminal
    StageStatus.FAILED: [],    # terminal
}

@dataclass
class StageRecord:
    id: str
    node_id: str
    display_name: str
    skill_name: str
    status: StageStatus = StageStatus.PENDING
    depends_on: list[str] = field(default_factory=list)
    node_type: str = "skill"          # skill | gate | verify
    artifact_content: Optional[str] = None
    user_feedback: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None

@dataclass
class RunRecord:
    id: str
    project_id: str
    user_id: str
    status: RunStatus = RunStatus.CREATED
    user_input: str = ""
    stages: list[StageRecord] = field(default_factory=list)
    execution_plan: Optional[dict] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    total_duration_ms: Optional[int] = None


class StateMachine:
    """Validates and executes state transitions for runs and stages."""

    @staticmethod
    def transition_run(run: RunRecord, new_status: RunStatus) -> None:
        allowed = VALID_TRANSITIONS.get(run.status, [])
        if new_status not in allowed:
            raise ValueError(
                f"Invalid run transition: {run.status.value} -> {new_status.value}. "
                f"Allowed: {[s.value for s in allowed]}"
            )
        run.status = new_status
        if new_status == RunStatus.EXECUTING:
            run.started_at = datetime.utcnow()
        elif new_status in (RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED):
            run.completed_at = datetime.utcnow()
            if run.started_at:
                run.total_duration_ms = int(
                    (run.completed_at - run.started_at).total_seconds() * 1000
                )

    @staticmethod
    def transition_stage(stage: StageRecord, new_status: StageStatus) -> None:
        allowed = VALID_STAGE_TRANSITIONS.get(stage.status, [])
        if new_status not in allowed:
            raise ValueError(
                f"Invalid stage transition: {stage.status.value} -> {new_status.value} "
                f"for stage '{stage.display_name}'. Allowed: {[s.value for s in allowed]}"
            )
        stage.status = new_status
        if new_status == StageStatus.RUNNING:
            stage.started_at = datetime.utcnow()
        elif new_status == StageStatus.AWAITING_APPROVAL:
            stage.completed_at = datetime.utcnow()
            if stage.started_at:
                stage.duration_ms = int(
                    (stage.completed_at - stage.started_at).total_seconds() * 1000
                )
```

---

### 2.2 DAGExecutor

Resolves dependencies and determines which stages are ready to execute. This is the runtime scheduler.

**How it works:**
1. Each stage has a `depends_on` list of node IDs
2. A stage is "ready" when ALL its dependencies are in `approved` status
3. Multiple stages can be ready simultaneously — they execute in parallel
4. Gates (human checkpoints) go directly to `awaiting_approval` without executing an agent

```python
from dataclasses import dataclass

@dataclass
class AdvanceResult:
    ready_nodes: list[StageRecord]
    run_complete: bool
    all_approved: bool


class DAGExecutor:
    """Directed Acyclic Graph executor for pipeline stages."""

    @staticmethod
    def validate_plan(stages: list[StageRecord]) -> tuple[bool, list[str]]:
        """Check for missing dependencies and circular references."""
        errors: list[str] = []
        node_ids = {s.node_id for s in stages}

        if not stages:
            return False, ["Execution plan has no stages"]

        # Check all depends_on references exist
        for stage in stages:
            for dep in stage.depends_on:
                if dep not in node_ids:
                    errors.append(
                        f'Stage "{stage.display_name}" depends on "{dep}" which does not exist'
                    )

        # Check for circular dependencies via DFS
        visited: set[str] = set()
        visiting: set[str] = set()
        adj: dict[str, list[str]] = {s.node_id: s.depends_on for s in stages}

        def has_cycle(node_id: str) -> bool:
            if node_id in visiting:
                return True
            if node_id in visited:
                return False
            visiting.add(node_id)
            for dep in adj.get(node_id, []):
                if has_cycle(dep):
                    return True
            visiting.discard(node_id)
            visited.add(node_id)
            return False

        for stage in stages:
            if has_cycle(stage.node_id):
                errors.append(f'Circular dependency detected involving "{stage.display_name}"')
                break

        return len(errors) == 0, errors

    @staticmethod
    def get_ready_stages(run: RunRecord) -> AdvanceResult:
        """Find all stages whose dependencies are satisfied."""
        approved_ids = {
            s.node_id for s in run.stages
            if s.status in (StageStatus.APPROVED, StageStatus.SKIPPED)
        }

        all_terminal = all(
            s.status in (StageStatus.APPROVED, StageStatus.SKIPPED, StageStatus.FAILED)
            for s in run.stages
        )

        if all_terminal:
            return AdvanceResult(ready_nodes=[], run_complete=True, all_approved=True)

        ready: list[StageRecord] = []
        for stage in run.stages:
            if stage.status != StageStatus.PENDING:
                continue
            if all(dep in approved_ids for dep in stage.depends_on):
                ready.append(stage)

        return AdvanceResult(ready_nodes=ready, run_complete=False, all_approved=False)

    @staticmethod
    def advance(run: RunRecord) -> AdvanceResult:
        """Find ready stages and transition them to running/awaiting_approval."""
        result = DAGExecutor.get_ready_stages(run)

        if result.run_complete:
            StateMachine.transition_run(run, RunStatus.COMPLETED)
            return result

        for stage in result.ready_nodes:
            if stage.node_type == "gate":
                StateMachine.transition_stage(stage, StageStatus.AWAITING_APPROVAL)
            else:
                StateMachine.transition_stage(stage, StageStatus.RUNNING)

        return result

    @staticmethod
    def approve_stage(run: RunRecord, stage_id: str, edited_content: Optional[str] = None) -> AdvanceResult:
        """Approve a stage and advance the DAG."""
        stage = next((s for s in run.stages if s.id == stage_id), None)
        if not stage:
            raise ValueError(f"Stage not found: {stage_id}")

        if edited_content is not None:
            stage.artifact_content = edited_content

        StateMachine.transition_stage(stage, StageStatus.APPROVED)
        return DAGExecutor.advance(run)

    @staticmethod
    def reject_stage(run: RunRecord, stage_id: str, feedback: str) -> None:
        """Reject a stage with feedback and reset for retry."""
        stage = next((s for s in run.stages if s.id == stage_id), None)
        if not stage:
            raise ValueError(f"Stage not found: {stage_id}")

        if stage.retry_count >= stage.max_retries:
            StateMachine.transition_stage(stage, StageStatus.FAILED)
            return

        StateMachine.transition_stage(stage, StageStatus.REJECTED)
        stage.user_feedback = feedback
        stage.retry_count += 1
        stage.artifact_content = None
        # Transition back to running for retry
        StateMachine.transition_stage(stage, StageStatus.RUNNING)
```

---

### 2.3 AgentDispatcher (Model Router)

Routes each task to the optimal inference backend based on complexity.

**Routing logic:**
- **Heavy tasks** (PRD generation, architecture, code scaffolding) → Claude API or equivalent large model
- **Light tasks** (quiz generation, code review, validation, verification) → Local Ollama models (free, fast, unlimited)
- **Fallback**: if the preferred backend is down, tasks automatically route to the other

```python
from enum import Enum
from typing import Protocol, AsyncIterator
from abc import abstractmethod


class TaskWeight(Enum):
    HEAVY = "heavy"
    LIGHT = "light"


class InferenceBackend(Enum):
    CLAUDE = "claude"
    OLLAMA = "ollama"


# Skill-to-weight mapping
SKILL_WEIGHTS: dict[str, TaskWeight] = {
    # Heavy — complex reasoning required
    "prd-architect": TaskWeight.HEAVY,
    "phase-builder": TaskWeight.HEAVY,
    "prompt-builder": TaskWeight.HEAVY,
    "phase-executor": TaskWeight.HEAVY,
    "root-cause-analyzer": TaskWeight.HEAVY,
    "fix-planner": TaskWeight.HEAVY,
    "fix-executor": TaskWeight.HEAVY,

    # Light — local models handle fine
    "educator": TaskWeight.LIGHT,
    "quiz-generator": TaskWeight.LIGHT,
    "code-reviewer": TaskWeight.LIGHT,
    "validator": TaskWeight.LIGHT,
    "build-verifier": TaskWeight.LIGHT,
    "test-generator": TaskWeight.LIGHT,
}


class LLMClient(Protocol):
    """Protocol for any LLM client (Claude, Ollama, etc.)."""

    @abstractmethod
    async def generate(self, system: str, messages: list[dict], max_tokens: int) -> str:
        ...

    @abstractmethod
    async def stream(self, system: str, messages: list[dict], max_tokens: int) -> AsyncIterator[str]:
        ...


@dataclass
class RoutingDecision:
    backend: InferenceBackend
    client: LLMClient
    reason: str


class AgentDispatcher:
    """Routes tasks to the optimal inference backend."""

    def __init__(self, claude_client: Optional[LLMClient], ollama_client: Optional[LLMClient]):
        self._claude = claude_client
        self._ollama = ollama_client

    async def _is_ollama_available(self) -> bool:
        """Health check against the Ollama server."""
        if not self._ollama:
            return False
        try:
            # Implementation: HTTP GET to Ollama /api/tags with 3s timeout
            return True
        except Exception:
            return False

    async def route(self, skill_name: str) -> RoutingDecision:
        """Route a task to the optimal backend."""
        weight = SKILL_WEIGHTS.get(skill_name, TaskWeight.HEAVY)

        if weight == TaskWeight.LIGHT:
            if await self._is_ollama_available():
                return RoutingDecision(
                    backend=InferenceBackend.OLLAMA,
                    client=self._ollama,
                    reason=f'Light task "{skill_name}" -> Ollama (free, local)',
                )
            elif self._claude:
                return RoutingDecision(
                    backend=InferenceBackend.CLAUDE,
                    client=self._claude,
                    reason=f'Light task "{skill_name}" -> Claude (Ollama unavailable)',
                )
        else:  # HEAVY
            if self._claude:
                return RoutingDecision(
                    backend=InferenceBackend.CLAUDE,
                    client=self._claude,
                    reason=f'Heavy task "{skill_name}" -> Claude (complex reasoning)',
                )
            elif await self._is_ollama_available():
                return RoutingDecision(
                    backend=InferenceBackend.OLLAMA,
                    client=self._ollama,
                    reason=f'Heavy task "{skill_name}" -> Ollama (Claude unavailable)',
                )

        raise RuntimeError(
            f'Cannot route "{skill_name}": no inference backend available'
        )
```

---

### 2.4 StageExecutor

Executes a single stage by loading its skill prompt, building the message chain, and streaming output from the dispatched agent.

```python
@dataclass
class ExecutionContext:
    user_input: str
    previous_artifacts: list[str]
    user_feedback: Optional[str] = None
    prior_output: Optional[str] = None


class StageExecutor:
    """Executes a single pipeline stage against a dispatched LLM client."""

    def __init__(self, dispatcher: AgentDispatcher, skill_loader: "SkillLoader"):
        self._dispatcher = dispatcher
        self._skill_loader = skill_loader

    async def execute(
        self,
        stage: StageRecord,
        context: ExecutionContext,
    ) -> AsyncIterator[str]:
        """Execute a stage and yield tokens as they stream."""

        # 1. Load the skill system prompt
        system_prompt = self._skill_loader.get_prompt(stage.skill_name)

        # 2. Build message chain from context
        messages: list[dict] = []
        for artifact in context.previous_artifacts:
            messages.append({"role": "assistant", "content": artifact})
            messages.append({"role": "user", "content": "Proceed to the next stage."})

        # Build current stage input
        parts = [f"## User Input\n\n{context.user_input}"]
        if context.user_feedback and context.prior_output:
            parts.append(f"## Previous Output\n\n{context.prior_output}")
            parts.append(f"## User Feedback\n\n{context.user_feedback}")
        messages.append({"role": "user", "content": "\n\n---\n\n".join(parts)})

        # 3. Route to the right backend
        routing = await self._dispatcher.route(stage.skill_name)

        # 4. Stream the response
        async for token in routing.client.stream(
            system=system_prompt,
            messages=messages,
            max_tokens=8192,
        ):
            yield token
```

---

## 3. Integration Points

### 3.1 How Rajat's FastAPI Surface Calls the Control Plane

```python
# Rajat's FastAPI routes call control plane functions directly

from fastapi import FastAPI, HTTPException
from control_plane import StateMachine, DAGExecutor, StageExecutor, AgentDispatcher

app = FastAPI()

@app.post("/api/runs/{run_id}/stages/{stage_id}/approve")
async def approve_stage(run_id: str, stage_id: str, body: ApproveRequest):
    run = await db.get_run(run_id)
    result = DAGExecutor.approve_stage(run, stage_id, body.edited_content)
    await db.save_run(run)

    # Start executing any newly ready stages
    for ready_stage in result.ready_nodes:
        if ready_stage.node_type != "gate":
            asyncio.create_task(execute_and_complete(run, ready_stage))

    return {"ready_nodes": len(result.ready_nodes), "run_complete": result.run_complete}


@app.post("/api/runs/{run_id}/stages/{stage_id}/reject")
async def reject_stage(run_id: str, stage_id: str, body: RejectRequest):
    run = await db.get_run(run_id)
    DAGExecutor.reject_stage(run, stage_id, body.feedback)
    await db.save_run(run)

    # Re-execute the rejected stage with feedback
    stage = next(s for s in run.stages if s.id == stage_id)
    asyncio.create_task(execute_and_complete(run, stage))

    return {"status": "re-executing", "retry_count": stage.retry_count}
```

### 3.2 How Ryo's TypeScript SDK Calls Rajat's API

```typescript
// Ryo's SDK wraps Rajat's FastAPI endpoints

class AIFactoryClient {
  constructor(private baseUrl: string, private apiKey: string) {}

  async approveStage(runId: string, stageId: string, editedContent?: string) {
    return this.post(`/api/runs/${runId}/stages/${stageId}/approve`, {
      edited_content: editedContent,
    });
  }

  async rejectStage(runId: string, stageId: string, feedback: string) {
    return this.post(`/api/runs/${runId}/stages/${stageId}/reject`, {
      feedback,
    });
  }

  async *streamStage(runId: string, stageId: string): AsyncGenerator<string> {
    // SSE stream from Rajat's endpoint
    const source = new EventSource(
      `${this.baseUrl}/api/runs/${runId}/stages/${stageId}/stream`
    );
    // ... yield tokens
  }
}
```

---

## 4. Data Flow Diagram

```
                    ┌──────────────────────────────┐
                    │     Ryo: TypeScript SDK       │
                    │   (client library for UI/CLI) │
                    └──────────────┬───────────────┘
                                   │ HTTP / SSE
                    ┌──────────────▼───────────────┐
                    │   Rajat: FastAPI Surface      │
                    │   (REST API + SSE streaming)  │
                    └──────────────┬───────────────┘
                                   │ function calls
          ┌────────────────────────▼────────────────────────┐
          │            GUISSEPPE: CONTROL PLANE              │
          │                                                  │
          │  ┌──────────────┐  ┌──────────────┐             │
          │  │ StateMachine │  │ DAGExecutor  │             │
          │  │ (lifecycle)  │  │ (scheduler)  │             │
          │  └──────────────┘  └──────────────┘             │
          │                                                  │
          │  ┌────────────────┐  ┌───────────────┐          │
          │  │AgentDispatcher │  │ StageExecutor │          │
          │  │ (model router) │  │ (runs agents) │          │
          │  └───────┬────────┘  └───────────────┘          │
          └──────────┼──────────────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │   Inference Layer   │
          │                     │
          │  ┌───────┐ ┌─────┐ │
          │  │Claude │ │Ollama│ │
          │  │(heavy)│ │(light│ │
          │  └───────┘ └─────┘ │
          └─────────────────────┘
```

---

## 5. How This Connects to Other Subsystems

| Subsystem | Relationship to Control Plane |
|-----------|-------------------------------|
| **1. Scrum Hierarchy** (Tom) | Control plane respects role permissions — PM agents can approve/reject, dev agents only execute |
| **2. Planning System** (Youssef) | Planning system outputs execution plans that the control plane's DAGExecutor consumes |
| **3. Intake + Intelligence** (James, William) | Intake feeds user specs into the control plane as `RunRecord.user_input` |
| **5. Handoff Model** (Stefano) | When a stage completes, the control plane triggers Stefano's handoff persistence before advancing |
| **6. Skills + Context** (RJ) | StageExecutor loads skill prompts from RJ's skill registry |
| **7. Trust Layer** (Gabriel) | Every state transition is logged for Gabriel's audit trail |

---

## 6. What I'm Bringing That Already Works

I've implemented this exact architecture twice in TypeScript:

| Concept | My Existing Implementation | Python Port |
|---------|---------------------------|-------------|
| State machine with validated transitions | `pipeline-engine.ts` | `StateMachine` class |
| DAG dependency resolution | `dag-executor.ts` | `DAGExecutor` class |
| Multi-model agent routing | `model-router.ts` | `AgentDispatcher` class |
| Streaming stage execution | `stage-executor.ts` | `StageExecutor` class |
| Checkpoint-based approval gates | `pipeline-view.tsx` + API routes | FastAPI endpoints |
| Reject-with-feedback retry loop | `dag-executor.ts` approve/reject | `DAGExecutor.reject_stage()` |

These patterns are proven in production. The Python port preserves the same architecture with idiomatic Python constructs (dataclasses, enums, async generators, Protocol types).

---

## 7. Open Questions for Friday

1. **Database**: Are we using PostgreSQL with SQLAlchemy/Prisma, or something else for persistence?
2. **Message queue**: Should stage execution be dispatched via a queue (Redis/Celery) or direct async tasks?
3. **Rajat**: What URL patterns do you want for the FastAPI surface? I'll match my function signatures to your route handlers.
4. **Ryo**: What response shapes does the TypeScript SDK expect? I'll make sure the control plane outputs match.
5. **Stefano**: At what point in the state machine should handoff persistence trigger — on `approved` or on `completed`?

---

## 8. Deliverables by Friday

- [ ] `control_plane/state_machine.py` — RunStatus, StageStatus, validated transitions
- [ ] `control_plane/dag_executor.py` — dependency resolution, advance logic, approve/reject
- [ ] `control_plane/agent_dispatcher.py` — model routing with fallback
- [ ] `control_plane/stage_executor.py` — skill loading, context building, streaming
- [ ] `control_plane/models.py` — RunRecord, StageRecord dataclasses
- [ ] Unit tests for state transitions and DAG resolution
- [ ] This architecture doc with diagrams
