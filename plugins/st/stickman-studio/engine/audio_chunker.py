#!/usr/bin/env python3
# [FL_INDEX: keywords="audio_chunker, faster_whisper, scene_storyboard, timestamp_slicer, stickman_director" | purpose="CLI service to transcribe audio with word timestamps, detect sentence pauses, and partition long audio into editable multi-part scenes"]
"""
Stickman Storyboard & Audio Slicer Engine
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import sys
import os
import json
import subprocess
import numpy as np
from faster_whisper import WhisperModel

PROPS_CATALOG = [
    'alert', 'battery', 'book', 'brain', 'broken_heart', 'bulb', 'chart_down', 'chart_up',
    'clock', 'eyes', 'heart', 'house', 'lock', 'magnifier', 'mask', 'people', 'phone', 'question', 'scale', 'target'
]

POSES_CATALOG = [
    'talk', 'think', 'shrug', 'point', 'celebrate', 'sad', 'angry', 'surprised', 'run', 'read', 'listen', 'rest'
]

EMOTIONS_CATALOG = [
    'neutral', 'happy', 'sad', 'angry', 'surprised', 'confused'
]

MODELS_CATALOG = [
    {'id': 'classic', 'name': 'Classic Stickman', 'icon': '🤺', 'color': '#ffffff'},
    {'id': 'ninja', 'name': 'Shadow Ninja', 'icon': '🥷', 'color': '#a855f7'},
    {'id': 'cyber', 'name': 'Cyber Cyborg', 'icon': '🤖', 'color': '#00e5ff'},
    {'id': 'business', 'name': 'Corporate Suit', 'icon': '👔', 'color': '#f59e0b'},
    {'id': 'rebel', 'name': 'Neon Rebel', 'icon': '⚡', 'color': '#ef4444'}
]

def analyze_and_slice(audio_path, target_part_seconds=8.0):
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    # 1. Decode to 16kHz mono float32 for Whisper
    cmd = [
        'ffmpeg', '-v', 'error',
        '-i', audio_path,
        '-f', 'f32le',
        '-acodec', 'pcm_f32le',
        '-ar', '16000',
        '-ac', '1',
        '-'
    ]
    proc = subprocess.run(cmd, capture_output=True, check=True)
    audio_data = np.frombuffer(proc.stdout, dtype=np.float32)
    duration = float(len(audio_data)) / 16000.0

    # 2. Whisper transcription with word timestamps
    model = WhisperModel('base', device='cpu', compute_type='int8')
    segments, info = model.transcribe(audio_data, beam_size=5, word_timestamps=True)

    words = []
    whisper_segments = []
    for seg in segments:
        seg_words = []
        if seg.words:
            for w in seg.words:
                wd = {
                    'start': round(float(w.start), 2),
                    'end': round(float(w.end), 2),
                    'word': w.word.strip()
                }
                seg_words.append(wd)
                words.append(wd)
        whisper_segments.append({
            'start': round(float(seg.start), 2),
            'end': round(float(seg.end), 2),
            'text': seg.text.strip(),
            'words': seg_words
        })

    # 3. Intelligent scene / part partitioning
    # We partition either by sentence silence gaps or when accumulating ~target_part_seconds
    parts = []
    current_part_words = []
    part_idx = 1
    part_start = 0.0

    acc_text = []
    for i, seg in enumerate(whisper_segments):
        acc_text.append(seg['text'])
        current_part_words.extend(seg['words'])
        seg_duration = seg['end'] - part_start

        # Check if we should close this part
        is_last = (i == len(whisper_segments) - 1)
        if is_last or seg_duration >= target_part_seconds or (seg_duration >= 5.0 and seg['text'].endswith(('.', '!', '?'))):
            part_end = seg['end'] if not is_last else round(duration, 2)
            joined_text = " ".join(acc_text).strip()

            # Dynamic heuristic for pose, emotion, prop based on text keywords
            text_lower = joined_text.lower()
            pose = 'talk'
            emotion = 'neutral'
            prop = 'bulb'
            accent = '#00e5ff'
            model_id = 'classic'

            if any(k in text_lower for k in ['kaget', 'heran', 'wah', 'gila', 'astaga', 'kenapa', 'waduh', 'siapa']):
                pose = 'surprised'
                emotion = 'surprised'
                prop = 'alert'
                accent = '#ef4444'
            elif any(k in text_lower for k in ['uang', 'duit', 'tunai', 'kaya', 'bayar', 'modal', 'untung', 'omset']):
                pose = 'point'
                emotion = 'happy'
                prop = 'chart_up'
                accent = '#10b981'
            elif any(k in text_lower for k in ['pikir', 'ide', 'bingung', 'gimana', 'strategi', 'pertanyaan']):
                pose = 'think'
                emotion = 'confused'
                prop = 'question'
                accent = '#f59e0b'
            elif any(k in text_lower for k in ['lari', 'kabur', 'cepat', 'kejar', 'panik', 'ribut']):
                pose = 'run'
                emotion = 'angry'
                prop = 'clock'
                accent = '#ec4899'
            elif any(k in text_lower for k in ['senang', 'mantap', 'asik', 'sukses', 'bisa', 'hore', 'jos']):
                pose = 'celebrate'
                emotion = 'happy'
                prop = 'target'
                accent = '#8b5cf6'

            parts.append({
                'part_id': part_idx,
                'title': f"Part {part_idx:02d}",
                'start_time': round(part_start, 2),
                'end_time': round(part_end, 2),
                'duration': round(part_end - part_start, 2),
                'text': joined_text,
                'model': model_id,
                'pose': pose,
                'emotion': emotion,
                'prop': prop,
                'accent': accent,
                'words': current_part_words,
                'custom_notes': ''
            })

            part_idx += 1
            part_start = part_end
            current_part_words = []
            acc_text = []

    # If audio is empty or Whisper had no segments, create fallback part
    if not parts:
        parts.append({
            'part_id': 1,
            'title': "Part 01",
            'start_time': 0.0,
            'end_time': round(duration, 2),
            'duration': round(duration, 2),
            'text': "Audio Speech Content",
            'model': 'classic',
            'pose': 'talk',
            'emotion': 'neutral',
            'prop': 'bulb',
            'accent': '#00e5ff',
            'words': [],
            'custom_notes': ''
        })

    return {
        'audio_path': audio_path,
        'duration': round(duration, 2),
        'language': info.language,
        'total_parts': len(parts),
        'parts': parts,
        'catalogs': {
            'props': PROPS_CATALOG,
            'poses': POSES_CATALOG,
            'emotions': EMOTIONS_CATALOG,
            'models': MODELS_CATALOG
        }
    }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: python3 audio_chunker.py <audio_path> [target_sec]'}))
        sys.exit(1)

    audio_file = sys.argv[1]
    sec = float(sys.argv[2]) if len(sys.argv) > 2 else 8.0

    try:
        res = analyze_and_slice(audio_file, target_part_seconds=sec)
        print(json.dumps(res, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        sys.exit(1)
