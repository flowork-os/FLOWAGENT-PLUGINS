---
name: "kamidi-mastering"
description: "Professional Audio Mastering DSP console with Parametric EQ, Multiband Compressor, Brickwall Limiter, and EBU R128 LUFS Metering."
version: "1.0.0"
author: "Azam"
category: "Media & Audio Production"
keywords:
  - "audio mastering"
  - "mastering console"
  - "parametric eq"
  - "multiband compressor"
  - "brickwall limiter"
  - "lufs metering"
  - "true peak"
  - "dynamic eq"
  - "sub bass 808"
  - "transient shaper"
  - "audio processing"
  - "ebu r128"
  - "dsp engine"
  - "sound engineering"
  - "studio master"
  - "wav export"
  - "music production"
  - "audio limiter"
  - "audio clipper"
  - "mastering presets"
---

# 🎛️ Kamidi Mastering Console Pro - Standard Operating Procedure

## 1. Overview & Capabilities
Kamidi Mastering Console Pro is an integrated Web Audio DSP mastering workstation embedded directly into Flowork OS Canvas UI. It provides hardware-grade mastering processing chains:
- **Noise Reduction**: Spectral downward expander with threshold and attenuation.
- **Transient Shaper**: Dual-envelope attack and sustain envelope sculpting.
- **5-Band Parametric EQ**: High-Pass Filter, Low Shelf, Mid Peaking (Variable Q), High Shelf.
- **4-Band Dynamic EQ**: Frequency-selective compression across Sub, Mud, Presence, and Air zones.
- **Master Bus Compressor**: Classic VCA master glue with variable knee, attack, and release.
- **3-Band Multiband Compressor**: Crossover split at 250Hz and 4000Hz with stereo width control.
- **Hard Clipper & Brickwall Limiter**: Precision peak control and inter-sample overshoot prevention.
- **808 Sub-Bass Exciter**: Harmonic saturation and sub-harmonic generation for modern low-end weight.
- **EBU R128 LUFS Metering**: Integrated LUFS, Short-Term, Momentary, and True Peak analysis.

## 2. Built-in Preset Roster
The console includes 23 calibrated mastering presets:
1. `default`: Flat reference starting state.
2. `acoustic`: Warm, dynamic mastering for folk, acoustic guitar, and organic vocals.
3. `hiphop`: Punchy 808s, tight dynamic control, and scooped mud zone.
4. `pop`: Polished high-end sheen, controlled dynamics, and upfront vocal focus.
5. `rock`: Aggressive midrange bite, driving parallel compression, and analog glue.
6. `edm`: High loudness density, controlled sub, and extreme limiter protection.
7. `clean_transparent`: Minimum phase shift and zero coloration for classical and jazz.
8. `warm_analog`: Gentle tube/tape-style harmonic warmth and soft knee compression.
9. `radio_ready`: Punchy broadcast loudness optimized for commercial airplay.
10. `streaming_master`: Calibrated specifically for -14 LUFS Spotify, Apple Music, and YouTube target.
11. `club_banger`: Deep resonant sub bass, aggressive clipping, and maximum energy.
12. `vocal_presence`: Forward vocal lift at 3kHz with de-essing dynamic control at 7kHz.
13. `bass_boost`: Enhanced low-end rumble below 80Hz.
14. `treble_air`: Silky air band boost above 10kHz.
15. `heavy_limiter`: Brickwall limiter pushed for maximum competitive volume.
16. `gentle_master`: Minimal 1-2dB dynamic reduction preserving full natural dynamics.
17. `vintage_tape`: High frequency rolloff and warm saturation mimicking magnetic tape.
18. `modern_punch`: Fast transient attack enhancement on kick and snare hits.
19. `cinema_score`: Wide dynamic range (LRA > 12) for orchestral soundtrack scoring.
20. `podcast_voice`: Speech intelligibility, steep HPF cut at 80Hz, and voice clarity EQ.
21. `lofi_chill`: Softened transients, rolled-off highs, and cozy saturation.
22. `metal_crush`: Blazing fast limiter recovery, scoop at 500Hz, and razor treble definition.
23. `ambient_space`: Wide stereo imaging, subtle low warmth, and delicate high dynamics.

## 3. Operating Procedure & Lifecycle
1. **Launch Engine**:
   - Canvas UI dynamically connects via `http://127.0.0.1:17860`.
2. **Audio Track Ingestion**:
   - Use `Load Track` button or drag-and-drop any WAV, MP3, FLAC, or OGG file.
3. **Preset Selection & Sculpting**:
   - Pick any built-in preset from the preset selector or manually dial faders.
4. **Real-time Audition**:
   - Toggle A/B bypass to compare original versus mastered sound.
5. **Offline Master WAV Export**:
   - Click `Export Audio` to execute 32-bit float offline render and download studio-ready 24-bit/16-bit PCM WAV.
