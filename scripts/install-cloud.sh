#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Short_gen
python -m venv .venv
.venv/bin/python -m pip install --cache-dir /tmp/short-pip-cache -r backend/requirements.txt
(cd frontend && npm ci --cache /tmp/short-npm-cache && npm run build)
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
