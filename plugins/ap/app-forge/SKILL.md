---
name: app-forge
description: Autonomous Micro-App Scaffolder and Visual Studio for Flowork OS Canvas. Generates 100% compliant plug-and-play apps with Serde manifest, Bun microservice, dynamic port IPC, and automated TDD smoke tests.
keywords:
  - "app_forge"
  - "micro_app"
  - "scaffolding"
  - "appstore"
  - "manifest_generator"
  - "serde_contract"
  - "zero_hardcode"
  - "multi_os"
  - "plug_and_play"
  - "tdd_generator"
  - "smoke_test"
  - "flowork_os"
  - "canvas_ui"
  - "ipc_port"
  - "bun_runtime"
  - "code_generator"
  - "developer_tools"
  - "sovereign_apps"
  - "automation"
  - "gatekeeper_verified"
---

# Sovereign App Forge

## Purpose
Sovereign App Forge provides an autonomous micro-app generator and visual scaffolding workbench for Flowork OS. It guarantees that any new micro-app created in `apps/` strictly complies with Flowork OS architecture contracts:
1. Manifest `entry` is an object with `{ "gui": "gui/index.html", "backend": "server.js" }` preventing Rust Serde deserialization crashes in `x-flow`.
2. Port allocation uses dynamic IPC environment variable (`FLOWORK_APP_PORT`).
3. Paths are strictly relative with zero hardcoding.
4. Generates automated TDD smoke tests verifying manifest and syntax.
5. Generates `SKILL.md` with exactly 20 keywords and `trigger.md`.

## Integration
- Can be invoked via GUI workbench at `http://127.0.0.1:18015` or through canvas app frames.
- Exposes REST API endpoint `POST /api/forge` for programmatic subagent generation.
