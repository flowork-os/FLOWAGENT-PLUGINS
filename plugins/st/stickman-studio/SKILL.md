---
name: stickman-studio
description: Sovereign AI-driven audio and video to 2D dynamic stickman animation generator featuring ~3s micro-beat parody director, AutoShorts bridge, dual-view keyframe inspection, and split-screen PIP 9:16 vertical short rendering.
keywords:
  - stickman
  - animation
  - autoshorts-bridge
  - split-pip
  - micro-beats
  - cognitive-director
  - parody-generator
  - keyframe-extractor
  - faster-whisper
  - voice-modulation
  - 2d-rigging
  - opencv-composite
  - ffmpeg-exporter
  - word-timestamps
  - viral-shorts
  - kinetic-subtitles
  - procedural-kinematics
  - audio-envelope
  - multi-part-storyboard
  - sovereign-canvas
---

# Stickman Studio — Sovereign 2D Parody Short Generator

## Architecture & Pipeline Overview
Stickman Studio converts audio tracks and viral video moments into viral 2D animated stickman parodies through a synchronized multimodal pipeline:

1. **AutoShorts Bridge & Ingestion**:
   - Ingests MP4 video moments directly from AutoShorts Studio (`auto-shorts`) or via drag-and-drop.
   - Extracts 16kHz mono audio and faster-whisper word-level timestamps.

2. **~3-Second Micro-Beat & Keyframe Slicing (`video_beats_extractor.py`)**:
   - Slices input video into high-retention micro-beats (~3.0s each).
   - Captures high-clarity keyframe snapshots (`keyframes/beat_XXX.jpg`) for visual inspection.

3. **Multimodal Cognitive Director (`cognitive_director.py`)**:
   - Reads both spoken dialogue context and emotional tone.
   - Assigns character poses (`talk`, `point`, `think`, `celebrate`, `run`, `surprised`), props (`bulb`, `chart_up`, `alert`, `fire`), and camera shakes.
   - Formulates punchy, exaggerated stickman parody choreographies preserving the original moment's soul.

4. **Dual-Mode Video Rendering (`video_render_worker.py`)**:
   - **Split-Screen PIP (`split_pip`)**: Top half (720x640) displays the real video clip; Bottom half (720x640) displays the synchronized Stickman parody recreation with clean neon separator.
   - **Full Stickman (`full_stickman`)**: 100% 720x1280 procedural 2D stickman animation short.
   - Custom destination folder export (`📁 Save to...`).

5. **REST & Headless Endpoints (`18040`)**:
   - `GET /api/health`: System health and status.
   - `GET /api/bridge/autoshorts`: Discovers latest clips from AutoShorts Studio.
   - `GET /api/pick-folder`: Native OS directory chooser.
   - `POST /api/beats/slice`: Micro-beat partitioning & cognitive director analysis.
   - `POST /api/render/video`: Asynchronous dual-mode video render job dispatch.
   - `GET /api/jobs/:id` & `GET /api/jobs/stream`: SSE / Polling progress HUD.
