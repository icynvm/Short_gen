# Validation — 2026-10-26

Validated in the Linux cloud workspace, not on the user's Windows/AMD computer.

| Check | Result |
|---|---|
| Locked Python install and `npm ci` | Passed; installation repeated successfully |
| TypeScript + Vite production build | Passed |
| Python launcher / backend restart | Passed on Linux; health and built frontend return HTTP 200 |
| Backend pytest | 10 passed |
| Chromium browser integration | 3 passed: desktop editing/persistence; mobile layout/settings; image + audio upload → captions → real MP4 download |
| Actual FFmpeg output | 1080×1920 H.264 video + AAC audio, two scenes, motion, fade-through-black, music, Thai ASS/SRT, cover image; duration verified with ffprobe |
| Gemini SDK payload | Verified with httpx MockTransport; current SDK serializes `gemini-3.8-flash-tts`, `speech_metadata`, voice, and `response_format` into Interactions API |
| Missing API key | Explicit failed job; old audio remains intact; retry path tested with a mocked TTS provider |
| Scene dependency invalidation | Changing narration clears active voice, cues, timing and render; original media retained |
| Persistence / interrupted jobs | SQLite round-trip and interruption recovery tested |
| Local API protection | Session header, Host/Origin validation, cross-site rejection and asset traversal tested |
| Gemini live audio / Thai pronunciation | NOT RUN — no GEMINI_API_KEY available |
| llama.cpp / stable-diffusion.cpp / whisper.cpp generation | NOT RUN — no runtime binaries/model weights configured |
| Windows folder picker / PowerShell scripts / AMD Vulkan | NOT RUN — target Windows hardware unavailable here |
| YouTube live download | NOT RUN — optional importer depends on network/link and local Whisper |

Audio in automated rendering tests is an explicitly synthetic test tone, not generated speech. These checks establish the media pipeline, not the quality of a TTS model. Screenshots and test export are stored under ignored `.local/screenshots/`.

A mobile test initially found icon-only navigation buttons without accessible names. Added explicit `aria-label`/`title` attributes and reran the browser suite successfully.

Non-failing warning: the installed Starlette test client reports an httpx deprecation; production requests and the current tests still pass.
