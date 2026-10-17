---
id: vocalizer
name: Vocalizer Pro
version: 1.0.0
category_id: CAT-016
scopes:
  - default_solo
  - canvas_active
conditions:
  app_mode:
    - vocalizer
    - audio_dsp
keywords:
  - vocalizer
  - autotune
  - pitch correction
  - vocal harmonizer
  - audio dsp
  - parametric eq
  - de-esser
  - noise gate
  - vocal compressor
  - audio plugin
exclude_keywords:
  - crypto wallet
  - stockfish
  - chess arena
---

# Dynamic Plugin Trigger: Vocalizer Pro (`vocalizer`)
<!-- Co-authored-by: Flowork OS <agent@floworkos.com> -->

## 1. Trigger Specification & Activation Lifecycle

When this plugin is opened in the Flowork Canvas UI or referenced in chat, this trigger is evaluated:
1. **Activation Scope**: `default_solo`, `canvas_active`.
2. **Primary Roles**: Audio DSP Engineering, Real-Time Pitch Tracking & Correction, Multi-Voice Harmonization, and Professional Vocal Mixing.
3. **Runbook Inspection Mandate**:
   Upon receiving dispatched events or interacting with the plugin backend, inspect `SKILL.md` via `view_file` to review operational schemas, REST endpoints, and Web Audio API parameters.

## 2. Real-Time Telemetry & IPC Ports

- **Target Backend Port**: `$FLOWORK_APP_PORT` (Default: `17840`).
- **REST Endpoints**:
  - `GET /api/status`: Returns current engine state, audio routing, and parameter map.
  - `POST /api/params`: Atomically updates DSP parameters (tune, eq, comp, harm, etc.).
  - `GET /api/events`: SSE stream for real-time bidirectional parameter and VU-meter telemetry.
  - `POST /api/prompt-dispatch`: Dispatches user actions or preset recommendations from Canvas to the active Flowork Agent.
