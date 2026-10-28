---
trigger_id: "PLUGIN-AUTO-SHORTS-TRIGGER"
name: "AutoShorts Studio Ambient Trigger"
scopes:
  - "universal_all"
events:
  - "short_form_video"
  - "video_cropping"
  - "viral_moment_detection"
  - "tiktok_reels_creation"
categories:
  - "CAT-010"
keywords:
  - "autoshorts"
  - "auto-shorts"
  - "shorts"
  - "reels"
  - "tiktok"
  - "viral_clips"
  - "video_crop"
  - "portrait_video"
  - "9:16"
  - "hook_detection"
exclude_keywords:
  - "text_only_editor"
conditions:
  - key: "env.is_headless"
    op: "=="
    val: false
---

# AutoShorts Studio Ambient Activation Trigger
<!-- Co-authored-by: Flowork OS <agent@floworkos.com> -->

This trigger manages the ambient recommendation and automated mounting of the AutoShorts Studio Canvas plugin when users request vertical video creation, AI viral moment ranking, 9:16 portrait video cropping, or automated subtitle burning from long-form video or audio recordings.
