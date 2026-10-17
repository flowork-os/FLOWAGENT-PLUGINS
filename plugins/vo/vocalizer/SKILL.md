---
name: vocalizer_plugin_workbench
title: Vocalizer Pro Canvas Plugin & DSP Architecture Runbook
description: Authoritative technical specification and operational runbook for the Vocalizer Pro plugin, covering Web Audio API real-time pitch correction, 4-voice polyphonic harmonization, 6-band parametric EQ, dynamics, delay, reverb, REST endpoints, and IPC.
author: "floworkos.com"
version: "1.0.0"
keywords:
  - vocalizer
  - autotune
  - pitch_correction
  - harmonizer
  - parametric_eq
  - noise_gate
  - de_esser
  - audio_compressor
  - vocal_saturation
  - delay_dsp
  - convolution_reverb
  - web_audio_api
  - audio_worklet
  - dynamic_port
  - rest_api
  - canvas_plugin
  - real_time_dsp
  - fft_spectrum
  - multi_voice_harmony
  - audio_mixing
exclude_keywords:
  - chess_engine
  - crypto_wallet
  - video_timeline
---

# 🎙️ Vocalizer Pro Canvas Plugin (`vocalizer`)

> **PLATFORM**: Flowork OS Sovereign Canvas Plugin Subsystem  
> **CATEGORY**: Arts, Music & Literature (`CAT-016`) / Software Engineering (`CAT-005`)  
> **BINARY PARITY**: Exact reproduction of parameters, DSP logic, and visual layout extracted from `Vocalizer.vst3`  
> **CO-AUTHORED-BY**: Flowork OS <agent@floworkos.com>

---

## 1. Architectural Overview & Signal Flow

Vocalizer Pro implements a professional-grade 11-stage vocal DSP chain modeled after physical hardware and the reverse-engineered VST3 binary:

```
[Audio In / Mic / Audio File]
       │
       ▼
 [Stage 1: Noise Gate] (gate_thr: -80dB .. 0dB)
       │
       ▼
 [Stage 2: De-Esser] (ds_amt: 0% .. 100%, 6.5kHz detector & dynamic notch)
       │
       ▼
 [Stage 3: Pitch Tracker & Autotune] (tune_on, tune_key, tune_scale, tune_speed, tune_tol, tune_human)
       ├───► [Stage 4: 4-Voice Polyphonic Harmonizer] (harm 1..4: interval, level, pan, variation, DI mute)
       │           │
       ▼           ▼
   [Summing Mixer / DI Routing]
       │
       ▼
 [Stage 5: 6-Band Parametric EQ] (HPF, Low Shelf, Band 1 Peak, Band 2 Peak, High Shelf, LPF)
       │
       ▼
 [Stage 6: Optical/VCA Vocal Compressor] (comp_thr, comp_ratio, comp_att, comp_rel, comp_gain)
       │
       ▼
 [Stage 7: Analog Saturation & Drive] (sat_mode: Tape/Tube/Digital, sat_drive, sat_mix)
       │
       ▼
 [Stage 8: Vocal Doubler / Stereo Spreader] (dbl_amt, dbl_time)
       │
       ▼
 [Stage 9: Modulation Matrix] (mod_mode: Off/Chorus/Flanger/Phaser, mod_rate, mod_mix)
       │
       ▼
 [Stage 10: Ducking Ping-Pong Delay] (dly_time, dly_fb, dly_mix, dly_duck)
       │
       ▼
 [Stage 11: Algorithmic & Convolution Reverb] (rev_mode: Hall/Plate/Ambience, rev_mix, rev_duck)
       │
       ▼
 [Master Output Gain & Limiter] (out_gain: -24dB .. +24dB)
       │
       ▼
 [DAC / Audio Destination] & [Real-Time FFT Analyser Visualizer]
```

---

## 2. Parameter Map & VST3 Identity

All 42 core parameters extracted from the target VST3 binary:

