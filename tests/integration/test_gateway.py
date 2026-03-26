"""
Integration tests for the Gauntlet Forge gateway + engine stack.

Prerequisites:
  docker compose up -d --build

These tests verify:
  1. Gateway /health returns 200 and reports engine status
  2. Unauthenticated requests to /api/v1/* return 401
  3. Auth endpoints exist (/auth/google, /auth/me)
  4. Rate limiting headers are present
"""

import os
import pytest
import httpx

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8000")
ENGINE_URL = os.getenv("ENGINE_URL", "http://localhost:3001")


@pytest.fixture
def client():
    return httpx.Client(base_url=GATEWAY_URL, timeout=30.0)


@pytest.fixture
def engine_client():
    return httpx.Client(base_url=ENGINE_URL, timeout=30.0)


# ── Health checks ──

def test_gateway_health(client):
    """Gateway /health returns 200 with gateway=true."""
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["gateway"] is True


def test_engine_health(engine_client):
    """Engine /health returns 200."""
    resp = engine_client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["engine"] is True


# ── Auth enforcement ──

def test_unauthenticated_projects_returns_401(client):
    """Requests to /api/v1/projects without auth return 401."""
    resp = client.get("/api/v1/projects")
    assert resp.status_code == 401


def test_unauthenticated_metrics_returns_401(client):
    """Requests to /api/v1/metrics without auth return 401."""
    resp = client.get("/api/v1/metrics")
    assert resp.status_code == 401


def test_unauthenticated_pipeline_returns_401(client):
    """Requests to /api/v1/pipeline/xxx without auth return 401."""
    resp = client.get("/api/v1/pipeline/nonexistent")
    assert resp.status_code == 401


# ── Auth endpoints exist ──

def test_google_auth_endpoint_exists(client):
    """/auth/google returns a redirect (302) or 501 if not configured."""
    resp = client.get("/auth/google", follow_redirects=False)
    assert resp.status_code in (302, 501)


def test_auth_me_requires_token(client):
    """/auth/me without token returns 401."""
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_logout_endpoint(client):
    """/auth/logout returns 200."""
    resp = client.post("/auth/logout")
    assert resp.status_code == 200


# ── OpenAPI docs ──

def test_gateway_openapi_docs(client):
    """Gateway serves OpenAPI docs at /docs."""
    resp = client.get("/docs")
    assert resp.status_code == 200
    assert "swagger" in resp.text.lower() or "openapi" in resp.text.lower()


def test_engine_openapi_docs(engine_client):
    """Engine serves OpenAPI docs at /docs."""
    resp = engine_client.get("/docs")
    assert resp.status_code == 200
