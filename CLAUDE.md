# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Short Studio: a personal, localhost-only web app for making Thai vertical short videos (1080×1920, 30 fps, H.264/AAC) on the user's Windows/AMD machine. React + TypeScript + shadcn/ui frontend, FastAPI + SQLite backend, FFmpeg rendering. Voice uses Gemini TTS (`gemini-3.8-flash-tts`, cloud); planning/images/transcription use local llama.cpp / stable-diffusion.cpp / whisper.cpp subprocesses whose binary and model paths the user configures in the app's settings (nothing is downloaded automatically).

User-facing strings, README and `Handoff.md` are in Thai. Read `Handoff.md` and `docs/validation.md` before larger changes: they record what has actually been tested and what has not (Gemini live, local model inference, Windows scripts/folder picker, AMD Vulkan, YouTube download are all untested). Do not claim those paths work based on mocked tests.

## Commands (Linux/cloud)

```bash
python -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt   # requirements.in is the unpinned source
(cd frontend && npm ci && npm run build)                       # build = tsc -b && vite build
.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8765   # serves frontend/dist too
```

- Hot reload: `npm run dev` in `frontend/` (Vite on 127.0.0.1:5173, proxies `/api` to 8765; backend must be running).
- Backend tests: `.venv/bin/python -m pytest backend/tests -q`; single test: `.venv/bin/python -m pytest backend/tests/test_workflow.py::test_cues_cannot_overlap_or_exceed_audio -q`. Media tests need `ffmpeg`/`ffprobe` with libx264 + libass on PATH.
- Browser tests: start the backend on 8765 first, then `cd frontend && CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test` (config defaults to `/usr/bin/chromium`; single test with `-g "<name>"`).
- There is no linter configured; TypeScript type-checking happens in `npm run build`.
- Windows: `scripts/setup.ps1` then `scripts/start.ps1` (runs `scripts/launch.py`, which refuses to start if port 8765 is taken and opens the browser after `/api/health` passes; `SHORT_STUDIO_NO_BROWSER=1` skips the browser).

Use the existing checkout; do not create git worktrees unless asked.

## Architecture

Request flow: `frontend/src/App.tsx` (single large component file holding the whole studio UI) → `frontend/src/lib/api.ts` (typed client + shared `Project`/`Scene`/`Cue` types) → `backend/app/main.py` (FastAPI routes) → `store.py` / `worker.py`.

- **Persistence (`store.py`)**: projects, jobs and settings are stored as whole JSON blobs in SQLite (`data/studio.sqlite`, WAL); scenes live inside the project body. Media goes under `data/projects/<id>/` with UUID filenames; `asset_path()` confines paths to the data root. `SHORT_STUDIO_DATA` overrides the root (resolved at import time; tests monkeypatch `store.DATA`). On startup, `queued`/`running` jobs are marked `interrupted` and never auto-retried (avoids double-billing Gemini).
- **Jobs (`worker.py`)**: one `ThreadPoolExecutor(max_workers=1)` — exactly one AI/render job at a time across the app. `enqueue` rejects a second job per project; `main.mutable()` rejects project/scene edits while that project has a pending job, and settings are locked while any job runs. Actions (`models.JobRequest`): `plan`, `image`, `tts`, `align`, `render`, `export`, `youtube`. Jobs only update persisted assets on success; failed jobs leave prior files intact and can be retried via `/api/jobs/{id}/retry`.
- **Providers (`providers.py`)**: Gemini via `google-genai` Interactions API (speech in `text`, direction in `annotations: [{type: "speech_metadata", style}]`, voice in `generation_config.speech_config`, no automatic API retry). Local models run through `run()` as short-lived subprocesses that exit after each job to free RAM/VRAM. Errors meant for the user are raised as `WorkflowError` (→ HTTP 409).
- **Rendering (`render.py`)**: builds ASS (burned-in Thai subtitles using `backend/assets/fonts/NotoSansThai-Regular.ttf`) and SRT, runs FFmpeg (motion, fade-through-black, music, headline), and validates output with ffprobe.
- **Models (`models.py`)**: strict Pydantic request models (`extra` forbidden), `VOICES` and `TTS_MODEL` constants.
- **Demo (`demo.py`)**: seeds labelled non-AI sample artwork on first run; disabled with `SHORT_STUDIO_SEED=0`.

### Invariants to preserve

- Scene duration and subtitle timing derive from the **generated/imported narration audio**, never from the source media. Scenes may not be shorter than their audio; cues must not overlap or exceed the scene (`render.validate_cues`).
- After audio is set, the default caption is a single `whole_scene` cue (`worker.set_audio`), not word alignment. Whisper (`align`) timings refer to the new voice audio.
- Changing narration/voice/style invalidates the active audio, cues, timing and rendered outputs (`worker.invalidate`, bumps `revision`); original files are kept. Never fabricate placeholder audio/timings or mark a failed AI job as successful.
- A JSON snapshot is written to the project directory before `plan` replaces the storyboard.
- Security: bind only to 127.0.0.1; keep `TrustedHostMiddleware`, the Origin/`sec-fetch-site` checks, and the per-process `x-studio-token` required on non-GET `/api/` requests (token comes from `/api/bootstrap`, held in memory by the frontend). `GEMINI_API_KEY` lives only in the backend `.env` — never prefix secrets with `VITE_` or return them from the API.
- MVP limits: ≤12 scenes, ≤180 s audio per scene, source ≤30 min / 250 MB, generation source text ≤7,000 chars.

## Frontend notes

- `frontend/src/components/ui/` are official shadcn/ui components (Radix via the `radix-ui` package); add new ones via the shadcn registry rather than hand-writing them. Tailwind v4 via `@tailwindcss/vite`; `@` aliases `frontend/src`.
- Icon-only buttons need `aria-label`/`title` (the mobile Playwright test checks accessible names).
