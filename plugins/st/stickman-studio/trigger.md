---
app_id: stickman-studio
trigger_type: canvas_interaction
description: Triggers autonomous 2D stickman parody short generation, ~3s micro-beat slicing, AutoShorts bridge ingestion, and dual split-screen PIP video rendering.
---

# Stickman Studio Trigger

## Activation Patterns
- **Manual Launch**: User opens Stickman Studio via Flowork Cockpit application grid or App Store tile.
- **AutoShorts Pipeline Integration**: Triggered automatically after AutoShorts Studio selects a high-energy viral clip moment.
- **REST Signal**: Direct headless execution via `POST http://127.0.0.1:18040/api/render/video`:
  ```json
  {
    "video_path": "/path/to/clip.mp4",
    "render_mode": "split_pip",
    "destination_dir": "/path/to/downloads",
    "fps": 30
  }
  ```
- **Micro-Beat Directing**: `POST http://127.0.0.1:18040/api/beats/slice` with `{ "media_path": "...", "target_seconds": 3.0 }`.
