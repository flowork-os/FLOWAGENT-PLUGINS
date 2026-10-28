---
trigger_id: "PLUGIN-MIDI-EXTRACTOR-TRIGGER"
name: "Audio-to-MIDI Neural Studio Ambient Trigger"
scopes:
  - "universal_all"
events:
  - "audio_to_midi"
  - "pitch_extraction"
  - "music_transcription"
categories:
  - "CAT-016"
keywords:
  - "audio_to_midi"
  - "extract_midi"
  - "basic_pitch"
  - "midi_transcription"
  - "audio_transcription"
  - "pitch_detection"
  - "piano_roll"
  - "polyphonic_midi"
exclude_keywords:
  - "midi_to_audio_render"
conditions:
  - key: "env.is_headless"
    op: "=="
    val: false
---

# Audio-to-MIDI Neural Studio Ambient Activation Trigger
<!-- Co-authored-by: Flowork OS <agent@floworkos.com> -->

This trigger manages the ambient recommendation and automated mounting of the Sovereign Audio-to-MIDI Neural Studio Canvas plugin when user requests audio transcription, stem-to-MIDI conversion, melody/chord extraction, or music production synthesis workflows.
