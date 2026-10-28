---
skill_id: "SKILL-MIDI-EXTRACTOR"
name: "Sovereign Audio-to-MIDI Neural Studio Runbook"
version: "1.0.0"
author: "Awenk Audico & Flowork OS"
keywords:
  - "audio_to_midi"
  - "midi_extractor"
  - "basic_pitch"
  - "spotify_intelligence"
  - "onnx_inference"
  - "polyphonic_transcription"
  - "pitch_detection"
  - "pitch_bends"
  - "piano_roll"
  - "note_events"
  - "music_information_retrieval"
  - "audio_dsp"
  - "stem_transcription"
  - "chord_recognition"
  - "melody_extraction"
  - "pretty_midi"
  - "webaudio_playback"
  - "daw_integration"
  - "ffmpeg_decoding"
  - "sovereign_audio_studio"
---

# 🎹 AUDIO-TO-MIDI NEURAL STUDIO — RUNBOOK & SKILL
**Sovereign High-Fidelity Polyphonic Audio-to-MIDI Neural Transcription Engine**  
**Flowork Sovereign OS (floworkos.com)**

---

## 1. Overview & Capabilities
- **Application ID**: `midi-extractor`
- **Core Technology**: Standalone ONNX runtime deployment of Spotify's state-of-the-art **Basic Pitch** neural network (`nmp.onnx`).
- **Input Compatibility**: Decodes all audio containers supported by FFmpeg (MP3, WAV, FLAC, OGG, M4A, AAC, OPUS, WMA) to 22,050 Hz 32-bit floating-point mono signal via zero-copy pipe.
- **Microtonal Pitch Bend Extraction**: Computes sub-semitone pitch variations across note contours, exported directly to standard MIDI pitch-wheel events.
- **Interactive Piano Roll Canvas**: 88-key graphical visualizer (C1 to C8) with pitch-to-octave neon mapping, velocity depth, zoom/pan navigation, note hover telemetry, and built-in WebAudio polyphonic synthesizer preview.
- **Universal DAW Export**: Exports Type 1 Standard MIDI files (`.mid`) directly compatible with FL Studio, Ableton Live, Logic Pro, Cubase, Reaper, and Bitwig Studio.

---

## 2. Dynamic Port & Process Architecture
The application runs as a high-speed local Node.js microservice communicating with an optimized Python ONNX worker:
- **Port Environment**: `FLOWORK_APP_PORT`
- **Default Port**: `17870`
- **Health Verification**:
  ```bash
  curl -s http://127.0.0.1:<PORT>/health
  ```
  Expected output:
  ```json
  {
    "status": "ok",
    "app": "midi-extractor",
    "name": "Sovereign Audio-to-MIDI Neural Studio",
    "version": "1.0.0",
    "port": 17870,
    "modelReady": true
  }
  ```

---

## 3. REST API Specification

### A. Upload Audio File
Accepts raw binary stream with `x-filename` header or base64 JSON payload:
```bash
curl -s -X POST http://127.0.0.1:<PORT>/api/upload \
  -H "Content-Type: application/octet-stream" \
  -H "x-filename: solo_guitar.wav" \
  --data-binary "@/path/to/solo_guitar.wav"
```

Response JSON:
```json
{
  "success": true,
  "filePath": "/tmp/flowork_midi_extractor/1793206415_solo_guitar.wav",
  "fileName": "1793206415_solo_guitar.wav",
  "originalName": "solo_guitar.wav",
  "size": 1548290
}
```

### B. Transcribe to MIDI
Triggers ONNX neural inference and note decoding:
```bash
curl -s -X POST http://127.0.0.1:<PORT>/api/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "/tmp/flowork_midi_extractor/1793206415_solo_guitar.wav",
    "onsetThreshold": 0.5,
    "frameThreshold": 0.3,
    "minNoteLengthMs": 128,
    "tempo": 120.0,
    "includePitchBends": true
  }'
```

Response JSON:
```json
{
  "success": true,
  "data": {
    "status": "success",
    "audio_duration_seconds": 14.5,
    "note_count": 86,
    "processing_time_seconds": 0.42,
    "downloadUrl": "/api/download/solo_guitar_1793206415.mid",
    "midiFileName": "solo_guitar_1793206415.mid",
    "notes": [
      {
        "start": 0.12,
        "end": 0.85,
        "duration": 0.73,
        "pitch": 60,
        "velocity": 85,
        "amplitude": 0.67,
        "bends": [0, 1, 1, 0]
      }
    ]
  }
}
```

### C. Download MIDI File
```bash
curl -O http://127.0.0.1:<PORT>/api/download/<midiFileName>
```

---

## 4. Human & Agent Collaboration Workflows
1. **Interactive User Workflow**:
   - User drags and drops audio into the Obsidian Canvas stage.
   - Selects a specialized preset (Polyphonic, Vocal, Fast Piano, or Bassline).
   - Clicks **Transcribe to MIDI**.
   - Inspects transcribed notes on the interactive Piano Roll.
   - Clicks **Play** to verify audition preview via browser WebAudio synth.
   - Clicks **Export MIDI (.mid)** to load into DAW.
2. **Autonomous Agent Workflow**:
   - Agent receives request: *"Extract MIDI from guitar_track.mp3 and find key chords"*.
   - Agent uploads audio to engine endpoint.
   - Calls `/api/transcribe`.
   - Inspects JSON note events to analyze harmonic chord progressions and pitch ranges.
   - Delivers completed `.mid` file path to user.
