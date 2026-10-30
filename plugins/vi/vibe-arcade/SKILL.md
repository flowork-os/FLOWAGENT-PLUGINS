---
name: vibe-arcade
description: Curated AI Vibe-Coded Game Launcher and Sandboxed Player for Claude Opus 5.5, Sonnet 5.5, GPT-6 Astra, and Offline Standalone Games.
keywords:
  - vibe_arcade
  - game_launcher
  - opus_games
  - astra_games
  - sonnet_games
  - sandboxed_player
  - offline_games
  - browser_games
  - threejs_games
  - webgl_arcade
  - canvas_games
  - interactive_catalog
  - retro_gaming
  - game_curation
  - fullscreen_runner
  - vibe_coding
  - grokgames_database
  - arcade_hub
  - responsive_gamepad
  - sovereign_gaming
---

# Flowork Vibe Arcade

Sovereign AI Vibe-Coded Game Launcher and Sandboxed Player Suite.

## Overview
Flowork Vibe Arcade organizes, inspects, launches, and runs 270+ AI-generated browser games created with frontier models (Claude Opus 5.5, Claude Sonnet 5.5, GPT-6 Astra). It provides:
1. Interactive gallery and searchable database (`grokgames.json`).
2. Sandboxed iframe game player with full-screen toggle, FPS telemetry, and keyboard instructions.
3. Offline standalone game bundle with single-file HTML titles ready for zero-latency, internet-free gaming.
4. Model filters, visual quality scoring (1-10), and local favorites persistency.

## REST API Specification
- `GET /api/status`: Service health check.
- `GET /api/games`: Filterable list of games (`?query=...&model=...&category=...&offline=1`).
- `GET /api/games/:id`: Detailed game metadata and launch URLs.
- `GET /api/offline/list`: List of bundled offline playable titles.
- `POST /api/favorites`: Add or remove game from favorites.
- `GET /api/favorites`: List bookmarked favorite IDs.
