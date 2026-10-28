---
skill_id: "SKILL-STEM-SEPARATOR"
name: "Sovereign Vocal & Stem Demixer Studio Runbook"
version: "1.0.0"
author: "Awenk Audico & Flowork OS"
keywords:
  - "stem_separation"
  - "vocal_remover"
  - "demucs"
  - "meta_ai"
  - "htdemucs"
  - "acapella_extraction"
  - "karaoke_maker"
  - "audio_demixing"
  - "source_separation"
  - "multitrack_mixer"
  - "drum_isolation"
  - "bass_extraction"
  - "cuda_acceleration"
  - "pytorch_inference"
  - "lossless_wav"
  - "mp3_export"
  - "zip_archiving"
  - "daw_workflow"
  - "ffmpeg_decoding"
  - "sovereign_audio_studio"
---

# 🎛️ VOCAL & STEM DEMIXER STUDIO — RUNBOOK & SKILL
**Sovereign AI Audio Source Separation & Vocal Remover Engine**  
**Flowork Sovereign OS (floworkos.com)**

---

## 1. Overview & Capabilities
- **Application ID**: `stem-separator`
- **Core Technology**: Meta AI Research **Demucs v4 (Hybrid Transformer HTDemucs)** running natively on PyTorch with CUDA GPU acceleration.
- **Hardware Acceleration**: Automatic GPU detection exploiting NVIDIA CUDA (e.g. RTX 4060) for near real-time demixing (~2-4s per track).
- **Separation Architectures**:
  1. **2 Stems (Karaoke / Vocal Remover)**: Isolates `vocals.wav` (Acapella) and `no_vocals.wav` (Instrumental Minus One).
  2. **4 Stems (Standard Band)**: Isolates `vocals.wav`, `drums.wav`, `bass.wav`, and `other.wav`.
  3. **6 Stems (Studio Multitrack)**: Isolates `vocals`, `drums`, `bass`, `other`, `guitar`, and `piano`.
- **Integrated Multitrack Mixer**: Web-based DAW mixer rack featuring simultaneous synchronized playback, Solo/Mute toggles, volume faders, and 1-click batch ZIP download.

---

## 2. Dynamic Port & Process Architecture
The application runs as a local Node.js microservice communicating with an isolated Python worker:
- **Port Environment**: `FLOWORK_APP_PORT`
- **Default Port**: `17880`
- **Health Verification**:
  ```bash
  curl -s http://127.0.0.1:<PORT>/health
  ```
  Expected output:
  ```json
  {
    "status": "ok",
    "app": "stem-separator",
    "name": "Sovereign Vocal & Stem Demixer Studio",
    "version": "1.0.0",
    "port": 17880,
    "engine": "Meta AI Demucs v4 (Hybrid Transformer)"
  }
  ```

---

## 3. REST API Specification

### A. Upload Audio File
Accepts raw binary stream with `x-filename` header or base64 JSON payload:
```bash
curl -s -X POST http://127.0.0.1:<PORT>/api/upload \
  -H "Content-Type: application/octet-stream" \
  -H "x-filename: song.mp3" \
  --data-binary "@/path/to/song.mp3"
```

Response JSON:
```json
{
  "success": true,
  "filePath": "/tmp/flowork_stem_separator/1793207753_song.mp3",
  "fileName": "1793207753_song.mp3",
  "originalName": "song.mp3",
  "size": 5420180
}
```

### B. Separate Audio Stems
Triggers Demucs v4 neural demixing:
```bash
curl -s -X POST http://127.0.0.1:<PORT>/api/separate \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "/tmp/flowork_stem_separator/1793207753_song.mp3",
    "mode": "four-stems",
    "format": "wav",
    "shifts": 1
  }'
```

Response JSON:
```json
{
  "success": true,
  "data": {
    "status": "success",
    "mode": "four-stems",
    "format": "wav",
    "device": "CUDA (NVIDIA GeForce RTX 4060)",
    "processing_time_seconds": 3.4,
    "stems_count": 4,
    "stems": {
      "vocals": { "filename": "vocals.wav", "downloadUrl": "/api/download/job_xxx/vocals.wav" },
      "drums": { "filename": "drums.wav", "downloadUrl": "/api/download/job_xxx/drums.wav" },
      "bass": { "filename": "bass.wav", "downloadUrl": "/api/download/job_xxx/bass.wav" },
      "other": { "filename": "other.wav", "downloadUrl": "/api/download/job_xxx/other.wav" }
    },
    "zipDownloadUrl": "/api/download/job_xxx/all_stems.zip"
  }
}
```

### C. Download Stems & ZIP Bundle
```bash
curl -O http://127.0.0.1:<PORT>/api/download/<jobId>/<stemOrZipFileName>
```

---

## 4. Human & Agent Collaboration Workflows
1. **Interactive User Workflow**:
   - User drops an MP3/WAV song onto the Canvas stage.
   - Selects separation mode (Karaoke 2-stems or 4/6 Stems).
   - Clicks **Separate Audio Stems**.
   - Inspects separated tracks on the multitrack mixer, using Solo/Mute to audition isolated vocals or backing tracks.
   - Clicks **Download All Stems (ZIP)** for instant DAW import.
2. **Autonomous Agent Workflow**:
   - Agent receives request: *"Remove vocals from song.mp3 to make karaoke"* or *"Extract drums and bass for sampling"*.
   - Agent uploads song to `/api/upload`.
   - Calls `/api/separate` with desired mode.
   - Provides separated stem paths or downloads directly to user workspace.
