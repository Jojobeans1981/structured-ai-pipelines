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

## Recommended host deployment

The most reliable deployment is to run the worker directly on the VM host with `systemd`, not inside Docker.

### 1. Prepare the host

- Install Docker
- Install Python 3, `pip`, and `venv`
- Clone this repo onto the VM
- Create a virtualenv in `preview-worker`
- Install requirements with `pip install -r requirements.txt`

### 2. Install the service

- Copy [forge-preview-worker.service](/preview-worker/forge-preview-worker.service) to `/etc/systemd/system/forge-preview-worker.service`
- Replace:
  - `PREVIEW_WORKER_TOKEN`
  - `PREVIEW_WORKER_PUBLIC_BASE_URL`
  - `WorkingDirectory`
  - `ExecStart`

### 3. Start it

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now forge-preview-worker
sudo systemctl status forge-preview-worker
```

### 4. Verify it

```bash
curl http://127.0.0.1:3010/health
```

Expected response:

```json
{"status":"healthy","dockerAvailable":true,"reason":null}
```

## Troubleshooting

- If previews launch but the app UI never shows an open button, confirm the worker is running the latest code and that the app has the latest `PREVIEW_WORKER_URL` / `PREVIEW_WORKER_TOKEN`.
- If the worker says healthy but launches fail, inspect `preview-worker.log` or `journalctl -u forge-preview-worker -n 200`.
- If the preview app starts on Vite or another non-3000 port, the worker now probes all mapped candidate ports and should return the live one automatically.
- If a preview app fails during `npm install`, the worker retries with `--legacy-peer-deps`, but badly generated package manifests can still fail and need to be fixed in the generated project itself.
