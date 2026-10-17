---
id: studio
name: LUFS Meter Pro Studio Runbook
category: CAT-016
version: 1.0.0
keywords:
  - lufs
  - meter
  - loudness
  - ebur128
  - mastering
  - truepeak
  - audio
  - broadcast
  - sound
  - normalizer
  - streaming
  - dsp
  - ffmpeg
  - dynamics
  - mixing
  - headroom
  - stem
  - analyzer
  - decibel
  - studio
---

# 🎛️ LUFS Meter Pro Studio Runbook

## Overview
LUFS Meter Pro Studio provides broadcast-standard audio metering, EBU R128 loudness normalization, True Peak detection, and dynamic range inspection for audio mastering across streaming platforms (Spotify, Apple Music, YouTube, Tidal, and European/US Broadcast).

## Reason Dispatch Table
| Trigger Keyword | Action Category | Target Routine |
| :--- | :--- | :--- |
| loudness, lufs, ebur128 | Loudness Analysis | `POST /api/analyze` |
| status, health, engine | Health Check | `GET /api/status` |
| events, telemetry, stream | Live Telemetry | `GET /api/events` |
| prompt, dispatch, agent | Agent Co-Creation | `POST /api/prompt-dispatch` |

## Operational Guidelines
1. Serve user interface via `gui/index.html` within Flowork Canvas iframe.
2. Bind microservice backend dynamically on `process.env.FLOWORK_APP_PORT || 18980`.
3. Process files through FFmpeg `ebur128` filter or internal Web Audio DSP engine.
4. Support drag-and-drop file ingestion and direct playback preview.
