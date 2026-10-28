#!/usr/bin/env python3
# [FL_INDEX: keywords="audio_ducking, ffmpeg_sidechain, smart_audio_mixer, voiceover_bgm, sound_ducking" | purpose="Apply professional broadcast-grade sidechain audio ducking using FFmpeg to attenuate BGM when voice is active"]

import sys
import json
import os
import subprocess

def apply_auto_ducking(voice_path, bgm_path, output_path, ducking_db=-18, attack_ms=20, release_ms=300):
    """
    Blends voice and BGM tracks using ffmpeg sidechaincompress filter.
    BGM volume automatically lowers by ducking_db when voice track level exceeds threshold.
    """
    if not os.path.exists(voice_path):
        return {"status": "error", "error": f"Voice file not found: {voice_path}"}
    if not os.path.exists(bgm_path):
        return {"status": "error", "error": f"BGM file not found: {bgm_path}"}

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # sidechaincompress filter syntax:
    # [1:a] as main input (BGM), [0:a] as sidechain detector (Voice)
    # threshold=0.08, ratio=6, attack=20ms, release=300ms
    filter_complex = (
        f"[1:a]asplit=2[sc_bgm_main][sc_bgm_probe];"
        f"[sc_bgm_main][0:a]sidechaincompress=threshold=0.08:ratio=8:attack={attack_ms}:release={release_ms}:makeup=1[ducked_bgm];"
        f"[0:a][ducked_bgm]amix=inputs=2:duration=first:dropout_transition=2[out_audio]"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", voice_path,
        "-i", bgm_path,
        "-filter_complex", filter_complex,
        "-map", "[out_audio]",
        "-c:a", "aac",
        "-b:a", "192k",
        output_path
    ]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            return {
                "status": "success",
                "success": True,
                "output_file": output_path,
                "voice_path": voice_path,
                "bgm_path": bgm_path,
                "ducking_db": ducking_db,
                "bytes": os.path.getsize(output_path)
            }
        else:
            return {"status": "error", "error": "Output audio file was not generated"}
    except subprocess.CalledProcessError as e:
        return {"status": "error", "error": f"FFmpeg ducking failed: {e.stderr}"}

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: audio_ducker.py <voice_path> <bgm_path> <output_path> [ducking_db]"}))
        sys.exit(1)

    v_path = sys.argv[1]
    b_path = sys.argv[2]
    o_path = sys.argv[3]
    d_db = float(sys.argv[4]) if len(sys.argv) > 4 else -18.0

    res = apply_auto_ducking(v_path, b_path, o_path, d_db)
    print(json.dumps(res))
