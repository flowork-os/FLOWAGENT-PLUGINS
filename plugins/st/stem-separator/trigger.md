---
trigger_id: "PLUGIN-STEM-SEPARATOR-TRIGGER"
name: "Vocal & Stem Demixer Studio Ambient Trigger"
scopes:
  - "universal_all"
events:
  - "vocal_separation"
  - "stem_extraction"
  - "karaoke_creation"
categories:
  - "CAT-016"
keywords:
  - "stem_separator"
  - "vocal_remover"
  - "demucs"
  - "acapella"
  - "karaoke"
  - "isolate_vocals"
  - "remove_vocals"
  - "extract_stems"
exclude_keywords:
  - "text_to_speech"
conditions:
  - key: "env.is_headless"
    op: "=="
    val: false
---

# Vocal & Stem Demixer Studio Ambient Activation Trigger
<!-- Co-authored-by: Flowork OS <agent@floworkos.com> -->

This trigger manages the ambient recommendation and automated mounting of the Sovereign Vocal & Stem Demixer Studio Canvas plugin when user requests vocal removal, acapella extraction, karaoke backing track generation, drum/bass isolation, or multi-stem audio demixing workflows.
