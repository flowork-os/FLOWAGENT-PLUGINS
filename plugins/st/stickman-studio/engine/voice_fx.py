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
    "deep_narrator": {
        "description": "Authoritative deep resonant voice",
        "filter": "asetrate=44100*0.82,aresample=44100,atempo=1.22,bass=g=6:f=120"
    },
    "original": {
        "description": "Clean unprocessed passthrough",
        "filter": "anull"
    }
}

def transform_voice(input_path, output_path, preset_name="kids"):
    if preset_name not in PRESETS:
        preset_name = "kids"
    
    preset = PRESETS[preset_name]
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
        print(json.dumps({"error": "Usage: voice_fx.py <input_audio> <output_audio> [preset]"}))
        sys.exit(1)

    in_file = sys.argv[1]
    out_file = sys.argv[2]
    fx = sys.argv[3] if len(sys.argv) > 3 else "kids"

    try:
        out = transform_voice(in_file, out_file, fx)
        print(json.dumps({"success": True, "output": out, "preset": fx}))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
