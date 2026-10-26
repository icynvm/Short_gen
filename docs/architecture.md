# Implementation map

- `frontend/src/App.tsx`: Studio, source import, per-scene editor, local model settings, job history, export dialogs.
- `frontend/src/components/ui`: official shadcn/ui + Radix primitives.
- `frontend/src/lib/api.ts`: typed local HTTP client; session token stays in memory.
- `backend/app/main.py`: local API, media upload, folder picker, static production frontend.
- `backend/app/store.py`: SQLite projects/settings/jobs + media paths confined to data root.
- `backend/app/worker.py`: single queue, incremental commits, explicit retries, invalidation.
- `backend/app/providers.py`: Gemini Interactions adapter and subprocess adapters for local models.
- `backend/app/render.py`: audio-derived scene timing, subtitles, FFmpeg rendering/export validation.
- `backend/app/demo.py`: clearly marked non-AI sample artwork.
- `scripts`: repeatable setup, local service launcher, native Windows folder picker.

Scene edits are locked while that project's queued job runs. Settings are locked while any job runs. Worker updates only persisted assets on success; original files remain for recovery. Before AI planning replaces the storyboard, a JSON snapshot is saved in the project directory.

The initial subtitle spans the measured narration duration and is labelled `whole_scene`. Whisper timings refer to the newly generated/imported voice audio, not the input source audio. Users can edit start/end/text; invalid overlaps and bounds are rejected. A narration/voice/style change invalidates the active audio and all dependent outputs. No fake audio, fake timings, or successful placeholder AI jobs are generated.

The MVP exposes generation step by step, allowing review between models. It does not automatically download large model weights or promise that every Vulkan build/checkpoint combination works. One runtime process runs at a time and exits to release memory.
