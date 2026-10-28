---
trigger_id: "PLUGIN-CONCAT-TRIGGER"
name: "Flow Studio Ambient Trigger"
scopes:
  - "universal_all"
events:
  - "video_editing"
  - "media_production"
categories:
  - "CAT-010"
keywords:
  - "video"
  - "editor"
  - "flow-studio"
  - "timeline"
  - "ffmpeg"
  - "render"
  - "multitrack"
  - "color_grading"
exclude_keywords:
  - "audio_only_recorder"
  - "still_photo_filter"
conditions:
  - key: "env.is_headless"
    op: "=="
    val: false
---

# Flow Studio Ambient Activation Trigger
<!-- Co-authored-by: Flowork OS <agent@floworkos.com> -->

This trigger manages the ambient recommendation and automated mounting of the Flow Studio Canvas plugin when video production or timeline editing workflows are detected.
