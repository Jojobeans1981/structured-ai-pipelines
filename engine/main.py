"""
Gauntlet Forge Engine — FastAPI service wrapping pipeline execution.

This is the core compute service. It owns:
  - Pipeline creation, execution, and streaming
  - Project CRUD and file management
  - Metrics collection and learning store
  - All LLM orchestration (DAG executor, agents)

The Gateway proxies public traffic here after auth + validation.
"""

import os
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("engine")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
NEXTJS_URL = os.getenv("NEXTJS_INTERNAL_URL", "http://localhost:3000")
DATABASE_URL = os.getenv("DATABASE_URL", "")


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown hooks."""
    logger.info("Engine starting — proxying to Next.js at %s", NEXTJS_URL)
    yield
    logger.info("Engine shutting down")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Gauntlet Forge Engine",
    version="1.0.0",
    description="Pipeline execution engine for Gauntlet Forge",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared HTTP client for proxying to the Next.js backend
_client: Optional[httpx.AsyncClient] = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(base_url=NEXTJS_URL, timeout=300.0)
    return _client


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    """Engine health check — also verifies Next.js backend is reachable."""
    try:
        client = get_client()
        resp = await client.get("/api/metrics")
        nextjs_ok = resp.status_code == 200
    except Exception:
        nextjs_ok = False

    return {
        "status": "healthy",
        "engine": True,
        "nextjs_backend": nextjs_ok,
        "database": bool(DATABASE_URL),
    }


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=10000)
    type: str = Field("build", pattern="^(build|diagnostic|refactor|enhance|test|deploy)$")
    userInput: str = Field(..., min_length=1, max_length=50000)
    autoApprove: bool = True


class StageAction(BaseModel):
    feedback: str = Field("", max_length=10000)
    editedContent: Optional[str] = None


class FeedbackSubmit(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    workedOutOfBox: bool = False
    comment: str = Field("", max_length=5000)


# ---------------------------------------------------------------------------
# Project endpoints
# ---------------------------------------------------------------------------
@app.get("/api/v1/projects")
async def list_projects(request: Request):
    """List all projects for the authenticated user."""
    return await _proxy(request, "/api/projects")


@app.post("/api/v1/projects")
async def create_project(body: ProjectCreate, request: Request):
    """Create a project and start a pipeline run."""
    return await _proxy(request, "/api/projects", method="POST")


@app.get("/api/v1/projects/{project_id}")
async def get_project(project_id: str, request: Request):
    return await _proxy(request, f"/api/projects/{project_id}")


@app.delete("/api/v1/projects/{project_id}")
async def delete_project(project_id: str, request: Request):
    return await _proxy(request, f"/api/projects/{project_id}", method="DELETE")


# ---------------------------------------------------------------------------
# Pipeline endpoints
# ---------------------------------------------------------------------------
@app.get("/api/v1/pipeline/{run_id}")
async def get_run(run_id: str, request: Request):
    return await _proxy(request, f"/api/pipeline/{run_id}")


@app.post("/api/v1/pipeline/{run_id}/plan/approve")
async def approve_plan(run_id: str, request: Request):
    return await _proxy(request, f"/api/pipeline/{run_id}/plan/approve", method="POST")


@app.get("/api/v1/pipeline/{run_id}/nodes/{node_id}/stream")
async def stream_node(run_id: str, node_id: str, request: Request):
    """Proxy SSE stream from a running node."""
    return await _proxy_stream(request, f"/api/pipeline/{run_id}/nodes/{node_id}/stream")


@app.post("/api/v1/pipeline/{run_id}/stages/{stage_id}/approve")
async def approve_stage(run_id: str, stage_id: str, request: Request):
    return await _proxy(request, f"/api/pipeline/{run_id}/stages/{stage_id}/approve", method="POST")


@app.post("/api/v1/pipeline/{run_id}/stages/{stage_id}/reject")
async def reject_stage(run_id: str, stage_id: str, body: StageAction, request: Request):
    return await _proxy(request, f"/api/pipeline/{run_id}/stages/{stage_id}/reject", method="POST")


@app.post("/api/v1/pipeline/{run_id}/cancel")
async def cancel_run(run_id: str, request: Request):
    return await _proxy(request, f"/api/pipeline/{run_id}/cancel", method="POST")


@app.post("/api/v1/pipeline/{run_id}/rerun")
async def rerun_pipeline(run_id: str, request: Request):
    return await _proxy(request, f"/api/pipeline/{run_id}/rerun", method="POST")


@app.get("/api/v1/pipeline/{run_id}/graph")
async def get_graph(run_id: str, request: Request):
    return await _proxy(request, f"/api/pipeline/{run_id}/graph")


@app.get("/api/v1/pipeline/{run_id}/cost")
async def get_cost(run_id: str, request: Request):
    return await _proxy(request, f"/api/pipeline/{run_id}/cost")


@app.get("/api/v1/pipeline/{run_id}/trace")
async def get_trace(run_id: str, request: Request):
    return await _proxy(request, f"/api/pipeline/{run_id}/trace")


# ---------------------------------------------------------------------------
# Metrics endpoints
# ---------------------------------------------------------------------------
@app.get("/api/v1/metrics")
async def get_metrics(request: Request):
    return await _proxy(request, "/api/metrics")


@app.get("/api/v1/metrics/agents")
async def get_agent_metrics(request: Request):
    return await _proxy(request, "/api/metrics/agents")


@app.get("/api/v1/metrics/prompt-health")
async def get_prompt_health(request: Request):
    return await _proxy(request, "/api/metrics/prompt-health")


@app.get("/api/v1/metrics/history")
async def get_metrics_history(request: Request):
    return await _proxy(request, "/api/metrics/history")


# ---------------------------------------------------------------------------
# File / upload endpoints
# ---------------------------------------------------------------------------
@app.post("/api/v1/projects/{project_id}/upload")
async def upload_files(project_id: str, request: Request):
    return await _proxy(request, f"/api/projects/{project_id}/upload", method="POST")


@app.get("/api/v1/projects/{project_id}/download")
async def download_project(project_id: str, request: Request):
    return await _proxy(request, f"/api/projects/{project_id}/download")


@app.post("/api/v1/projects/{project_id}/feedback")
async def submit_feedback(project_id: str, body: FeedbackSubmit, request: Request):
    return await _proxy(request, f"/api/projects/{project_id}/feedback", method="POST")


# ---------------------------------------------------------------------------
# Learning store
# ---------------------------------------------------------------------------
@app.get("/api/v1/learning")
async def get_learning(request: Request):
    return await _proxy(request, "/api/learning")


# ---------------------------------------------------------------------------
# Proxy helpers
# ---------------------------------------------------------------------------
async def _proxy(request: Request, path: str, method: str = None) -> Response:
    """Forward a request to the Next.js backend and return the response."""
    client = get_client()
    method = method or request.method

    headers = dict(request.headers)
    headers.pop("host", None)

    body = await request.body() if method in ("POST", "PUT", "PATCH", "DELETE") else None

    try:
        resp = await client.request(
            method=method,
            url=path,
            headers=headers,
            content=body,
            params=dict(request.query_params),
        )
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=dict(resp.headers),
        )
    except httpx.ConnectError:
        raise HTTPException(502, "Engine: Next.js backend unreachable")
    except httpx.TimeoutException:
        raise HTTPException(504, "Engine: Next.js backend timed out")


async def _proxy_stream(request: Request, path: str) -> StreamingResponse:
    """Proxy an SSE stream from the Next.js backend."""
    client = get_client()
    headers = dict(request.headers)
    headers.pop("host", None)

    async def event_generator():
        try:
            async with client.stream(
                "GET", path, headers=headers,
                params=dict(request.query_params),
            ) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk
        except Exception as e:
            logger.error("SSE proxy error: %s", e)
            yield f"data: {{\"type\": \"error\", \"data\": {{\"message\": \"{str(e)}\"}}}}\n\n".encode()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
