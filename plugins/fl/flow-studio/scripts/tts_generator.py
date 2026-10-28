#!/usr/bin/env python3
# [FL_INDEX: keywords="tts_generator, edge_tts, capcut_voiceover, speech_synthesis, multilingual_tts" | purpose="Autonomous Text-to-Speech voiceover generator using edge-tts for CapCut-style narration with exact ffprobe duration extraction"]

import sys
import json
import os
import asyncio
import subprocess
import edge_tts

# Popular realistic CapCut-style AI Voices
PRESET_VOICES = {
    "id-female": "id-ID-GadisNeural",
    "id-male": "id-ID-ArdiNeural",
    "en-female": "en-US-JennyNeural",
    "en-male": "en-US-GuyNeural",
    "en-deep": "en-US-ChristopherNeural",
    "en-energetic": "en-US-AriaNeural"
}

def get_audio_duration(file_path):
    """Extract exact audio duration in seconds via ffprobe"""
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path
        ]
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL)
        return round(float(out.strip()), 2)
    except Exception:
        return 3.0

async def generate_speech(text, voice_key, output_file, rate="+0%", pitch="+0Hz"):
    voice = PRESET_VOICES.get(voice_key, voice_key)
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(output_file)
    
    if os.path.exists(output_file):
        size = os.path.getsize(output_file)
        duration = get_audio_duration(output_file)
        return {
            "status": "success",
            "success": True,
            "file": output_file,
            "voice": voice,
            "bytes": size,
            "duration": duration
        }
    else:
        return {"status": "error", "success": False, "error": "Output audio file not created"}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: tts_generator.py <text> <output_file> [voice_key] [rate] [pitch]"}))
        sys.exit(1)
        
    text_content = sys.argv[1]
    out_path = sys.argv[2]
    v_key = sys.argv[3] if len(sys.argv) > 3 else "id-female"
    r_rate = sys.argv[4] if len(sys.argv) > 4 else "+0%"
    p_pitch = sys.argv[5] if len(sys.argv) > 5 else "+0Hz"
    
    res = asyncio.run(generate_speech(text_content, v_key, out_path, r_rate, p_pitch))
    print(json.dumps(res))
