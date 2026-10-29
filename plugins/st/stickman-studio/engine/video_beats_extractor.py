#!/usr/bin/env python3
# [FL_INDEX: keywords="video_beats_extractor, micro_beat_slicer, keyframe_extractor, faster_whisper, stickman_parody" | purpose="Extract ~3-second micro-beats with visual keyframes and audio transcription for Stickman Studio"]
"""
Stickman Studio Video Micro-Beat & Keyframe Extractor Engine
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import sys
import os
import json
import math
import subprocess
import cv2
import numpy as np
from faster_whisper import WhisperModel

# Semantic pose and prop catalogs
POSES_CATALOG = [
    'talk', 'think', 'shrug', 'point', 'celebrate', 'sad', 'angry', 'surprised',
    'run', 'read', 'listen', 'rest', 'panic_look', 'cough_fail', 'chair_drag',
    'blame_friend', 'zoom_mic_shock', 'outro_clap'
]

PROPS_CATALOG = [
    'alert', 'battery', 'book', 'brain', 'broken_heart', 'bulb', 'chart_down', 'chart_up',
    'clock', 'eyes', 'heart', 'house', 'lock', 'magnifier', 'mask', 'people', 'phone',
    'question', 'scale', 'target', 'coffee', 'boxing_glove', 'money_bag', 'megaphone'
]

EMOTIONS_CATALOG = [
    'neutral', 'happy', 'sad', 'angry', 'surprised', 'confused'
]

BACKGROUNDS_CATALOG = [
    'office_meeting', 'speedlines_panic', 'cyber_grid', 'podcast_studio', 'courtroom', 'living_room'
]


def extract_media_info(input_path):
    cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate',
        '-of', 'json', input_path
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    info = json.loads(res.stdout)
    
    duration = float(info.get('format', {}).get('duration', 0.0))
    has_video = False
    v_width, v_height = 720, 1280
    fps = 24.0

    for stream in info.get('streams', []):
        if stream.get('codec_type') == 'video':
            has_video = True
            v_width = int(stream.get('width', 720))
            v_height = int(stream.get('height', 1280))
            r_rate = stream.get('r_frame_rate', '24/1')
            if '/' in r_rate:
                num, den = r_rate.split('/')
                fps = float(num) / float(den) if float(den) > 0 else 24.0
            break

    return {
        'duration': duration,
        'has_video': has_video,
        'width': v_width,
        'height': v_height,
        'fps': fps
    }


def extract_keyframe(video_path, timestamp, output_image_path, target_width=480, target_height=640):
    os.makedirs(os.path.dirname(os.path.abspath(output_image_path)), exist_ok=True)
    # Fast accurate seek with ffmpeg
    cmd = [
        'ffmpeg', '-y', '-ss', str(max(0.0, timestamp)),
        '-i', video_path,
        '-vframes', '1',
        '-vf', f'scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:color=black',
        '-q:v', '2',
        output_image_path
    ]
    subprocess.run(cmd, capture_output=True, check=False)
    return os.path.exists(output_image_path)


def synthesize_audio_fallback_thumbnail(output_image_path, beat_idx, text, width=480, height=640):
    os.makedirs(os.path.dirname(os.path.abspath(output_image_path)), exist_ok=True)
    img = np.zeros((height, width, 3), dtype=np.uint8)
    # Background dark gradient
    for y in range(height):
        ratio = y / height
        b = int(24 + ratio * 15)
        g = int(20 + ratio * 10)
        r = int(16 + ratio * 8)
        cv2.line(img, (0, y), (width, y), (b, g, r), 1)

    # Audio Waveform Graphics
    center_y = height // 2
    cv2.circle(img, (width // 2, center_y), 90, (0, 229, 255), 2)
    cv2.putText(img, f'BEAT #{beat_idx:02d}', (width // 2 - 60, center_y - 20), cv2.FONT_HERSHEY_DUPLEX, 0.7, (0, 229, 255), 2)
    cv2.putText(img, 'AUDIO NARRATIVE', (width // 2 - 80, center_y + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 190, 205), 1)

    # Word preview
    snippet = (text[:40] + '...') if len(text) > 40 else text
    cv2.putText(img, snippet, (20, height - 50), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
    cv2.imwrite(output_image_path, img)


def derive_stickman_choreography(text, beat_idx, total_beats, has_video=False):
    t_lower = text.lower()
    
    pose = 'talk'
    emotion = 'neutral'
    prop = 'bulb'
    bg = 'podcast_studio'
    meme_fx = []

    # Semantic Keyword Intelligence
    if any(k in t_lower for k in ['hancur', 'rusak', 'bangkrut', 'rugi', 'turun', 'drop', 'minus', 'fail', 'batal', 'hilang']):
        pose = 'panic_look'
        emotion = 'surprised'
        prop = 'chart_down'
        bg = 'speedlines_panic'
        meme_fx = ['sweat', 'speedlines']
    elif any(k in t_lower for k in ['cuan', 'untung', 'kaya', 'profit', 'naik', 'milyar', 'juta', 'sukses', 'menang']):
        pose = 'celebrate'
        emotion = 'happy'
        prop = 'money_bag'
        bg = 'cyber_grid'
        meme_fx = ['sparkle']
    elif any(k in t_lower for k in ['kenapa', 'gimana', 'bingung', 'maksudnya', 'what', 'why', 'how', 'apaan', 'kok bisa']):
        pose = 'shrug'
        emotion = 'confused'
        prop = 'question'
        bg = 'office_meeting'
        meme_fx = ['question_mark']
    elif any(k in t_lower for k in ['ide', 'pikir', 'rencananya', 'solusi', 'trik', 'rahasia', 'strategi', 'concept']):
        pose = 'think'
        emotion = 'happy'
        prop = 'brain'
        bg = 'podcast_studio'
    elif any(k in t_lower for k in ['marah', 'gila', 'kacau', 'kesel', 'ngamuk', 'ribut', 'bodoh', 'hate']):
        pose = 'angry'
        emotion = 'angry'
        prop = 'alert'
        bg = 'speedlines_panic'
        meme_fx = ['sweat']
    elif any(k in t_lower for k in ['dia bilang', 'katanya', 'menurutku', 'saya rasa', 'dengerin']):
        pose = 'point'
        emotion = 'neutral'
        prop = 'megaphone'
        bg = 'podcast_studio'
    elif any(k in t_lower for k in ['wkwk', 'haha', 'lucu', 'ngakak', 'ketawa', 'jokes', 'konyol']):
        pose = 'cough_fail'
        emotion = 'happy'
        prop = 'eyes'
        bg = 'podcast_studio'
        meme_fx = ['tears']
    elif any(k in t_lower for k in ['rapat', 'kantor', 'meeting', 'zoom', 'kerja', 'bos', 'klien']):
        pose = 'talk'
        emotion = 'neutral'
        prop = 'clock'
        bg = 'office_meeting'
    else:
        # Cadence cycling for visual variety across 3s beats
        cycle_poses = ['talk', 'point', 'think', 'shrug', 'celebrate']
        cycle_props = ['bulb', 'phone', 'brain', 'clock', 'target']
        pose = cycle_poses[beat_idx % len(cycle_poses)]
        prop = cycle_props[beat_idx % len(cycle_props)]

    return {
        'pose': pose,
        'emotion': emotion,
        'prop': prop,
        'background': bg,
        'meme_fx': meme_fx
    }


def slice_video_beats(input_path, output_dir, target_beat_seconds=3.0):
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    os.makedirs(output_dir, exist_ok=True)
    keyframes_dir = os.path.join(output_dir, 'keyframes')
    os.makedirs(keyframes_dir, exist_ok=True)

    media_info = extract_media_info(input_path)
    duration = media_info['duration']
    has_video = media_info['has_video']

    # 1. Extract 16kHz mono audio for Faster-Whisper
    cmd = [
        'ffmpeg', '-v', 'error',
        '-i', input_path,
        '-f', 'f32le',
        '-acodec', 'pcm_f32le',
        '-ar', '16000',
        '-ac', '1',
        '-'
    ]
    proc = subprocess.run(cmd, capture_output=True, check=True)
    audio_data = np.frombuffer(proc.stdout, dtype=np.float32)

    # 2. Whisper transcription with word timestamps
    model = WhisperModel('base', device='cpu', compute_type='int8')
    segments, info = model.transcribe(audio_data, beam_size=5, word_timestamps=True)

    whisper_words = []
    for seg in segments:
        if seg.words:
            for w in seg.words:
                whisper_words.append({
                    'start': round(float(w.start), 2),
                    'end': round(float(w.end), 2),
                    'word': w.word.strip()
                })

    # 3. Create ~3.0 Second Micro-Beats
    beats = []
    current_words = []
    beat_idx = 1
    beat_start = 0.0

    # If audio is empty or has no words, generate rhythmic 3-second slices
    if not whisper_words:
        num_beats = max(1, int(math.ceil(duration / target_beat_seconds)))
        for b_i in range(num_beats):
            b_start = round(b_i * target_beat_seconds, 2)
            b_end = round(min(duration, (b_i + 1) * target_beat_seconds), 2)
            midpoint = round((b_start + b_end) / 2.0, 2)
            kf_filename = f"beat_{b_i+1:03d}.jpg"
            kf_path = os.path.join(keyframes_dir, kf_filename)
            
            if has_video:
                extract_keyframe(input_path, midpoint, kf_path)
            else:
                synthesize_audio_fallback_thumbnail(kf_path, b_i+1, "Audio scene")

            choreo = derive_stickman_choreography("", b_i, num_beats, has_video)
            beats.append({
                'id': f"beat_{b_i+1:03d}",
                'index': b_i + 1,
                'beat_id': b_i + 1,
                'start': b_start,
                'end': b_end,
                'duration': round(b_end - b_start, 2),
                'text': f"Scene Beat #{b_i+1}",
                'words': [],
                'keyframe_file': kf_filename,
                'keyframe_url': f"/api/keyframes/{kf_filename}",
                'keyframe_path': kf_path,
                'model': 'classic',
                'pose': choreo['pose'],
                'emotion': choreo['emotion'],
                'prop': choreo['prop'],
                'background': choreo['background'],
                'meme_fx': choreo['meme_fx'],
                'accent': '#00e5ff'
            })
    else:
        # Group words into ~3.0s boundaries
        word_ptr = 0
        while word_ptr < len(whisper_words):
            beat_start = whisper_words[word_ptr]['start']
            current_words = []
            
            while word_ptr < len(whisper_words):
                w = whisper_words[word_ptr]
                current_words.append(w)
                word_ptr += 1
                curr_dur = w['end'] - beat_start
                # Check 3.0s threshold or sentence terminal punctuation
                if curr_dur >= target_beat_seconds or (curr_dur >= 2.2 and w['word'].endswith(('.', '!', '?', ','))):
                    break

            beat_end = current_words[-1]['end']
            # Extend last beat to full duration if close
            if word_ptr >= len(whisper_words) and (duration - beat_end) < 2.0:
                beat_end = round(duration, 2)

            joined_text = " ".join([w['word'] for w in current_words]).strip()
            midpoint = round((beat_start + beat_end) / 2.0, 2)
            kf_filename = f"beat_{beat_idx:03d}.jpg"
            kf_path = os.path.join(keyframes_dir, kf_filename)

            if has_video:
                extract_keyframe(input_path, midpoint, kf_path)
            else:
                synthesize_audio_fallback_thumbnail(kf_path, beat_idx, joined_text)

            choreo = derive_stickman_choreography(joined_text, beat_idx - 1, 10, has_video)

            beats.append({
                'id': f"beat_{beat_idx:03d}",
                'index': beat_idx,
                'beat_id': beat_idx,
                'start': round(beat_start, 2),
                'end': round(beat_end, 2),
                'duration': round(beat_end - beat_start, 2),
                'text': joined_text,
                'words': current_words,
                'keyframe_file': kf_filename,
                'keyframe_url': f"/api/keyframes/{kf_filename}",
                'keyframe_path': kf_path,
                'model': 'classic',
                'pose': choreo['pose'],
                'emotion': choreo['emotion'],
                'prop': choreo['prop'],
                'background': choreo['background'],
                'meme_fx': choreo['meme_fx'],
                'accent': '#00e5ff'
            })
            beat_idx += 1

    manifest = {
        'input_path': os.path.abspath(input_path),
        'duration': round(duration, 2),
        'has_video': has_video,
        'total_beats': len(beats),
        'beats': beats
    }

    manifest_path = os.path.join(output_dir, 'beats_manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    return manifest


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: video_beats_extractor.py <video_or_audio_path> [output_dir] [target_seconds]'}))
        sys.exit(1)

    in_file = sys.argv[1]
    out_d = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), 'output')
    t_seconds = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0
    
    try:
        res = slice_video_beats(in_file, out_d, target_beat_seconds=t_seconds)
        print(json.dumps({'success': True, 'manifest': res}, indent=2))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)

