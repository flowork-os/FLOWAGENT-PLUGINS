---
skill_id: "SKILL-AUTO-SHORTS"
name: "Sovereign AutoShorts Studio Runbook"
version: "1.0.0"
author: "Awenk Audico & Flowork OS"
keywords:
  - "auto_shorts"
  - "viral_clips"
  - "video_cropping"
  - "portrait_converter"
  - "tiktok_generator"
  - "reels_creator"
  - "youtube_shorts"
  - "speech_transcription"
  - "whisper_ai"
  - "hook_detection"
  - "moment_ranking"
  - "ffmpeg_rendering"
  - "dynamic_subtitles"
  - "caption_overlay"
  - "content_repurposing"
  - "video_automation"
  - "multimedia_pipeline"
  - "audio_extraction"
  - "sovereign_creator_studio"
  - "canvas_video_engine"
---

# ✂️ AUTOSHORTS STUDIO — RUNBOOK & SKILL
**Sovereign Long-Form to Vertical 9:16 Viral Short-Form Video Generator**  
**Flowork Sovereign OS (floworkos.com)**

---

## 1. Overview & Capabilities
- **Application ID**: `auto-shorts`
- **Category ID**: `CAT-010` (Media, Creative Writing & Journalism)
- **Core Engine**: Mathematical FFmpeg center-crop pipeline, faster-whisper local speech transcription, and LLM viral moment detector.
- **Aspect Ratio**: Automatic conversion from 16:9 landscape to 9:16 vertical portrait (`1080x1920`).
- **Viral Moment Ranking**: Scores transcript segments for hook potency, emotional peak, and shareability.
- **Subtitle Integration**: Generates word-level timestamps and burns high-contrast subtitle overlays directly into the rendered video.

---

## 2. Architecture & API Contracts
The backend runs on dynamic port `process.env.FLOWORK_APP_PORT || 17899`:
- `GET /api/status`: Inspects runtime availability of FFmpeg, FFprobe, Whisper, Ollama, and API keys.
- `GET /api/projects`: Lists existing projects and processing states.
- `POST /api/projects`: Initializes a new project from a video path or uploaded file.
- `POST /api/projects/:id/transcribe`: Extracts 16kHz mono audio and produces word-level transcripts.
- `POST /api/projects/:id/candidates`: Evaluates transcript with LLM to generate top viral clip candidates.
- `POST /api/candidates/:id/render`: Executes FFmpeg 9:16 crop filter and dynamic caption rendering.
- `GET /api/media/stream`: Streams preview video and rendered clips directly to Canvas UI.

---

## 3. Operational Best Practices
- **Local Sovereignty**: Uses `faster-whisper` and local Ollama (`llama3.2`, `qwen2.5`) for 100% offline, privacy-first processing.
- **Ecosystem Integration**: Directly ingest video assets downloaded via `yt-downloader` and send exported clips to `flow-studio` for timeline editing.
- **Fail-Safe Rendering**: If caption filters fail, automatically fallback to flat crop render without aborting the pipeline.
