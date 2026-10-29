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

sys.path.append(os.path.dirname(__file__))
from pose_tracker import PoseTracker
from dynamic_cartoonist import DynamicCartoonist

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
    has_audio = False
    v_width, v_height = 720, 1280
    fps = 24.0

    for stream in info.get('streams', []):
        ctype = stream.get('codec_type')
        if ctype == 'video' and not has_video:
            has_video = True
            v_width = int(stream.get('width', 720))
            v_height = int(stream.get('height', 1280))
            r_rate = stream.get('r_frame_rate', '24/1')
            if '/' in r_rate:
                num, den = r_rate.split('/')
                fps = float(num) / float(den) if float(den) > 0 else 24.0
        elif ctype == 'audio':
            has_audio = True

    return {
        'duration': duration,
        'has_video': has_video,
        'has_audio': has_audio,
        'width': v_width,
        'height': v_height,
        'fps': fps
    }


def extract_keyframe(video_path, timestamp, output_image_path, target_width=480, target_height=640):
    os.makedirs(os.path.dirname(os.path.abspath(output_image_path)), exist_ok=True)
    target_ts = max(0.0, float(timestamp))
    # Accurate seek: seek timestamp directly to capture exact mid-point frame
    cmd = [
        'ffmpeg', '-y',
        '-ss', f'{target_ts:.3f}',
        '-i', video_path,
        '-vframes', '1',
        '-vf', f'scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:color=black',
        '-q:v', '2',
        output_image_path
    ]
    subprocess.run(cmd, capture_output=True, check=False)

    # OpenCV fallback if ffmpeg did not produce a valid file
    if not (os.path.exists(output_image_path) and os.path.getsize(output_image_path) > 0):
        try:
            cap = cv2.VideoCapture(video_path)
            cap.set(cv2.CAP_PROP_POS_MSEC, target_ts * 1000.0)
            ret, frame = cap.read()
            cap.release()
            if ret and frame is not None:
                h, w = frame.shape[:2]
                scale = min(target_width / w, target_height / h)
                nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
                resized = cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_AREA)
                canvas = np.zeros((target_height, target_width, 3), dtype=np.uint8)
                x_off = (target_width - nw) // 2
                y_off = (target_height - nh) // 2
                canvas[y_off:y_off+nh, x_off:x_off+nw] = resized
                cv2.imwrite(output_image_path, canvas, [cv2.IMWRITE_JPEG_QUALITY, 92])
        except Exception:
            pass

    return os.path.exists(output_image_path) and os.path.getsize(output_image_path) > 0


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
    display_title = 'AMBIENCE / AUDIO' if text == '[Music / Ambience]' else 'AUDIO NARRATIVE'
    cv2.putText(img, display_title, (width // 2 - 85, center_y + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 190, 205), 1)

    # Word preview
    snippet = (text[:40] + '...') if len(text) > 40 else text
    cv2.putText(img, snippet, (20, height - 50), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
    cv2.imwrite(output_image_path, img, [cv2.IMWRITE_JPEG_QUALITY, 92])


def derive_stickman_choreography(text, beat_idx, total_beats, has_video=False):
    t_lower = text.lower()
    
    pose = 'talk'
    emotion = 'neutral'
    prop = 'bulb'
    bg = 'podcast_studio'
    meme_fx = []

    if '[music' in t_lower or 'ambience' in t_lower:
        pose = 'listen'
        emotion = 'happy'
        prop = 'heart'
        bg = 'cyber_grid'
        meme_fx = ['sparkle']
    # Semantic Keyword Intelligence
    elif any(k in t_lower for k in ['hancur', 'rusak', 'bangkrut', 'rugi', 'turun', 'drop', 'minus', 'fail', 'batal', 'hilang', 'crash']):
        pose = 'panic_look'
        emotion = 'surprised'
        prop = 'chart_down'
        bg = 'speedlines_panic'
        meme_fx = ['sweat', 'speedlines']
    elif any(k in t_lower for k in ['cuan', 'untung', 'kaya', 'profit', 'naik', 'milyar', 'juta', 'sukses', 'menang', 'sultan', 'gass', 'viral']):
        pose = 'celebrate'
        emotion = 'happy'
        prop = 'money_bag'
        bg = 'cyber_grid'
        meme_fx = ['sparkle']
    elif any(k in t_lower for k in ['kenapa', 'gimana', 'bingung', 'maksudnya', 'what', 'why', 'how', 'apaan', 'kok bisa', 'gak ngerti']):
        pose = 'shrug'
        emotion = 'confused'
        prop = 'question'
        bg = 'office_meeting'
        meme_fx = ['question_mark']
    elif any(k in t_lower for k in ['ide', 'pikir', 'rencananya', 'solusi', 'trik', 'rahasia', 'strategi', 'concept', 'rumus', 'otak']):
        pose = 'think'
        emotion = 'happy'
        prop = 'brain'
        bg = 'podcast_studio'
    elif any(k in t_lower for k in ['marah', 'gila', 'kacau', 'kesel', 'ngamuk', 'ribut', 'bodoh', 'hate', 'emosi']):
        pose = 'angry'
        emotion = 'angry'
        prop = 'alert'
        bg = 'speedlines_panic'
        meme_fx = ['sweat']
    elif any(k in t_lower for k in ['dia bilang', 'katanya', 'menurutku', 'saya rasa', 'dengerin', 'kamu harus', 'ceritanya']):
        pose = 'point'
        emotion = 'neutral'
        prop = 'megaphone'
        bg = 'podcast_studio'
    elif any(k in t_lower for k in ['wkwk', 'haha', 'lucu', 'ngakak', 'ketawa', 'jokes', 'konyol', 'lawak', 'parodi']):
        pose = 'cough_fail'
        emotion = 'happy'
        prop = 'eyes'
        bg = 'podcast_studio'
        meme_fx = ['tears']
    elif any(k in t_lower for k in ['rapat', 'kantor', 'meeting', 'zoom', 'kerja', 'bos', 'klien', 'proyek']):
        pose = 'talk'
        emotion = 'neutral'
        prop = 'clock'
        bg = 'office_meeting'
    elif any(k in t_lower for k in ['kopi', 'santai', 'nongkrong', 'kafe', 'istirahat', 'chill', 'tenang']):
        pose = 'rest'
        emotion = 'happy'
        prop = 'coffee'
        bg = 'living_room'
    elif any(k in t_lower for k in ['server', 'code', 'coding', 'python', 'bug', 'error', 'database', 'ai', 'prompt', 'api']):
        pose = 'think'
        emotion = 'happy'
        prop = 'brain'
        bg = 'cyber_grid'
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


def slice_video_beats(input_path, output_dir, target_beat_seconds=3.0, max_duration=90.0):
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file not found: {input_path}")

    os.makedirs(output_dir, exist_ok=True)
    keyframes_dir = os.path.join(output_dir, 'keyframes')
    os.makedirs(keyframes_dir, exist_ok=True)
    batch_id = os.path.basename(os.path.abspath(output_dir))

    media_info = extract_media_info(input_path)
    raw_duration = media_info['duration']
    has_video = media_info['has_video']
    has_audio = media_info['has_audio']

    # For high-retention Short Video format: Cap raw inputs (e.g. 20-min raw files) to max_duration (default 90.0s)
    # to guarantee instant response and avoid timeout
    if max_duration and max_duration > 0 and raw_duration > max_duration:
        duration = float(max_duration)
    else:
        duration = raw_duration

    # 1. Extract 16kHz mono audio for Faster-Whisper if audio stream exists (capped to duration)
    audio_data = np.array([], dtype=np.float32)
    audio_mp3_path = os.path.join(output_dir, "audio.mp3")
    if has_audio:
        cmd = [
            'ffmpeg', '-v', 'error',
            '-i', input_path,
            '-t', str(duration),
            '-vn',
            '-f', 'f32le',
            '-acodec', 'pcm_f32le',
            '-ar', '16000',
            '-ac', '1',
            '-'
        ]
        proc = subprocess.run(cmd, capture_output=True)
        if proc.returncode == 0 and proc.stdout:
            audio_data = np.frombuffer(proc.stdout, dtype=np.float32)

        # Export lightweight MP3 for instant in-browser playback
        mp3_cmd = [
            'ffmpeg', '-y', '-v', 'error',
            '-i', input_path,
            '-t', str(duration),
            '-vn',
            '-acodec', 'libmp3lame',
            '-q:a', '3',
            audio_mp3_path
        ]
        try:
            subprocess.run(mp3_cmd, capture_output=True)
        except Exception:
            pass

    # 2. Whisper transcription with word timestamps
    whisper_words = []
    if len(audio_data) > 0:
        try:
            model = WhisperModel('base', device='cpu', compute_type='int8')
            segments, info = model.transcribe(audio_data, beam_size=5, word_timestamps=True)
            for seg in segments:
                if seg.words:
                    for w in seg.words:
                        w_text = w.word.strip()
                        if w_text and any(c.isalnum() for c in w_text) and w.end <= duration:
                            whisper_words.append({
                                'start': round(float(w.start), 2),
                                'end': round(float(w.end), 2),
                                'word': w_text
                            })
                elif seg.text and seg.text.strip():
                    swords = [sw for sw in seg.text.strip().split() if any(c.isalnum() for c in sw)]
                    if swords:
                        seg_dur = max(0.1, min(duration, seg.end) - seg.start)
                        step = seg_dur / len(swords)
                        for i, sw in enumerate(swords):
                            w_end = min(duration, seg.start + (i + 1) * step)
                            if w_end <= duration:
                                whisper_words.append({
                                    'start': round(float(seg.start + i * step), 2),
                                    'end': round(float(w_end), 2),
                                    'word': sw
                                })
        except Exception as we:
            print(f"Whisper transcription note: {we}", file=sys.stderr)

    # 3. Fast Keyframe Extractor using persistent OpenCV capture
    cap = None
    if has_video:
        try:
            cap = cv2.VideoCapture(input_path)
        except Exception:
            cap = None

    def grab_keyframe(ts, out_path):
        saved = False
        if cap and cap.isOpened():
            try:
                cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, float(ts)) * 1000.0)
                ret, frame = cap.read()
                if ret and frame is not None:
                    h, w = frame.shape[:2]
                    scale = min(480 / w, 640 / h)
                    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
                    resized = cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_AREA)
                    canvas = np.zeros((640, 480, 3), dtype=np.uint8)
                    x_off = (480 - nw) // 2
                    y_off = (640 - nh) // 2
                    canvas[y_off:y_off+nh, x_off:x_off+nw] = resized
                    cv2.imwrite(out_path, canvas, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    saved = True
            except Exception:
                saved = False
        if not saved:
            extract_keyframe(input_path, ts, out_path)

    # 4. Create ~3.0 Second Micro-Beats
    beats = []
    beat_idx = 1

    # Case A: If audio has no detected spoken words
    if not whisper_words:
        num_beats = max(1, int(math.ceil(duration / target_beat_seconds)))
        for b_i in range(num_beats):
            b_start = round(b_i * target_beat_seconds, 2)
            b_end = round(min(duration, (b_i + 1) * target_beat_seconds), 2)
            if b_end <= b_start:
                continue
            midpoint = round((b_start + b_end) / 2.0, 2)
            kf_filename = f"{batch_id}_beat_{b_i+1:03d}.jpg"
            kf_path = os.path.join(keyframes_dir, kf_filename)
            
            if has_video:
                grab_keyframe(midpoint, kf_path)
            else:
                synthesize_audio_fallback_thumbnail(kf_path, b_i+1, "[Music / Ambience]")

            choreo = derive_stickman_choreography("[Music / Ambience]", b_i, num_beats, has_video)
            beats.append({
                'id': f"beat_{b_i+1:03d}",
                'index': b_i + 1,
                'beat_id': b_i + 1,
                'batch_id': batch_id,
                'start': b_start,
                'end': b_end,
                'duration': round(b_end - b_start, 2),
                'text': "[Music / Ambience]",
                'words': [],
                'keyframe_file': kf_filename,
                'keyframe_url': f"/api/keyframes/{batch_id}/{kf_filename}",
                'keyframe_path': kf_path,
                'model': 'classic',
                'pose': choreo['pose'],
                'emotion': choreo['emotion'],
                'prop': choreo['prop'],
                'background': choreo['background'],
                'meme_fx': choreo['meme_fx'],
                'accent': '#a855f7'
            })
    else:
        # Case B: Real spoken words transcribed
        first_w_start = whisper_words[0]['start']
        if first_w_start >= 1.5:
            curr_gap_start = 0.0
            while curr_gap_start < first_w_start:
                gap_chunk_end = min(first_w_start, round(curr_gap_start + target_beat_seconds, 2))
                if (first_w_start - gap_chunk_end) < 1.2:
                    gap_chunk_end = first_w_start
                dur = round(gap_chunk_end - curr_gap_start, 2)
                midpoint = round((curr_gap_start + gap_chunk_end) / 2.0, 2)
                kf_filename = f"{batch_id}_beat_{beat_idx:03d}.jpg"
                kf_path = os.path.join(keyframes_dir, kf_filename)
                if has_video:
                    grab_keyframe(midpoint, kf_path)
                else:
                    synthesize_audio_fallback_thumbnail(kf_path, beat_idx, "[Music / Ambience]")
                choreo = derive_stickman_choreography("[Music / Ambience]", beat_idx - 1, 10, has_video)
                beats.append({
                    'id': f"beat_{beat_idx:03d}",
                    'index': beat_idx,
                    'beat_id': beat_idx,
                    'batch_id': batch_id,
                    'start': curr_gap_start,
                    'end': gap_chunk_end,
                    'duration': dur,
                    'text': "[Music / Ambience]",
                    'words': [],
                    'keyframe_file': kf_filename,
                    'keyframe_url': f"/api/keyframes/{batch_id}/{kf_filename}",
                    'keyframe_path': kf_path,
                    'model': 'classic',
                    'pose': choreo['pose'],
                    'emotion': choreo['emotion'],
                    'prop': choreo['prop'],
                    'background': choreo['background'],
                    'meme_fx': choreo['meme_fx'],
                    'accent': '#a855f7'
                })
                beat_idx += 1
                curr_gap_start = gap_chunk_end

        word_ptr = 0
        while word_ptr < len(whisper_words):
            last_end = beats[-1]['end'] if beats else 0.0
            curr_start = whisper_words[word_ptr]['start']
            
            if curr_start - last_end >= 2.0:
                gap_mid = round((last_end + curr_start) / 2.0, 2)
                kf_filename = f"{batch_id}_beat_{beat_idx:03d}.jpg"
                kf_path = os.path.join(keyframes_dir, kf_filename)
                if has_video:
                    grab_keyframe(gap_mid, kf_path)
                else:
                    synthesize_audio_fallback_thumbnail(kf_path, beat_idx, "[Music / Ambience]")
                choreo = derive_stickman_choreography("[Music / Ambience]", beat_idx - 1, 10, has_video)
                beats.append({
                    'id': f"beat_{beat_idx:03d}",
                    'index': beat_idx,
                    'beat_id': beat_idx,
                    'batch_id': batch_id,
                    'start': last_end,
                    'end': curr_start,
                    'duration': round(curr_start - last_end, 2),
                    'text': "[Music / Ambience]",
                    'words': [],
                    'keyframe_file': kf_filename,
                    'keyframe_url': f"/api/keyframes/{batch_id}/{kf_filename}",
                    'keyframe_path': kf_path,
                    'model': 'classic',
                    'pose': choreo['pose'],
                    'emotion': choreo['emotion'],
                    'prop': choreo['prop'],
                    'background': choreo['background'],
                    'meme_fx': choreo['meme_fx'],
                    'accent': '#a855f7'
                })
                beat_idx += 1
                beat_start = curr_start
            else:
                beat_start = last_end if beats else curr_start

            current_words = []
            while word_ptr < len(whisper_words):
                w = whisper_words[word_ptr]
                if current_words and (w['start'] - current_words[-1]['end'] >= 1.5):
                    break
                current_words.append(w)
                word_ptr += 1
                curr_dur = w['end'] - beat_start
                if curr_dur >= target_beat_seconds or (curr_dur >= 2.0 and w['word'].endswith(('.', '!', '?', ','))):
                    break

            beat_end = current_words[-1]['end']
            if word_ptr >= len(whisper_words) and (duration - beat_end) < 2.0:
                beat_end = round(duration, 2)

            joined_text = " ".join([w['word'] for w in current_words]).strip()
            midpoint = round((beat_start + beat_end) / 2.0, 2)
            kf_filename = f"{batch_id}_beat_{beat_idx:03d}.jpg"
            kf_path = os.path.join(keyframes_dir, kf_filename)

            if has_video:
                grab_keyframe(midpoint, kf_path)
            else:
                synthesize_audio_fallback_thumbnail(kf_path, beat_idx, joined_text)

            choreo = derive_stickman_choreography(joined_text, beat_idx - 1, 10, has_video)

            beats.append({
                'id': f"beat_{beat_idx:03d}",
                'index': beat_idx,
                'beat_id': beat_idx,
                'batch_id': batch_id,
                'start': round(beat_start, 2),
                'end': round(beat_end, 2),
                'duration': round(beat_end - beat_start, 2),
                'text': joined_text,
                'words': current_words,
                'keyframe_file': kf_filename,
                'keyframe_url': f"/api/keyframes/{batch_id}/{kf_filename}",
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

        if beats and (duration - beats[-1]['end']) >= 1.5:
            trail_start = beats[-1]['end']
            trail_end = round(duration, 2)
            midpoint = round((trail_start + trail_end) / 2.0, 2)
            kf_filename = f"{batch_id}_beat_{beat_idx:03d}.jpg"
            kf_path = os.path.join(keyframes_dir, kf_filename)
            if has_video:
                grab_keyframe(midpoint, kf_path)
            else:
                synthesize_audio_fallback_thumbnail(kf_path, beat_idx, "[Music / Ambience]")
            choreo = derive_stickman_choreography("[Music / Ambience]", beat_idx - 1, 10, has_video)
            beats.append({
                'id': f"beat_{beat_idx:03d}",
                'index': beat_idx,
                'beat_id': beat_idx,
                'batch_id': batch_id,
                'start': trail_start,
                'end': trail_end,
                'duration': round(trail_end - trail_start, 2),
                'text': "[Music / Ambience]",
                'words': [],
                'keyframe_file': kf_filename,
                'keyframe_url': f"/api/keyframes/{batch_id}/{kf_filename}",
                'keyframe_path': kf_path,
                'model': 'classic',
                'pose': choreo['pose'],
                'emotion': choreo['emotion'],
                'prop': choreo['prop'],
                'background': choreo['background'],
                'meme_fx': choreo['meme_fx'],
                'accent': '#a855f7'
            })

    if cap is not None:
        try:
            cap.release()
        except Exception:
            pass

    # 5. Extract Real Skeletal Poses & Generate Dynamic Cartoonist Parody Previews
    try:
        pose_tracker = PoseTracker()
        dynamic_cartoonist = DynamicCartoonist(width=480, height=640)
        for b in beats:
            kf_path = b.get('keyframe_path')
            if kf_path and os.path.exists(kf_path):
                pose_res = pose_tracker.analyze_image(kf_path)
                b['pose_data'] = pose_res
            else:
                b['pose_data'] = {'has_pose': False, 'screen_type': 'general'}

            parody_filename = f"{batch_id}_parody_{b['index']:03d}.jpg"
            parody_path = os.path.join(keyframes_dir, parody_filename)
            parody_frame = dynamic_cartoonist.render_beat_frame(b, t=0.5, energy=0.8)
            cv2.imwrite(parody_path, parody_frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            b['parody_thumb_file'] = parody_filename
            b['parody_thumb_url'] = f"/api/keyframes/{batch_id}/{parody_filename}"
            b['parody_thumb_path'] = parody_path
    except Exception as e:
        print(f"Warning: Dynamic cartoonist pass encountered exception: {e}")

    manifest = {
        'input_path': os.path.abspath(input_path),
        'duration': round(duration, 2),
        'total_duration': round(duration, 2),
        'has_video': has_video,
        'has_audio': has_audio,
        'audio_url': f"/api/audio/{batch_id}/audio.mp3" if has_audio and os.path.exists(os.path.join(output_dir, "audio.mp3")) else None,
        'total_beats': len(beats),
        'batch_id': batch_id,
        'beats': beats
    }

    manifest_path = os.path.join(output_dir, 'beats_manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    return manifest


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: video_beats_extractor.py <video_or_audio_path> [output_dir] [target_seconds] [max_duration]'}))
        sys.exit(1)

    in_file = sys.argv[1]
    out_d = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), 'output')
    t_seconds = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0
    m_duration = float(sys.argv[4]) if len(sys.argv) > 4 else 90.0
    
    try:
        res = slice_video_beats(in_file, out_d, target_beat_seconds=t_seconds, max_duration=m_duration)
        print(json.dumps({'success': True, 'manifest': res}, indent=2))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)

