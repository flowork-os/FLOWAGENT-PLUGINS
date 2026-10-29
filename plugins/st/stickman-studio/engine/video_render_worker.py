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
import cv2
import numpy as np

sys.path.append(os.path.dirname(__file__))
from scene_composer import StickmanSceneComposer


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
    beats = cfg.get('beats') or cfg.get('parts') or []
    bg_choice = cfg.get('background', 'podcast_studio')
    title = cfg.get('title', 'Stickman Parody Short')

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

    width, height = 720, 1280
    fps = 24
    total_frames = int(duration * fps)

    # Fallback default beats if empty
    if not beats:
        beats = [
            {"start": 0.0, "end": duration, "text": title, "pose": "talk", "emotion": "neutral", "prop": "bulb", "background": bg_choice}
        ]

    # Video reader if split_pip is enabled and video_path exists
    cap = None
    if render_mode == 'split_pip' and video_path and os.path.exists(video_path):
        cap = cv2.VideoCapture(video_path)

    temp_raw_video = os.path.abspath(output_mp4 + ".raw.mp4")
    output_mp4 = os.path.abspath(output_mp4)
    os.makedirs(os.path.dirname(output_mp4), exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(temp_raw_video, fourcc, fps, (width, height))

    # Initialize Composer: for split PIP, stickman lives in 720x640 sub-canvas
    stickman_h = 640 if (render_mode == 'split_pip' and cap is not None) else height
    composer = StickmanSceneComposer(width=width, height=stickman_h)

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
            # --- 1. TOP HALF: Original Real Video Frame (720x640) Synchronized ---
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
            ret, orig_frame = cap.read()
            if not ret or orig_frame is None:
                orig_frame = last_orig_frame
            else:
                last_orig_frame = orig_frame.copy()

            if orig_frame is not None:
                # Center-crop original frame to 720x640 (aspect ratio 9:8)
                of_h, of_w = orig_frame.shape[:2]
                target_ratio = 720.0 / 640.0
                curr_ratio = of_w / float(of_h)

                if curr_ratio > target_ratio:
                    new_w = int(of_h * target_ratio)
                    start_x = (of_w - new_w) // 2
                    cropped = orig_frame[:, start_x:start_x+new_w]
                else:
                    new_h = int(of_w / target_ratio)
                    start_y = (of_h - new_h) // 2
                    cropped = orig_frame[start_y:start_y+new_h, :]

                resized_top = cv2.resize(cropped, (720, 640), interpolation=cv2.INTER_LINEAR)
                full_frame[0:640, 0:720] = resized_top
            else:
                full_frame[0:640, 0:720] = (20, 24, 32)

            # Badge on top: ORIGINAL CLIP
            cv2.rectangle(full_frame, (24, 24), (160, 56), (15, 20, 28), -1)
            cv2.rectangle(full_frame, (24, 24), (160, 56), (0, 229, 255), 1)
            cv2.putText(full_frame, 'ORIGINAL CLIP', (34, 46), cv2.FONT_HERSHEY_DUPLEX, 0.42, (0, 229, 255), 1)

            # --- 2. MIDDLE DIVIDER BAR (y=636..644) ---
            cv2.rectangle(full_frame, (0, 636), (720, 644), (0, 240, 255), -1)
            # Center Badge
            cv2.rectangle(full_frame, (width//2 - 90, 624), (width//2 + 90, 656), (15, 23, 42), -1)
            cv2.rectangle(full_frame, (width//2 - 90, 624), (width//2 + 90, 656), (0, 240, 255), 2)
            cv2.putText(full_frame, 'VS STICKMAN', (width//2 - 68, 646), cv2.FONT_HERSHEY_DUPLEX, 0.48, (255, 255, 255), 1)

            # --- 3. BOTTOM HALF: Stickman Animation (720x640) ---
            stickman_layer = np.zeros((640, 720, 3), dtype=np.uint8)
            bg = current_beat.get("background", bg_choice)
            composer.draw_background(stickman_layer, bg_type=bg, camera_shake=cam_shake)

            actor_x = width // 2 + int(cam_shake[0])
            actor_y = int(640 * 0.76) + int(cam_shake[1])
            energy = 0.5 + 0.5 * math.sin(t * 8.0)
            pose_action = current_beat.get("pose", "talk")
            composer.draw_expressive_stickman(stickman_layer, actor_x, actor_y, action=pose_action, t=t, energy=energy)

            # Subtitle or Ambience Badge at bottom of stickman frame
            sub_text = current_beat.get("text", "")
            if sub_text:
                if sub_text == "[Music / Ambience]":
                    mb_w, mb_h = 240, 42
                    mb_x1 = (width - mb_w) // 2
                    mb_y1 = 560
                    cv2.rectangle(stickman_layer, (mb_x1, mb_y1), (mb_x1 + mb_w, mb_y1 + mb_h), (15, 23, 42), -1)
                    cv2.rectangle(stickman_layer, (mb_x1, mb_y1), (mb_x1 + mb_w, mb_y1 + mb_h), (168, 85, 247), 1)
                    for i_bar in range(6):
                        bar_h = int(10 + 8 * math.sin(t * 12.0 + i_bar * 0.8))
                        bx = mb_x1 + 18 + i_bar * 9
                        cv2.line(stickman_layer, (bx, mb_y1 + 21 - bar_h // 2), (bx, mb_y1 + 21 + bar_h // 2), (168, 85, 247), 2)
                    cv2.putText(stickman_layer, "MUSIC / AMBIENCE", (mb_x1 + 80, mb_y1 + 26), cv2.FONT_HERSHEY_DUPLEX, 0.42, (255, 255, 255), 1)
                else:
                    cv2.rectangle(stickman_layer, (30, 530), (width - 30, 615), (15, 23, 42), -1)
                    cv2.rectangle(stickman_layer, (30, 530), (width - 30, 615), (0, 229, 255), 2)
                    words = sub_text.split()
                    line1 = " ".join(words[:len(words)//2 + 1])
                    line2 = " ".join(words[len(words)//2 + 1:])
                    cv2.putText(stickman_layer, line1, (45, 565), cv2.FONT_HERSHEY_DUPLEX, 0.6, (255, 255, 255), 2)
                    if line2:
                        cv2.putText(stickman_layer, line2, (45, 600), cv2.FONT_HERSHEY_DUPLEX, 0.6, (0, 229, 255), 2)

            full_frame[640:1280, 0:720] = stickman_layer

        else:
            # --- 100% Full Vertical Stickman Animation (720x1280) ---
            bg = current_beat.get("background", bg_choice)
            composer.draw_background(full_frame, bg_type=bg, camera_shake=cam_shake)

            actor_x = width // 2 + int(cam_shake[0])
            actor_y = int(height * 0.72) + int(cam_shake[1])
            energy = 0.5 + 0.5 * math.sin(t * 8.0)
            pose_action = current_beat.get("pose", "talk")
            composer.draw_expressive_stickman(full_frame, actor_x, actor_y, action=pose_action, t=t, energy=energy)

            # Header Banner
            cv2.rectangle(full_frame, (0, 0), (width, 90), (15, 23, 42), -1)
            cv2.line(full_frame, (0, 90), (width, 90), (0, 229, 255), 2)
            cv2.putText(full_frame, title[:30].upper(), (30, 58), cv2.FONT_HERSHEY_DUPLEX, 0.75, (0, 229, 255), 2)

            # Subtitles Box at Bottom
            sub_text = current_beat.get("text", "")
            if sub_text:
                if sub_text == "[Music / Ambience]":
                    mb_w, mb_h = 280, 50
                    mb_x1 = (width - mb_w) // 2
                    mb_y1 = height - 120
                    cv2.rectangle(full_frame, (mb_x1, mb_y1), (mb_x1 + mb_w, mb_y1 + mb_h), (15, 23, 42), -1)
                    cv2.rectangle(full_frame, (mb_x1, mb_y1), (mb_x1 + mb_w, mb_y1 + mb_h), (168, 85, 247), 2)
                    for i_bar in range(8):
                        bar_h = int(14 + 10 * math.sin(t * 12.0 + i_bar * 0.8))
                        bx = mb_x1 + 22 + i_bar * 10
                        cv2.line(full_frame, (bx, mb_y1 + 25 - bar_h // 2), (bx, mb_y1 + 25 + bar_h // 2), (168, 85, 247), 2)
                    cv2.putText(full_frame, "MUSIC / AMBIENCE", (mb_x1 + 110, mb_y1 + 32), cv2.FONT_HERSHEY_DUPLEX, 0.5, (255, 255, 255), 1)
                else:
                    sub_y1 = height - 180
                    sub_y2 = height - 60
                    cv2.rectangle(full_frame, (30, sub_y1), (width - 30, sub_y2), (15, 23, 42), -1)
                    cv2.rectangle(full_frame, (30, sub_y1), (width - 30, sub_y2), (255, 255, 255), 2)
                    words = sub_text.split()
                    line1 = " ".join(words[:len(words)//2 + 1])
                    line2 = " ".join(words[len(words)//2 + 1:])
                    cv2.putText(full_frame, line1, (50, sub_y1 + 45), cv2.FONT_HERSHEY_DUPLEX, 0.65, (255, 255, 255), 2)
                    if line2:
                        cv2.putText(full_frame, line2, (50, sub_y1 + 90), cv2.FONT_HERSHEY_DUPLEX, 0.65, (0, 229, 255), 2)

        out.write(full_frame)

    if cap:
        cap.release()
    out.release()

    # 3. Audio Muxing & Encoding: Strict H.264 Video + AAC Audio Output
    report_progress("muxing_audio", 88)

    has_audio_stream = False
    if audio_path and os.path.exists(audio_path):
        probe_cmd = ['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', audio_path]
        p_res = subprocess.run(probe_cmd, capture_output=True, text=True)
        if 'audio' in p_res.stdout:
            has_audio_stream = True

    if has_audio_stream:
        cmd = [
            'ffmpeg', '-y',
            '-i', temp_raw_video,
            '-i', audio_path,
            '-map', '0:v:0',
            '-map', '1:a:0',
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
    else:
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
