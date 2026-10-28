---
name: flow-studio_video_studio
description: Authoritative runbook and SOP for operating the Flow Studio Canvas plugin, managing multi-track timeline sequences, audio-video assets, and FFmpeg export jobs.
author: "@awenkaudico"
version: "1.0.0"
keywords:
  - video_editor
  - nle_studio
  - timeline_sequencing
  - ffmpeg_export
  - multitrack_audio
  - video_rendering
  - canvas_plugin
  - media_transcoder
  - keyframe_animation
  - clip_trimming
  - transitions_filter
  - color_grading
  - audio_ducking
  - waveform_display
  - render_queue
  - dynamic_port
  - loopback_rest_api
  - real_time_sse
  - zero_zombie
  - sovereign_flowork
exclude_keywords:
  - analogue_tape
  - optical_disc
---

# 🎬 CONCAT VIDEO STUDIO (CANVAS PLUGIN)

> **AUTHORITY**: AWENK AUDICO & TEGUHFX (LEVEL 99 SUPER ADMIN).  
> **RUNTIME MODULE**: Flowork OS Canvas Plugin (`apps/flow-studio`).  
> **STANDARD**: 100% STRICT ENGLISH RUNBOOK, ZERO HARDCODED PATH, DYNAMIC PORT BINDING.

---

## 1. Overview & Capabilities
Flow Studio is a full-featured Non-Linear Video Editor (NLE) hosted inside the Flowork Canvas stage.
- **Multi-Track Timeline**: Independent video, audio, overlay, and text tracks.
- **DSP & Effects**: Color grading, audio normalization, speed ramping, and transitions.
- **FFmpeg Render Engine**: High-performance hardware-accelerated video export backend.
- **Dual-Actor Co-creation**: Real-time bidirectional control between User in Canvas GUI and Agent via REST IPC.

---

## 2. Dynamic Port & Process Discovery
The Concat backend microservice operates on dynamic port:
- **Default Port**: `18012`
- **Verify Status**:
  ```bash
  curl -s http://127.0.0.1:18012/api/health
  ```
- **Response**: `{"status":"ok","app":"flow-studio","port":18012}`

---

## 3. REST API & IPC Reference

### A. Health & State Probe
```bash
curl -s http://127.0.0.1:18012/api/health
curl -s http://127.0.0.1:18012/api/timeline
```

### B. Upload / Register Media Asset
```bash
curl -s -X POST http://127.0.0.1:18012/api/assets \
  -H "Content-Type: application/json" \
  -d '{"filename": "intro.mp4", "filepath": "apps/flow-studio/uploads/intro.mp4"}'
```

### C. Update Timeline Tracks
```bash
curl -s -X POST http://127.0.0.1:18012/api/timeline/update \
  -H "Content-Type: application/json" \
  -d '{"tracks": [{"id": "v1", "type": "video", "clips": []}], "duration": 60}'
```

### D. Trigger Render Export
```bash
curl -s -X POST http://127.0.0.1:18012/api/render \
  -H "Content-Type: application/json" \
  -d '{"output_name": "final_output.mp4", "resolution": "1920x1080", "fps": 30}'
```
