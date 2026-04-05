import json
import os
import shutil
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import SplitResult, urlsplit, urlunsplit

import docker
import requests
from docker.errors import DockerException
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

DOCKER_IMAGE = os.getenv("PREVIEW_WORKER_IMAGE", "node:20-slim")
PORT_CANDIDATES = [3000, 4173, 5173, 8080]
AUTH_TOKEN = os.getenv("PREVIEW_WORKER_TOKEN", "").strip()
WORKER_PUBLIC_BASE_URL = os.getenv("PREVIEW_WORKER_PUBLIC_BASE_URL", "").strip()
STARTUP_TIMEOUT_SECONDS = int(os.getenv("PREVIEW_WORKER_STARTUP_TIMEOUT_SECONDS", "45"))

app = FastAPI(title="Forge Preview Worker", version="0.1.0")

active_previews: dict[str, dict] = {}


class PreviewFile(BaseModel):
    filePath: str
    content: str


class LaunchPreviewRequest(BaseModel):
    files: list[PreviewFile]
    ttlSeconds: int = 1800
    projectId: Optional[str] = None


class StopPreviewRequest(BaseModel):
    containerId: str


def get_container_logs(container, tail: int = 40) -> str:
    try:
        return container.logs(tail=tail).decode("utf-8", errors="ignore")
    except DockerException:
        return ""


def require_auth(authorization: str | None = Header(default=None)) -> None:
    if not AUTH_TOKEN:
        return

    if authorization != f"Bearer {AUTH_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized preview worker request")


def get_docker_client():
    return docker.from_env()


def get_public_host() -> str:
    return WORKER_PUBLIC_BASE_URL or "http://localhost"


def build_preview_url(host_port: int) -> str:
    parsed = urlsplit(get_public_host())
    if parsed.scheme and parsed.netloc:
        hostname = parsed.hostname or "localhost"
        port = f":{host_port}"
        netloc = f"{hostname}{port}"
        if parsed.username:
            auth = parsed.username
            if parsed.password:
                auth = f"{auth}:{parsed.password}"
            netloc = f"{auth}@{netloc}"
        return urlunsplit(SplitResult(parsed.scheme, netloc, parsed.path, parsed.query, parsed.fragment))

    return f"{get_public_host().rstrip('/')}:{host_port}"


def ensure_project_files(files: list[PreviewFile]) -> str:
    project_dir = tempfile.mkdtemp(prefix="forge-preview-worker-")

    try:
        for file in files:
            relative_path = Path(file.filePath)
            if relative_path.is_absolute() or ".." in relative_path.parts:
                raise HTTPException(status_code=400, detail=f"Unsafe preview file path: {file.filePath}")

            target = (Path(project_dir) / relative_path).resolve()
            if not str(target).startswith(str(Path(project_dir).resolve())):
                raise HTTPException(status_code=400, detail=f"Unsafe preview file path: {file.filePath}")

            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(file.content, encoding="utf-8")

        if not (Path(project_dir) / "package.json").exists():
            raise HTTPException(status_code=400, detail="No package.json found in preview payload")

        return project_dir
    except Exception:
        shutil.rmtree(project_dir, ignore_errors=True)
        raise


def choose_start_command(project_dir: Path, package_json_path: Path) -> str:
    pkg = json.loads(package_json_path.read_text(encoding="utf-8"))
    scripts = pkg.get("scripts", {})
    dependencies = {
        **pkg.get("dependencies", {}),
        **pkg.get("devDependencies", {}),
    }
    start_script = scripts.get("start", "")

    if "dev" in scripts:
        return "(npm run dev -- --hostname 0.0.0.0 || npm run dev -- --host 0.0.0.0 || npm run dev)"
    if "preview" in scripts:
        return "(npm run preview -- --host 0.0.0.0 || npm run preview)"
    if dependencies.get("vite") or any((project_dir / name).exists() for name in ("vite.config.ts", "vite.config.js", "vite.config.mjs")):
        return "npx vite --host 0.0.0.0"
    if dependencies.get("next") or any((project_dir / name).exists() for name in ("next.config.js", "next.config.mjs", "next.config.ts")):
        return "npx next dev -H 0.0.0.0 -p 3000"
    if "start" in scripts:
        if ".ts" in start_script and ("react" in dependencies or "react-dom" in dependencies):
            if any((project_dir / name).exists() for name in ("vite.config.ts", "vite.config.js", "vite.config.mjs")):
                return "npx vite --host 0.0.0.0"
        return "npm start"
    return "npm run dev"


def build_launch_command(start_command: str) -> str:
    install_command = (
        "(npm install --no-audit --no-fund "
        "|| npm install --legacy-peer-deps --no-audit --no-fund)"
    )
    return f"{install_command} && ({start_command})"


