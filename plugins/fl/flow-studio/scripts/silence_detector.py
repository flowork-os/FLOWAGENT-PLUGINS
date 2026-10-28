#!/usr/bin/env python3
# [FL_INDEX: keywords="silence_detector, silence_removal, jump_cut, audio_analysis, ffmpeg_silence" | purpose="Detect silent intervals in audio/video and compute jump cut segments for CapCut-style automatic editing"]

import sys
import json
import os
import subprocess
import re

def detect_silence(media_path, noise_threshold_db=-30.0, min_silence_dur=0.4):
    """
    Runs ffmpeg silencedetect filter and parses start, end, and duration of silences.
    Returns active non-silent segments (keepers) and silent intervals (cuts).
    """
    if not os.path.exists(media_path):
        return {"error": f"Media file not found: {media_path}", "segments": []}
    
    # 1. Probe media duration
    probe_cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", media_path
    ]
    try:
        dur_res = subprocess.run(probe_cmd, capture_output=True, text=True, check=True)
        total_duration = float(dur_res.stdout.strip())
    except Exception as e:
        total_duration = 0.0

    # 2. Run silencedetect
    cmd = [
        "ffmpeg", "-i", media_path,
        "-af", f"silencedetect=noise={noise_threshold_db}dB:d={min_silence_dur}",
        "-f", "null", "-"
    ]
    
    proc = subprocess.run(cmd, capture_output=True, text=True)
    stderr_output = proc.stderr

    silence_starts = []
    silences = []
    
    re_start = re.compile(r"silence_start:\s*([0-9\.]+)")
    re_end = re.compile(r"silence_end:\s*([0-9\.]+)\s*\|\s*silence_duration:\s*([0-9\.]+)")

    for line in stderr_output.splitlines():
        m_s = re_start.search(line)
        if m_s:
            silence_starts.append(float(m_s.group(1)))
        m_e = re_end.search(line)
        if m_e:
            end_t = float(m_e.group(1))
            dur_t = float(m_e.group(2))
            start_t = end_t - dur_t if not silence_starts else silence_starts.pop(0)
            silences.append({
                "start": round(start_t, 3),
                "end": round(end_t, 3),
                "duration": round(dur_t, 3)
            })

    # 3. Calculate Keep Segments (Active Speech / Action)
    keeps = []
    curr = 0.0
    for sil in silences:
        if sil["start"] > curr:
            keeps.append({
                "start": round(curr, 3),
                "end": round(sil["start"], 3),
                "duration": round(sil["start"] - curr, 3)
            })
        curr = sil["end"]
        
    if total_duration > curr and (total_duration - curr) > 0.05:
        keeps.append({
            "start": round(curr, 3),
            "end": round(total_duration, 3),
            "duration": round(total_duration - curr, 3)
        })

    return {
        "media_path": media_path,
        "total_duration": round(total_duration, 3),
        "silence_intervals": silences,
        "keep_segments": keeps,
        "silence_ratio": round(sum(s["duration"] for s in silences) / max(total_duration, 0.001), 3)
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: silence_detector.py <file_path> [noise_db] [min_silence_dur]"}))
        sys.exit(1)
        
    target_path = sys.argv[1]
    noise_db = float(sys.argv[2]) if len(sys.argv) > 2 else -30.0
    min_dur = float(sys.argv[3]) if len(sys.argv) > 3 else 0.4
    
    result = detect_silence(target_path, noise_db, min_dur)
    print(json.dumps(result))
