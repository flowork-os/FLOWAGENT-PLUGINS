#!/usr/bin/env python3
# [FL_INDEX: keywords="video_render_worker, split_pip_render, stickman_studio, scene_composer, opencv_render" | purpose="Production video render worker supporting 100% full stickman and viral split-screen PIP modes for Stickman Studio"]
"""
Stickman Studio Production Video Render Worker (Full 9:16 & Split PIP)
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import sys
import os
import json
import math
import subprocess
import tempfile
import time
import cv2
import numpy as np

sys.path.append(os.path.dirname(__file__))
from scene_composer import StickmanSceneComposer
from dynamic_cartoonist import DynamicCartoonist
from pose_tracker import PoseTracker
from pro_stickman_engine import ProStickmanEngine
from stick_hub_storyteller_engine import StickHubStorytellerEngine


def extract_audio_envelope(audio_src, total_frames, fps=24):
    default_env = [0.5 + 0.3 * math.sin(i * 0.4) for i in range(max(1, total_frames))]
    if not audio_src or not os.path.exists(audio_src):
        return default_env
    temp_wav = os.path.join(tempfile.gettempdir(), f"_env_{os.getpid()}_{int(time.time() * 1000)}.wav")
    try:
        cmd = ['ffmpeg', '-y', '-i', audio_src, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', temp_wav]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if os.path.exists(temp_wav):
            import soundfile as sf
            data, sr = sf.read(temp_wav)
            os.remove(temp_wav)
            if len(data) == 0:
                return default_env
            spf = int(sr / fps)
            max_amp = float(np.percentile(np.abs(data), 95)) or 0.1
            env = []
            for f in range(total_frames):
                chunk = data[f * spf:(f + 1) * spf]
                if len(chunk) > 0:
                    rms = float(np.sqrt(np.mean(chunk**2)))
                    norm = min(1.0, (rms / max_amp) * 1.6)
                    env.append(max(0.08, norm))
                else:
                    env.append(0.08)
            return env
    except Exception:
        if os.path.exists(temp_wav):
            try:
                os.remove(temp_wav)
            except Exception:
                pass
    return default_env


def resolve_background_path(bg_path, app_root):
    if not bg_path:
        return None
    bg_str = str(bg_path)
    if os.path.exists(bg_str):
        return os.path.abspath(bg_str)
    clean_name = os.path.basename(bg_str)
    cand_data = os.path.join(app_root, 'data', 'backgrounds', clean_name)
    if os.path.exists(cand_data):
        return os.path.abspath(cand_data)
    cand_rel = os.path.join(app_root, bg_str.lstrip('/'))
    if os.path.exists(cand_rel):
        return os.path.abspath(cand_rel)
    cand_data_rel = os.path.join(app_root, 'data', bg_str.lstrip('/'))
    if os.path.exists(cand_data_rel):
        return os.path.abspath(cand_data_rel)
    return None


def ensure_compatible_video(v_path):
    if not v_path or not os.path.exists(v_path):
        return None
    test_cap = cv2.VideoCapture(v_path)
    ok = False
    if test_cap.isOpened():
        ok, test_frame = test_cap.read()
    test_cap.release()
    if ok:
        return v_path
    # OpenCV failed to decode direct stream (e.g. AV1 or unsupported pix_fmt). Normalize via ffmpeg!
    norm_path = v_path + ".norm.mp4"
    print(f"[Render Worker] ⚠️ Video {v_path} could not be read directly by OpenCV. Normalizing to standard H.264...", flush=True)
    cmd = ['ffmpeg', '-y', '-i', v_path, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-c:a', 'aac', '-b:a', '128k', '-pix_fmt', 'yuv420p', norm_path]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(norm_path) and os.path.getsize(norm_path) > 1000:
        return norm_path
    return v_path


def render_stickman_video(config_input, output_mp4, progress_file=None):
    if os.path.exists(config_input):
        with open(config_input, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
    else:
        try:
            cfg = json.loads(config_input)
        except Exception:
            with open(config_input, 'r', encoding='utf-8') as f:
                cfg = json.load(f)

    media_path = cfg.get('video_path') or cfg.get('audio_path')
    audio_path = cfg.get('audio_path') or media_path
    video_path = cfg.get('video_path')
    render_mode = cfg.get('render_mode', 'full_stickman') # 'full_stickman' or 'split_pip'
    staging_style = cfg.get('staging_style', 'stick_hub_storyteller') # 'stick_hub_storyteller' or 'podcast_desk'
    beats = cfg.get('beats') or cfg.get('parts') or []
    bg_choice = cfg.get('background', 'podcast_studio')
    title = cfg.get('title', 'Stickman Parody Short')

    # -------------------------------------------------------------
    # 0. Early Audio & Video Source Discovery (Zero-Silent Guarantee)
    # -------------------------------------------------------------
    resolved_audio = None
    resolved_video = None
    app_data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')

    audio_candidates = []
    if audio_path:
        audio_candidates.append(audio_path)
    if video_path:
        audio_candidates.append(video_path)
    if media_path:
        audio_candidates.append(media_path)

    # Search inside beats
    if beats:
        for b in beats:
            if b.get('audio_path'):
                audio_candidates.append(b.get('audio_path'))
            kf = b.get('keyframe_path') or b.get('parody_thumb_path')
            if kf:
                d1 = os.path.dirname(kf)
                d2 = os.path.dirname(d1)
                for d in [d1, d2]:
                    if os.path.exists(d):
                        for a_name in ['audio.mp3', 'audio.wav', 'audio.aac', 'audio.m4a']:
                            audio_candidates.append(os.path.join(d, a_name))
            batch_id = b.get('batch_id')
            if batch_id:
                audio_candidates.append(os.path.join(app_data_dir, batch_id, 'audio.mp3'))
                audio_candidates.append(os.path.join(app_data_dir, batch_id, 'audio.wav'))

    # Auto-discover latest audio/video in data directory
    try:
        if os.path.exists(app_data_dir):
            for sub in sorted(os.listdir(app_data_dir), reverse=True):
                if sub.startswith('beats_'):
                    audio_candidates.append(os.path.join(app_data_dir, sub, 'audio.mp3'))
                elif sub == 'uploads':
                    up_dir = os.path.join(app_data_dir, 'uploads')
                    for uf in sorted(os.listdir(up_dir), reverse=True):
                        if uf.endswith(('.mp4', '.mov', '.mp3', '.wav', '.m4a')):
                            audio_candidates.append(os.path.join(up_dir, uf))
    except Exception:
        pass

    seen = set()
    for cand in audio_candidates:
        if cand and os.path.exists(cand) and cand not in seen:
            seen.add(cand)
            probe_cmd = ['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', cand]
            try:
                p_res = subprocess.run(probe_cmd, capture_output=True, text=True)
                if 'video' in p_res.stdout and resolved_video is None:
                    resolved_video = cand
                if 'audio' in p_res.stdout and resolved_audio is None:
                    resolved_audio = cand
                    print(f"[Render Worker] 🔊 Found verified genuine audio source: {cand}", flush=True)
            except Exception:
                pass

    if resolved_audio:
        audio_path = resolved_audio
    if resolved_video and not video_path:
        video_path = resolved_video
    if not media_path:
        media_path = resolved_video or resolved_audio

    def report_progress(stage, pct, current_frame=0, total_frames=0, eta=""):
        msg = {
            "stage": stage,
            "percent": int(pct),
            "current_frame": current_frame,
            "total_frames": total_frames,
            "eta": eta
        }
        print(f"PROGRESS:{json.dumps(msg)}", flush=True)
        if progress_file:
            try:
                with open(progress_file, 'w', encoding='utf-8') as pf:
                    json.dump(msg, pf)
            except Exception:
                pass

    report_progress("analyzing_media", 5)

    duration = 30.0
    if media_path and os.path.exists(media_path):
        probe = subprocess.run([
            'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', media_path
        ], capture_output=True, text=True)
        try:
            duration = float(probe.stdout.strip())
        except Exception:
            duration = 30.0

    aspect_ratio = cfg.get('aspect_ratio')
    res_str = str(cfg.get('resolution', ''))
    if aspect_ratio == '16:9' or '1280x720' in res_str or '1920x1080' in res_str:
        if '1920' in res_str:
            width, height = 1920, 1080
        else:
            width, height = 1280, 720
    elif cfg.get('width') and cfg.get('height'):
        width, height = int(cfg['width']), int(cfg['height'])
    else:
        width, height = 720, 1280

    fps = int(cfg.get('fps', 24))
    total_frames = int(duration * fps)

    # Fallback default beats if empty
    if not beats:
        beats = [
            {"start": 0.0, "end": duration, "text": title, "pose": "talk", "emotion": "neutral", "prop": "bulb", "background": bg_choice}
        ]

    # MoCap Puppeteer Pipeline Branch
    if render_mode == 'mocap':
        report_progress("mocap_tracking", 10, 0, 100, "Extracting actor landmarks...")
        from mocap_stickman_engine import run_mocap_pipeline
        target_video = resolved_video or video_path or media_path
        if not target_video or not os.path.exists(target_video):
            raise FileNotFoundError(f"Input video file required for MoCap tracking: {target_video}")

        char_style = cfg.get('character_style', 'classic')
        framing_mode = cfg.get('framing_mode', 'auto')
        app_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        raw_bg = cfg.get('background_path') or cfg.get('background_image')
        bg_path = resolve_background_path(raw_bg, app_root)
        if not bg_path:
            preset_bg = os.path.join(app_data_dir, 'backgrounds', 'clean_living_room.jpg')
            bg_path = preset_bg if os.path.exists(preset_bg) else None

        report_progress("mocap_rendering", 25, 0, 100, "Rendering MoCap Stickman frames...")
        out_res = run_mocap_pipeline(
            target_video, bg_path, output_mp4,
            character_style=char_style, framing_mode=framing_mode, target_fps=fps
        )
        report_progress("completed", 100, total_frames, total_frames, "Render complete!")
        dest_dir = cfg.get('destination_dir')
        if dest_dir and os.path.isdir(dest_dir):
            dest_file = os.path.join(dest_dir, os.path.basename(output_mp4))
            try:
                import shutil
                shutil.copy2(output_mp4, dest_file)
                print(f"COPIED_DESTINATION:{dest_file}", flush=True)
            except Exception as e:
                print(f"Warning: Failed to copy to destination_dir: {e}", flush=True)
        return out_res

    # Video reader if split_pip is enabled and video_path exists
    cap = None
    if render_mode == 'split_pip':
        v_cand = video_path or resolved_video or media_path
        if v_cand:
            v_cand = ensure_compatible_video(v_cand)
            if v_cand and os.path.exists(v_cand):
                cap = cv2.VideoCapture(v_cand)
                video_path = v_cand

    temp_raw_video = os.path.abspath(output_mp4 + ".raw.mp4")
    output_mp4 = os.path.abspath(output_mp4)
    os.makedirs(os.path.dirname(output_mp4), exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_raw_video, fourcc, fps, (width, height))

    # Initialize Cartoonist, Scene Composer, Pro Stickman Engine, and Stick Hub Storyteller Engine
    is_landscape = (width > height)
    if is_landscape:
        pip_w, pip_h = width // 2, height
    else:
        pip_w, pip_h = width, height // 2

    stickman_w = pip_w if (render_mode == 'split_pip' and cap is not None) else width
    stickman_h = pip_h if (render_mode == 'split_pip' and cap is not None) else height

    cartoonist = DynamicCartoonist(width=width, height=height)
    composer = StickmanSceneComposer(width=stickman_w, height=stickman_h)
    pro_engine = ProStickmanEngine(width=stickman_w, height=stickman_h)
    storyteller_engine = StickHubStorytellerEngine(width=width, height=height)
    storyteller_pip = StickHubStorytellerEngine(width=pip_w, height=pip_h)

    # Audio amplitude envelope for real-time procedural lip-sync
    audio_src = audio_path or video_path or media_path
    audio_envelope = extract_audio_envelope(audio_src, total_frames, fps=fps)

    # Resolve global background from cfg or first beat
    app_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    global_bg_raw = cfg.get('background_path') or cfg.get('background_image')
    global_bg = resolve_background_path(global_bg_raw, app_root)
    if not global_bg and beats:
        for b in beats:
            cand = b.get('background_image') or b.get('background_path')
            rc = resolve_background_path(cand, app_root)
            if rc:
                global_bg = rc
                break

    # Ensure all beats have indices, pose_data, and background
    tracker = None
    for idx, b in enumerate(beats):
        if 'index' not in b:
            b['index'] = idx + 1
        if 'beat_idx' not in b:
            b['beat_idx'] = idx + 1
        if 'pose_data' not in b:
            kf_path = b.get('keyframe_path')
            if kf_path and os.path.exists(kf_path):
                if tracker is None:
                    tracker = PoseTracker()
                b['pose_data'] = tracker.analyze_image(kf_path)
        # Background inheritance: resolve beat bg or fallback to global custom bg
        beat_bg_raw = b.get('background_image') or b.get('background_path') or global_bg
        resolved_b_bg = resolve_background_path(beat_bg_raw, app_root) or global_bg
        if resolved_b_bg:
            b['background_image'] = resolved_b_bg
            b['background_path'] = resolved_b_bg

    report_progress("rendering_frames", 10, 0, total_frames)
    last_reported_pct = -1
    last_orig_frame = None

    for frame_idx in range(total_frames):
        t = frame_idx / fps
        pct = 10 + int((frame_idx / total_frames) * 75)
        if pct != last_reported_pct:
            last_reported_pct = pct
            rem_frames = total_frames - frame_idx
            eta_sec = int(rem_frames / 45)
            report_progress("rendering_frames", pct, frame_idx, total_frames, f"{eta_sec}s remaining")

        # Find active beat
        current_beat = beats[0]
        for b in beats:
            if b["start"] <= t <= b["end"]:
                current_beat = b
                break

        full_frame = np.zeros((height, width, 3), dtype=np.uint8)

        # Shake effect
        cam_shake = (0, 0)
        shake_amp = current_beat.get("camera_shake", 0)
        if shake_amp > 0:
            cam_shake = (math.sin(t * 30.0) * shake_amp, math.cos(t * 25.0) * shake_amp)

        if render_mode == 'split_pip' and cap is not None:
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
            ret, orig_frame = cap.read()
            if not ret or orig_frame is None:
                orig_frame = last_orig_frame
            else:
                last_orig_frame = orig_frame.copy()

            if orig_frame is not None:
                of_h, of_w = orig_frame.shape[:2]
                target_ratio = pip_w / float(pip_h)
                curr_ratio = of_w / float(of_h)

                if curr_ratio > target_ratio:
                    new_w = int(of_h * target_ratio)
                    start_x = (of_w - new_w) // 2
                    cropped = orig_frame[:, start_x:start_x+new_w]
                else:
                    new_h = int(of_w / target_ratio)
                    start_y = (of_h - new_h) // 2
                    cropped = orig_frame[start_y:start_y+new_h, :]

                resized_orig = cv2.resize(cropped, (pip_w, pip_h), interpolation=cv2.INTER_LINEAR)
            else:
                resized_orig = np.full((pip_h, pip_w, 3), (20, 24, 32), dtype=np.uint8)

            energy = audio_envelope[frame_idx] if frame_idx < len(audio_envelope) else 0.5
            if staging_style == 'podcast_desk':
                actors = current_beat.get("actors")
                if actors and len(actors) >= 2:
                    if actors[0].get("speaking"):
                        current_beat["speaking_actor"] = "HOST"
                    elif actors[1].get("speaking"):
                        current_beat["speaking_actor"] = "CO-HOST"
                elif "speaking_actor" not in current_beat:
                    beat_num = current_beat.get("index", 1)
                    current_beat["speaking_actor"] = "HOST" if (beat_num % 2 == 1) else "CO-HOST"
                stickman_layer = pro_engine.render_full_frame(current_beat, t=t, energy=energy)
            else:
                stickman_layer = storyteller_pip.render_frame(current_beat, t=t, energy=energy)

            if stickman_layer.shape[0] != pip_h or stickman_layer.shape[1] != pip_w:
                stickman_layer = cv2.resize(stickman_layer, (pip_w, pip_h), interpolation=cv2.INTER_AREA)

            if is_landscape:
                # --- Landscape: Side-by-Side PIP (Left: Original Video, Right: Stickman) ---
                full_frame[0:height, 0:pip_w] = resized_orig
                full_frame[0:height, pip_w:width] = stickman_layer

                # Vertical Divider
                cv2.rectangle(full_frame, (pip_w - 4, 0), (pip_w + 4, height), (0, 240, 255), -1)
                # Badges
                cv2.rectangle(full_frame, (24, 24), (160, 56), (15, 20, 28), -1)
                cv2.rectangle(full_frame, (24, 24), (160, 56), (0, 229, 255), 1)
                cv2.putText(full_frame, 'ORIGINAL CLIP', (34, 46), cv2.FONT_HERSHEY_DUPLEX, 0.42, (0, 229, 255), 1)

                cv2.rectangle(full_frame, (pip_w - 80, height//2 - 18), (pip_w + 80, height//2 + 18), (15, 23, 42), -1)
                cv2.rectangle(full_frame, (pip_w - 80, height//2 - 18), (pip_w + 80, height//2 + 18), (0, 240, 255), 2)
                cv2.putText(full_frame, 'VS STICKMAN', (pip_w - 60, height//2 + 6), cv2.FONT_HERSHEY_DUPLEX, 0.46, (255, 255, 255), 1)
            else:
                # --- Portrait: Top-Bottom PIP (Top: Original Video, Bottom: Stickman) ---
                full_frame[0:pip_h, 0:pip_w] = resized_orig
                full_frame[pip_h:height, 0:pip_w] = stickman_layer

                # Horizontal Divider
                cv2.rectangle(full_frame, (0, pip_h - 4), (width, pip_h + 4), (0, 240, 255), -1)
                cv2.rectangle(full_frame, (24, 24), (160, 56), (15, 20, 28), -1)
                cv2.rectangle(full_frame, (24, 24), (160, 56), (0, 229, 255), 1)
                cv2.putText(full_frame, 'ORIGINAL CLIP', (34, 46), cv2.FONT_HERSHEY_DUPLEX, 0.42, (0, 229, 255), 1)

                cv2.rectangle(full_frame, (width//2 - 90, pip_h - 16), (width//2 + 90, pip_h + 16), (15, 23, 42), -1)
                cv2.rectangle(full_frame, (width//2 - 90, pip_h - 16), (width//2 + 90, pip_h + 16), (0, 240, 255), 2)
                cv2.putText(full_frame, 'VS STICKMAN', (width//2 - 68, pip_h + 6), cv2.FONT_HERSHEY_DUPLEX, 0.48, (255, 255, 255), 1)

        else:
            # --- 100% Full Canvas Stickman Mode ---
            energy = audio_envelope[frame_idx] if frame_idx < len(audio_envelope) else 0.5

            if staging_style == 'podcast_desk':
                actors = current_beat.get("actors")
                if actors and len(actors) >= 2:
                    if actors[0].get("speaking"):
                        current_beat["speaking_actor"] = "HOST"
                    elif actors[1].get("speaking"):
                        current_beat["speaking_actor"] = "CO-HOST"
                elif "speaking_actor" not in current_beat:
                    beat_num = current_beat.get("index", 1)
                    current_beat["speaking_actor"] = "HOST" if (beat_num % 2 == 1) else "CO-HOST"
                stickman_layer = pro_engine.render_full_frame(current_beat, t=t, energy=energy)
            else:
                # Default: Stick Hub Storyteller (Solo Dynamic Full Body Standing / Walking / Gesturing)
                stickman_layer = storyteller_engine.render_frame(current_beat, t=t, energy=energy)

            if stickman_layer.shape[0] != height or stickman_layer.shape[1] != width:
                stickman_layer = cv2.resize(stickman_layer, (width, height), interpolation=cv2.INTER_AREA)
            full_frame = stickman_layer

        out.write(full_frame)

    if cap:
        cap.release()
    out.release()

    # 3. Audio Muxing & Encoding: Strict H.264 Video + AAC Audio Output
    report_progress("muxing_audio", 88)

    # Check audio source: use early resolved audio if available
    if not resolved_audio:
        candidates = [audio_path, video_path]
        for cand in candidates:
            if cand and os.path.exists(cand):
                probe_cmd = ['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', cand]
                try:
                    p_res = subprocess.run(probe_cmd, capture_output=True, text=True)
                    if 'audio' in p_res.stdout:
                        resolved_audio = cand
                        break
                except Exception:
                    pass

    has_audio_stream = resolved_audio is not None and os.path.exists(resolved_audio)

    if has_audio_stream:
        print(f"[Render Worker] 🎬 Multiplexing audio into MP4 from: {resolved_audio}", flush=True)
        cmd = [
            'ffmpeg', '-y',
            '-i', temp_raw_video,
            '-i', resolved_audio,
            '-map', '0:v:0',
            '-map', '1:a',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '22',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-shortest',
            output_mp4
        ]
        try:
            subprocess.run(cmd, check=True)
        except subprocess.CalledProcessError:
            # Fallback to map 1:a:0 if channel indexing differs
            cmd[4] = '-map'
            cmd[5] = '1:a:0'
            subprocess.run(cmd, check=True)
    else:
        print("[Render Worker] ℹ️ No active audio source found; generating silent baseline audio track (AAC stereo).", flush=True)
        # Universal fallback: provide genuine AAC silent stereo track
        cmd = [
            'ffmpeg', '-y',
            '-i', temp_raw_video,
            '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '22',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-shortest',
            output_mp4
        ]
        subprocess.run(cmd, check=True)

    if os.path.exists(temp_raw_video):
        try:
            os.remove(temp_raw_video)
        except Exception:
            pass

    report_progress("completed", 100, total_frames, total_frames, "0s")
    print(f"SUCCESS: Rendered stickman video to {output_mp4}")

    dest_dir = cfg.get('destination_dir')
    if dest_dir and os.path.isdir(dest_dir):
        dest_file = os.path.join(dest_dir, os.path.basename(output_mp4))
        try:
            import shutil
            shutil.copy2(output_mp4, dest_file)
            print(f"COPIED_DESTINATION:{dest_file}")
        except Exception as e:
            print(f"Warning: Failed to copy to destination_dir: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 video_render_worker.py <config.json> <output.mp4> [progress.json]")
        sys.exit(1)
    p_file = sys.argv[3] if len(sys.argv) > 3 else None
    render_stickman_video(sys.argv[1], sys.argv[2], progress_file=p_file)
