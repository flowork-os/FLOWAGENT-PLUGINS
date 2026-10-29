#!/usr/bin/env python3
"""
Flow3D Studio - Turntable Video Engine & Transcoder
Encodes 360-degree turntable frames and canvas video recordings into broadcast-ready MP4.
Features PTS normalization, CFR 30fps, faststart moov atom, and vertical 9:16 / 16:9 presets.
"""

import os
import sys
import json
import subprocess
import tempfile
import shutil

def transcode_to_turntable_mp4(input_path, output_path, aspect_ratio="16:9", fps=30, duration=None):
    """
    Transcodes input video or image sequence to a high-fidelity MP4 video.
    Aspect ratios:
      - 16:9: 1920x1080
      - 9:16: 1080x1920 (YouTube Shorts / TikTok)
      - 1:1:  1080x1080
    """
    if aspect_ratio == "9:16":
        scale_filter = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black"
    elif aspect_ratio == "1:1":
        scale_filter = "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:color=black"
    else:  # default 16:9
        scale_filter = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black"

    vf = f"{scale_filter},setpts=PTS-STARTPTS"

    cmd = [
        "ffmpeg", "-y",
        "-fflags", "+genpts",
        "-avoid_negative_ts", "make_zero",
        "-i", input_path,
        "-vf", vf,
        "-r", str(fps),
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart"
    ]

    if duration:
        cmd.extend(["-t", str(duration)])

    cmd.append(output_path)

    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg transcode failed (exit {proc.returncode}): {proc.stderr[-500:]}")

    return output_path

def compile_frames_to_turntable(frames_dir, output_path, aspect_ratio="16:9", fps=30):
    """
    Compiles an image sequence (frame_%05d.png/jpg) into a 360-degree turntable video.
    """
    if aspect_ratio == "9:16":
        scale_filter = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black"
    elif aspect_ratio == "1:1":
        scale_filter = "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:color=black"
    else:
        scale_filter = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black"

    # Detect frame format
    sample_files = os.listdir(frames_dir)
    pattern = os.path.join(frames_dir, "frame_%04d.jpg")
    if any(f.endswith(".png") for f in sample_files):
        pattern = os.path.join(frames_dir, "frame_%04d.png")

    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(fps),
        "-i", pattern,
        "-vf", f"{scale_filter},setpts=PTS-STARTPTS",
        "-r", str(fps),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "medium",
        "-crf", "18",
        "-movflags", "+faststart",
        output_path
    ]

    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg frame compilation failed (exit {proc.returncode}): {proc.stderr[-500:]}")

    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: turntable.py <input_video_or_frames_dir> <output_path> [aspect_ratio] [fps]")
        sys.exit(1)

    inp = sys.argv[1]
    out = sys.argv[2]
    aspect = sys.argv[3] if len(sys.argv) > 3 else "16:9"
    fps_val = int(sys.argv[4]) if len(sys.argv) > 4 else 30

    if os.path.isdir(inp):
        res = compile_frames_to_turntable(inp, out, aspect, fps_val)
    else:
        res = transcode_to_turntable_mp4(inp, out, aspect, fps_val)

    print(json.dumps({"status": "ok", "output_path": res}))