| Parameter ID | Display Label | Range | Default | Unit | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `tune_on` | Tune Power | 0 / 1 | 1 | toggle | Autotune active state |
| `tune_key` | Tune Root Key | 0 .. 11 | 0 | note | C, C#, D, D#, E, F, F#, G, G#, A, A#, B |
| `tune_scale`| Scale Type | 0 .. 2 | 1 | enum | Chromatic (0), Major (1), Minor (2) |
| `tune_speed`| Tune Speed | 0 .. 100 | 25 | ms | Transition speed to targeted pitch |
| `tune_tol`  | Pitch Tolerance| 0 .. 50 | 10 | cents | Target pitch deadband tolerance |
| `tune_human`| Humanize | 0 .. 100 | 20 | % | Vibrato preservation factor |
| `harm_1_int`| Harm 1 Interval| -12 .. +12| 0 | semitones| -Oct .. +Oct interval (-12 to +12) |
| `harm_1_lvl`| Harm 1 Level | -48 .. +6 | -6 | dB | Harmony Voice 1 Gain |
| `harm_1_pan`| Harm 1 Pan | -1.0 .. 1.0| -0.4 | pan | Harmony Voice 1 Stereo Pan |
| `harm_2_int`| Harm 2 Interval| -12 .. +12| +4 | semitones| Harmony Voice 2 Interval (+3rd/+4th) |
| `harm_2_lvl`| Harm 2 Level | -48 .. +6 | -8 | dB | Harmony Voice 2 Gain |
| `harm_2_pan`| Harm 2 Pan | -1.0 .. 1.0| 0.4 | pan | Harmony Voice 2 Stereo Pan |
| `harm_var`  | Harmony Var | 0 .. 100 | 30 | % | Micro-pitch & timing humanization |
| `harm_dimute`| DI Mute | 0 / 1 | 0 | toggle | Mute direct dry vocal, keep harmony |
| `gate_thr`  | Gate Threshold | -80 .. 0 | -55 | dB | Noise gate threshold |
| `ds_amt`    | De-Esser Amount| 0 .. 100 | 35 | % | High frequency sibilance attenuation |
| `eq_hpf`    | EQ High-Pass | 20 .. 500 | 80 | Hz | Low cut filter frequency |
| `eq_ls_f`   | Low Shelf Freq | 40 .. 400 | 120 | Hz | Low shelf turnover frequency |
| `eq_ls_g`   | Low Shelf Gain | -18 .. +18 | +1.5 | dB | Low shelf boost/cut |
| `eq_b1_f`   | Band 1 Freq | 150 .. 4000| 450 | Hz | Parametric Mid Band 1 frequency |
| `eq_b1_g`   | Band 1 Gain | -18 .. +18 | -2.5 | dB | Mid boxiness reduction gain |
| `eq_b1_q`   | Band 1 Q | 0.2 .. 10 | 1.2 | Q | Mid Band 1 bandwidth |
| `eq_b2_f`   | Band 2 Freq | 1000 .. 12k| 3500 | Hz | Presence Band 2 frequency |
| `eq_b2_g`   | Band 2 Gain | -18 .. +18 | +3.0 | dB | Vocal presence boost gain |
| `eq_b2_q`   | Band 2 Q | 0.2 .. 10 | 1.0 | Q | Presence Band 2 bandwidth |
| `eq_hs_f`   | High Shelf Freq| 4000 .. 18k| 10000 | Hz | High air turnover frequency |
| `eq_hs_g`   | High Shelf Gain| -18 .. +18 | +2.0 | dB | Air boost gain |
| `eq_lpf`    | EQ Low-Pass | 5000 .. 22k| 20000 | Hz | High cut filter frequency |
| `comp_thr`  | Comp Threshold | -60 .. 0 | -18 | dB | Compression threshold |
| `comp_ratio`| Comp Ratio | 1.0 .. 20.0| 3.5 | :1 | Compression ratio |
| `comp_att`  | Comp Attack | 0.1 .. 100 | 15 | ms | Attack time |
| `comp_rel`  | Comp Release | 10 .. 1000 | 120 | ms | Release time |
| `comp_gain` | Comp Makeup | 0 .. 24 | +4.0 | dB | Makeup gain |
| `sat_mode`  | Saturation Mode| 0 .. 2 | 0 | enum | Tape (0), Tube (1), Digital (2) |
| `sat_drive` | Drive | 0 .. 100 | 25 | % | Harmonic saturation drive |
| `sat_mix`   | Saturation Mix | 0 .. 100 | 30 | % | Wet/Dry mix |
| `dbl_amt`   | Doubler Mix | 0 .. 100 | 20 | % | Stereo doubler spread |
| `mod_mode`  | Mod Type | 0 .. 3 | 1 | enum | Off (0), Chorus (1), Flanger (2), Phaser (3) |
| `mod_rate`  | Mod Rate | 0.1 .. 10 | 1.2 | Hz | LFO modulation rate |
| `mod_mix`   | Mod Mix | 0 .. 100 | 25 | % | Modulation wet/dry |
| `dly_time`  | Delay Time | 10 .. 1000 | 320 | ms | Echo delay time |
| `dly_fb`    | Delay Feedback | 0 .. 95 | 35 | % | Delay feedback level |
| `dly_mix`   | Delay Mix | 0 .. 100 | 20 | % | Delay wet/dry mix |
| `dly_duck`  | Delay Ducking | 0 .. 100 | 50 | % | Ducking level during singing |
| `rev_mode`  | Reverb Space | 0 .. 2 | 0 | enum | Hall (0), Plate (1), Ambience (2) |
| `rev_mix`   | Reverb Mix | 0 .. 100 | 25 | % | Reverb wet/dry mix |
| `rev_duck`  | Reverb Ducking | 0 .. 100 | 40 | % | Reverb ducking reduction |
| `out_gain`  | Output Master | -24 .. +24 | 0.0 | dB | Master output trim |

---

## 3. Microservice Backend & REST API Specifications

The plugin backend runs an HTTP microservice on `$FLOWORK_APP_PORT` (Default: `17840`).

### Endpoints:

#### 1. `GET /api/status`
Returns live state of the plugin backend.
**Response**:
```json
{
  "status": "online",
  "plugin": "vocalizer",
  "version": "1.0.0",
  "active_preset": "Modern Pop Lead",
  "params": { ... }
}
```

#### 2. `POST /api/params`
Updates one or more DSP parameters dynamically.
**Payload**:
```json
{
  "tune_key": 2,
  "tune_speed": 10,
  "eq_hs_g": 3.5
}
```

#### 3. `GET /api/events`
Server-Sent Events (SSE) stream broadcasting real-time parameter changes, preset activations, and peak VU levels.

#### 4. `POST /api/prompt-dispatch`
Bridge from Canvas UI to Flowork Agent. Dispatches high-level mixing commands (e.g., *"Set up an 80s synthwave vocal chain"*).
