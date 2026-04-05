# Preview Worker

This service provides remote live previews for Forge when the main app host cannot run Docker directly.

## What it does

- accepts stored project files from the main app
- writes them into a temporary workspace
- starts a Docker-backed preview container
- returns a preview URL and expiry time
- cleans the container up after its TTL expires

## Required environment

- `PREVIEW_WORKER_TOKEN`
  Shared bearer token used by the Next.js app and the worker.
- `PREVIEW_WORKER_PUBLIC_BASE_URL`
  Public base URL for previews launched by this worker, for example `https://preview.example.com`.
- `PREVIEW_WORKER_IMAGE`
  Optional. Defaults to `node:20-slim`.
- `PREVIEW_WORKER_STARTUP_TIMEOUT_SECONDS`
  Optional. Defaults to `45`.

## Deployment notes

- The worker needs Docker daemon access.
- The worker should run on a VM or container host where published preview ports are reachable from users.
- The main app should set `PREVIEW_WORKER_URL` to this service and `PREVIEW_WORKER_TOKEN` to the same token.
- This is an MVP. It does not yet enforce per-job CPU, memory, or network isolation beyond what Docker and the host provide.
