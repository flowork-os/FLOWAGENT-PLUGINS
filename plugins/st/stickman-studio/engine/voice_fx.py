#!/usr/bin/env python3
# [FL_INDEX: keywords="audio_dsp, voice_transformer, formant_shift, pitch_shift, ffmpeg" | purpose="Voice alteration engine with Kids, Cartoon, Chipmunk, Robot and Deep Narrator presets"]

import sys
import os
import subprocess
import json

PRESETS = {
    "kids": {
        "description": "Kids voice with raised pitch & shifted formant",
        "filter": "asetrate=44100*1.32,aresample=44100,atempo=0.82,equalizer=f=3000:t=q:w=1.5:g=3,equalizer=f=200:t=q:w=1:g=-6"
    },
    "cartoon": {
        "description": "Exaggerated squeaky cartoon voice",
        "filter": "asetrate=44100*1.55,aresample=44100,atempo=0.72,equalizer=f=2500:t=q:w=2:g=5,flanger=delay=1.5:depth=2:regen=0"
    },
    "chipmunk": {
        "description": "Ultra high-speed high-pitch chipmunk effect",
        "filter": "asetrate=44100*1.75,aresample=44100,atempo=0.68,highpass=f=200"
    },
    "robot": {
        "description": "Metallic robotic ring-modulated voice",
        "filter": "flanger=delay=0:depth=10:regen=20:width=80:speed=10,tremolo=f=35:d=0.7"
    },
    "deep_boss": {
        "description": "Authoritative deep resonant voice (Titan Boss)",
        "filter": "asetrate=44100*0.82,aresample=44100,atempo=1.22,bass=g=6:f=120"
    },
    "deep_narrator": {
        "description": "Authoritative deep resonant voice",
        "filter": "asetrate=44100*0.82,aresample=44100,atempo=1.22,bass=g=6:f=120"
    },
    "original": {
        "description": "Clean unprocessed passthrough",
        "filter": "anull"
    }
}

def build_tempo_filter_chain(tempo_factor):
    t = float(tempo_factor)
    filters = []
    while t > 2.0:
        filters.append("atempo=2.0")
        t /= 2.0
    while t < 0.5:
        filters.append("atempo=0.5")
        t /= 0.5
    filters.append(f"atempo={t:.4f}")
    return ",".join(filters)

def transform_voice(input_path, output_path, preset_name="kids", custom_pitch=None, custom_speed=None):
    if preset_name not in PRESETS:
        preset_name = "kids"
    
    preset = PRESETS[preset_name]
    filter_chain = preset["filter"]

    # Apply custom pitch and speed overrides if specified
    if custom_pitch is not None or custom_speed is not None:
        try:
            default_pitches = {
                "kids": 1.32,
                "cartoon": 1.55,
                "chipmunk": 1.75,
                "robot": 0.95,
                "deep_boss": 0.82,
                "deep_narrator": 0.82,
                "original": 1.0
            }
            p = float(custom_pitch) if custom_pitch is not None else default_pitches.get(preset_name, 1.0)
            s = float(custom_speed) if custom_speed is not None else 1.0
            tempo_factor = s / p
            tempo_str = build_tempo_filter_chain(tempo_factor)
            
            # Incorporate preset specific colorings
            extra_fx = ""
            if preset_name in ("kids",):
                extra_fx = ",equalizer=f=3000:t=q:w=1.5:g=3,equalizer=f=200:t=q:w=1:g=-6"
            elif preset_name in ("cartoon",):
                extra_fx = ",equalizer=f=2500:t=q:w=2:g=5,flanger=delay=1.5:depth=2:regen=0"
            elif preset_name in ("chipmunk",):
                extra_fx = ",highpass=f=200"
            elif preset_name in ("robot",):
                extra_fx = ",flanger=delay=0:depth=10:regen=20:width=80:speed=10,tremolo=f=35:d=0.7"
            elif preset_name in ("deep_boss", "deep_narrator"):
                extra_fx = ",bass=g=6:f=120"

            filter_chain = f"asetrate=44100*{p:.4f},aresample=44100,{tempo_str}{extra_fx}"
        except Exception as e:
            # Fall back to preset filter if parsing fails
            filter_chain = preset["filter"]

    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-af", filter_chain,
        "-c:a", "libmp3lame",
        "-q:a", "2",
        output_path
    ]

    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg voice transformation failed: {res.stderr}")
    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: voice_fx.py <input_audio> <output_audio> [preset] [custom_pitch] [custom_speed]"}))
        sys.exit(1)

    in_file = sys.argv[1]
    out_file = sys.argv[2]
    fx = sys.argv[3] if len(sys.argv) > 3 else "kids"
    c_pitch = float(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else None
    c_speed = float(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5] else None

    try:
        out = transform_voice(in_file, out_file, fx, c_pitch, c_speed)
        print(json.dumps({"success": True, "output": out, "preset": fx, "pitch": c_pitch, "speed": c_speed}))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
