"""
Gauntlet Forge Gateway — public-facing FastAPI service.

Responsibilities:
  - Google OAuth2 login (issues JWT session tokens)
  - Rate limiting per user
  - Request validation (pydantic)
  - Proxies authenticated requests to the Engine service
  - OpenAPI spec merging
"""

import os
import time
import logging
import secrets
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import jwt
from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("gateway")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
ENGINE_URL = os.getenv("ENGINE_URL", "http://engine:3001")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
JWT_SECRET = os.getenv("JWT_SECRET_KEY", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
RATE_LIMIT_PERIOD = int(os.getenv("RATE_LIMIT_PERIOD", "60"))
GATEWAY_URL = os.getenv("GATEWAY_PUBLIC_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# ---------------------------------------------------------------------------
# Rate limiter (in-memory, per-user)
# ---------------------------------------------------------------------------
_rate_store: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(user_id: str) -> bool:
    """Return True if the user is within rate limits."""
    now = time.time()
    window_start = now - RATE_LIMIT_PERIOD
    hits = _rate_store[user_id]
    # Prune old entries
    _rate_store[user_id] = [t for t in hits if t > window_start]
    if len(_rate_store[user_id]) >= RATE_LIMIT_REQUESTS:
        return False
    _rate_store[user_id].append(now)
    return True


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------
def create_token(user_id: str, email: str, name: str = "") -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------
async def get_current_user(request: Request) -> dict:
    """Extract and validate JWT from Authorization header or cookie."""
    token = None

    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]

    if not token:
        token = request.cookies.get("forge_token")

    if not token:
        raise HTTPException(401, "Not authenticated — provide Bearer token or forge_token cookie")

    return decode_token(token)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Gateway starting — engine at %s", ENGINE_URL)
    yield
    logger.info("Gateway shutting down")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Gauntlet Forge Gateway",
    version="1.0.0",
    description="Public API gateway for Gauntlet Forge — handles auth, rate limiting, and proxying to the engine.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared HTTP client for proxying to engine
_client: Optional[httpx.AsyncClient] = None


def get_engine_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(base_url=ENGINE_URL, timeout=300.0)
    return _client


# ---------------------------------------------------------------------------
# Health (public, no auth)
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    """Gateway health check — also pings the engine."""
    try:
        client = get_engine_client()
        resp = await client.get("/health")
        engine_health = resp.json() if resp.status_code == 200 else None
    except Exception:
        engine_health = None

    return {
        "status": "healthy",
        "gateway": True,
        "engine": engine_health,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# OAuth2 — Google login flow
# ---------------------------------------------------------------------------
@app.get("/auth/google")
async def google_login():
    """Redirect to Google OAuth2 consent screen."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(501, "Google OAuth not configured — set GOOGLE_OAUTH_CLIENT_ID")

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": f"{GATEWAY_URL}/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{query}")


@app.get("/auth/google/callback")
async def google_callback(code: str = ""):
    """Exchange Google auth code for tokens, create JWT, redirect to frontend."""
    if not code:
        raise HTTPException(400, "Missing authorization code")

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": f"{GATEWAY_URL}/auth/google/callback",
                "grant_type": "authorization_code",
            },
        )

    if token_resp.status_code != 200:
        raise HTTPException(400, f"Google token exchange failed: {token_resp.text}")

    token_data = token_resp.json()
    id_token_raw = token_data.get("id_token", "")

    # Decode the ID token (skip verification for now — Google signed it)
    try:
        payload = jwt.decode(id_token_raw, options={"verify_signature": False})
    except Exception:
        raise HTTPException(400, "Failed to decode Google ID token")

    email = payload.get("email", "")
    name = payload.get("name", email.split("@")[0])
    user_id = payload.get("sub", "")

    # Issue our own JWT
    forge_token = create_token(user_id, email, name)

    # Redirect to frontend with token as cookie
    response = RedirectResponse(f"{FRONTEND_URL}?login=success")
    response.set_cookie(
        "forge_token", forge_token,
        httponly=True, secure=True, samesite="lax",
        max_age=JWT_EXPIRY_HOURS * 3600,
    )
    return response


@app.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    """Return the current user's info from their JWT."""
    return {
        "id": user.get("sub"),
        "email": user.get("email"),
        "name": user.get("name"),
    }


@app.post("/auth/logout")
async def logout():
    response = JSONResponse({"status": "logged_out"})
    response.delete_cookie("forge_token")
    return response


# ---------------------------------------------------------------------------
# Authenticated proxy to engine — all /api/v1/* routes
# ---------------------------------------------------------------------------
@app.api_route("/api/v1/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy_to_engine(path: str, request: Request, user: dict = Depends(get_current_user)):
    """
    Authenticated proxy — validates JWT, applies rate limit, forwards to engine.
    """
    user_id = user.get("sub", "unknown")

    # Rate limit check
    if not check_rate_limit(user_id):
        raise HTTPException(
            429,
            f"Rate limit exceeded — max {RATE_LIMIT_REQUESTS} requests per {RATE_LIMIT_PERIOD}s",
        )

    client = get_engine_client()
    target = f"/api/v1/{path}"

    headers = dict(request.headers)
    headers.pop("host", None)
    # Inject user info for the engine
    headers["x-user-id"] = user_id
    headers["x-user-email"] = user.get("email", "")

    body = await request.body() if request.method in ("POST", "PUT", "PATCH", "DELETE") else None

    # Check if this is an SSE stream request
    if "stream" in path:
        return await _proxy_stream(client, target, headers, dict(request.query_params))

    try:
        resp = await client.request(
            method=request.method,
            url=target,
            headers=headers,
            content=body,
            params=dict(request.query_params),
        )

        response_headers = dict(resp.headers)
        response_headers.pop("transfer-encoding", None)

        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=response_headers,
        )
    except httpx.ConnectError:
        raise HTTPException(502, "Gateway: Engine service unreachable")
    except httpx.TimeoutException:
        raise HTTPException(504, "Gateway: Engine service timed out")


async def _proxy_stream(
    client: httpx.AsyncClient, path: str, headers: dict, params: dict
) -> StreamingResponse:
    """Proxy SSE streams from the engine."""
    async def event_generator():
        try:
            async with client.stream("GET", path, headers=headers, params=params) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk
        except Exception as e:
            logger.error("SSE proxy error: %s", e)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
