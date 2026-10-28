#!/usr/bin/env python3
# [FL_INDEX: keywords="auto_caption, faster_whisper, srt_generator, speech_to_text, capcut_logic" | purpose="Extract precise word and sentence level timestamps from audio/video for CapCut-style auto captions"]

import sys
import json
import os
import av

# Monkeypatch PyAV 14+ / 19+ open to ignore deprecated metadata_errors kwarg in faster-whisper
orig_av_open = av.open
def safe_av_open(*args, **kwargs):
    kwargs.pop('metadata_errors', None)
    return orig_av_open(*args, **kwargs)
av.open = safe_av_open

from faster_whisper import WhisperModel

def transcribe_media(media_path, model_size="tiny", language=None):
    if not os.path.exists(media_path):
        return {"error": f"File not found: {media_path}"}
    
    # Run on CPU with INT8 quantization for fast zero-GPU inference
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    
    segments, info = model.transcribe(
        media_path,
        beam_size=5,
        word_timestamps=True,
        language=language
    )
    
    results = []
    for segment in segments:
        words_list = []
        if segment.words:
            for w in segment.words:
                words_list.append({
                    "word": w.word.strip(),
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                    "probability": round(w.probability, 3)
                })
        
        results.append({
            "id": segment.id,
            "start": round(segment.start, 3),
            "end": round(segment.end, 3),
            "text": segment.text.strip(),
            "words": words_list
        })
        
    return {
        "status": "success",
        "language": info.language,
        "language_probability": round(info.language_probability, 3),
        "duration": round(info.duration, 3),
        "captions": results
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: auto_caption.py <media_file> [model_size] [lang]"}))
        sys.exit(1)
        
    file_path = sys.argv[1]
    m_size = sys.argv[2] if len(sys.argv) > 2 else "tiny"
    lang = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != "auto" else None
    
    res = transcribe_media(file_path, m_size, lang)
    print(json.dumps(res))
