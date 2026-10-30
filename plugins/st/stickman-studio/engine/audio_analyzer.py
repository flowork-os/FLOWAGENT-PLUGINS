#!/usr/bin/env python3
# [FL_INDEX: keywords="audio_energy, rms_envelope, silence_detection, onset_analysis, stickman_sync" | purpose="Extracts audio energy envelope and timestamps for stickman lip-sync and dynamic gesture triggers"]

import sys
import os
import subprocess
import json

def analyze_audio_envelope(audio_path, window_sec=0.08):
    # Convert audio to mono 16kHz raw PCM float stream for precision envelope calculation
    cmd = [
        "ffmpeg", "-y",
        "-i", audio_path,
        "-ac", "1",
        "-ar", "16000",
        "-f", "f32le",
        "-"
    ]
    
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    raw_data, err = proc.communicate()
    
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg PCM extraction failed: {err.decode('utf-8', errors='ignore')}")
    
    import struct
    import math

    num_samples = len(raw_data) // 4
    samples = struct.unpack(f"{num_samples}f", raw_data)
    
    sample_rate = 16000
    samples_per_window = int(sample_rate * window_sec)
    
    timeline = []
    total_windows = len(samples) // samples_per_window
    
    for i in range(total_windows):
        start = i * samples_per_window
        chunk = samples[start:start + samples_per_window]
        
        # Calculate RMS
        sum_sq = sum(s * s for s in chunk)
        rms = math.sqrt(sum_sq / len(chunk)) if chunk else 0.0
        
        # Categorize action/mouth openness (0.0 to 1.0)
        # Normalized energy
        mouth_open = min(1.0, max(0.0, rms * 8.0))
        is_speaking = rms > 0.015
        
        # Emotion heuristic based on peak energy
        emotion = "neutral"
        if rms > 0.12:
            emotion = "excited"
        elif rms > 0.05:
            emotion = "talking"
        elif not is_speaking:
            emotion = "idle"
            
        timestamp = round(i * window_sec, 3)
        timeline.append({
            "t": timestamp,
            "rms": round(rms, 4),
            "mouth": round(mouth_open, 2),
            "speaking": is_speaking,
            "emotion": emotion
        })
        
    duration = round(num_samples / sample_rate, 3)
    return {
        "duration": duration,
        "sample_rate": sample_rate,
        "window_sec": window_sec,
        "frames": timeline
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: audio_analyzer.py <audio_path> [fps_or_output_json]"}))
        sys.exit(1)
        
    in_file = sys.argv[1]
    second_arg = sys.argv[2] if len(sys.argv) > 2 else None
    
    window = 0.08
    out_json = None
    if second_arg:
        if second_arg.endswith(".json"):
            out_json = second_arg
        else:
            try:
                fps_val = float(second_arg)
                if fps_val > 0:
                    window = 1.0 / fps_val
            except ValueError:
                out_json = second_arg
    
    try:
        data = analyze_audio_envelope(in_file, window_sec=window)
        if out_json:
            with open(out_json, "w") as f:
                json.dump(data, f, indent=2)
            print(json.dumps({"success": True, "output": out_json, "duration": data["duration"]}))
        else:
            print(json.dumps({"success": True, "data": data}))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