def cleanup_preview(container_id: str, project_dir: str) -> None:
    try:
        client = get_docker_client()
        try:
            container = client.containers.get(container_id)
            container.remove(force=True)
        except DockerException:
            pass
    finally:
        shutil.rmtree(project_dir, ignore_errors=True)
        active_previews.pop(container_id, None)


def schedule_cleanup(container_id: str, project_dir: str, ttl_seconds: int) -> None:
    timer = threading.Timer(ttl_seconds, cleanup_preview, args=(container_id, project_dir))
    timer.daemon = True
    timer.start()


def check_url(url: str) -> bool:
    try:
        response = requests.get(url, timeout=2)
        return response.status_code < 500
    except requests.RequestException:
        return False


@app.get("/health")
def health():
    try:
        client = get_docker_client()
        client.ping()
        return {"status": "healthy", "dockerAvailable": True, "reason": None}
    except DockerException as error:
        return {"status": "degraded", "dockerAvailable": False, "reason": str(error)}


@app.post("/preview/launch", dependencies=[Depends(require_auth)])
def launch_preview(payload: LaunchPreviewRequest):
    project_dir = ensure_project_files(payload.files)
    package_json_path = Path(project_dir) / "package.json"
    start_command = choose_start_command(Path(project_dir), package_json_path)
    ttl_seconds = max(60, min(payload.ttlSeconds, 3600))

    try:
        client = get_docker_client()
        container = client.containers.run(
            DOCKER_IMAGE,
            command=["sh", "-lc", build_launch_command(start_command)],
            detach=True,
            name=f"forge-preview-{int(time.time())}-{os.getpid()}",
            working_dir="/app",
            volumes={project_dir: {"bind": "/app", "mode": "rw"}},
            ports={f"{port}/tcp": None for port in PORT_CANDIDATES},
        )
    except DockerException as error:
        shutil.rmtree(project_dir, ignore_errors=True)
        return {
            "success": False,
            "url": None,
            "containerId": None,
            "port": None,
            "expiresAt": None,
            "error": str(error),
        }

    container.reload()
    ports = container.attrs.get("NetworkSettings", {}).get("Ports", {})

    host_port = None
    for port in PORT_CANDIDATES:
        binding = ports.get(f"{port}/tcp")
        if binding and len(binding) > 0:
            host_port = int(binding[0]["HostPort"])
            break

    preview_url = build_preview_url(host_port) if host_port else None
    expires_at = datetime.fromtimestamp(time.time() + ttl_seconds, tz=timezone.utc).isoformat()
    active_previews[container.id] = {
        "projectDir": project_dir,
        "expiresAt": expires_at,
        "previewUrl": preview_url,
    }
    schedule_cleanup(container.id, project_dir, ttl_seconds)

    if preview_url:
        deadline = time.time() + STARTUP_TIMEOUT_SECONDS
        while time.time() < deadline:
            container.reload()
            if container.status in {"exited", "dead"}:
                logs = container.logs(tail=100).decode("utf-8", errors="ignore")
                cleanup_preview(container.id, project_dir)
                return {
                    "success": False,
                    "url": None,
                    "containerId": None,
                    "port": None,
                    "expiresAt": None,
                    "error": logs or "Preview container exited before becoming healthy.",
                }

            if check_url(preview_url):
                return {
                    "success": True,
                    "url": preview_url,
                    "containerId": container.id,
                    "port": host_port,
                    "expiresAt": expires_at,
                    "error": None,
                }
            time.sleep(2)

    logs = container.logs(tail=100).decode("utf-8", errors="ignore")
    cleanup_preview(container.id, project_dir)
    return {
        "success": False,
        "url": None,
        "containerId": None,
        "port": host_port,
        "expiresAt": None,
        "error": logs or "Preview worker timed out waiting for the app to become reachable.",
    }


@app.get("/preview/status/{container_id}", dependencies=[Depends(require_auth)])
def preview_status(container_id: str):
    info = active_previews.get(container_id)

    try:
        client = get_docker_client()
        container = client.containers.get(container_id)
        container.reload()
    except DockerException:
        if info:
          cleanup_preview(container_id, info.get("projectDir", ""))
        return {
            "found": False,
            "status": "missing",
            "running": False,
            "previewUrl": None,
            "expiresAt": info.get("expiresAt") if info else None,
            "error": "Preview container is no longer available.",
            "logs": "",
        }

    logs = get_container_logs(container)
    status = container.status

    return {
        "found": True,
        "status": status,
        "running": status == "running",
        "previewUrl": info.get("previewUrl") if info else None,
        "expiresAt": info.get("expiresAt") if info else None,
        "error": None if status == "running" else "Preview container is not running.",
        "logs": logs,
    }


@app.post("/preview/stop", dependencies=[Depends(require_auth)])
def stop_preview(payload: StopPreviewRequest):
    info = active_previews.get(payload.containerId)
    cleanup_preview(payload.containerId, info["projectDir"] if info else "")
    return {"stopped": True}
