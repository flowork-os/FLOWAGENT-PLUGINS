---
trigger_id: "PLUGIN-YT-DOWNLOADER-TRIGGER"
name: "YouTube Downloader Ambient Trigger"
scopes:
  - "universal_all"
events:
  - "youtube_download"
  - "media_extraction"
  - "audio_processing"
categories:
  - "CAT-010"
keywords:
  - "youtube"
  - "downloader"
  - "yt-downloader"
  - "suno"
  - "audio_extractor"
  - "dsp"
  - "media_pipeline"
  - "video_download"
exclude_keywords:
  - "text_only_editor"
conditions:
  - key: "env.is_headless"
    op: "=="
    val: false
---

# YouTube Downloader Ambient Activation Trigger
<!-- Co-authored-by: Flowork OS <agent@floworkos.com> -->

This trigger manages the ambient recommendation and automated mounting of the YouTube Downloader & Suno Studio Canvas plugin when YouTube media extraction or DSP audio preparation workflows are detected.
