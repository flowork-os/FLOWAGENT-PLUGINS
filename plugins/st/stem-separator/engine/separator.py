#!/usr/bin/env python3
"""
Sovereign AI Audio Stem Separation Engine
Powered by Meta AI Demucs v4 (Hybrid Transformer HTDemucs)
Optimized for Flowork OS (floworkos.com)
"""

import sys
import os
import argparse
import json
import time
import zipfile
import subprocess
import torch

def detect_device(requested_device: str = "auto") -> str:
    if requested_device == "cpu":
        return "cpu"
    if requested_device == "cuda" or requested_device == "auto":
        if torch.cuda.is_available():
            return "cuda"
    return "cpu"


def run_separation(
    input_path: str,
    output_dir: str,
    mode: str = "four-stems",
    format_type: str = "wav",
    device: str = "auto",
    shifts: int = 1,
) -> dict:
    t0 = time.time()
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input audio file not found: {input_path}")

    os.makedirs(output_dir, exist_ok=True)
    selected_device = detect_device(device)
    device_name = torch.cuda.get_device_name(0) if selected_device == "cuda" else "CPU"

    # Setup model and stem options
    # Modes:
    # 1. two-stems-vocals (Karaoke / Acapella): htdemucs --two-stems=vocals
    # 2. four-stems (Standard Band): htdemucs (vocals, drums, bass, other)
    # 3. six-stems (Studio Multitrack): htdemucs_6s (vocals, drums, bass, other, guitar, piano)
    
    model_name = "htdemucs"
    if mode == "six-stems":
        model_name = "htdemucs_6s"

    cmd = [
        sys.executable,
        "-m", "demucs.separate",
        "-n", model_name,
        "-d", selected_device,
        "-o", output_dir,
        "--filename", "{stem}.{ext}",
        "--shifts", str(shifts)
    ]

    if mode == "two-stems-vocals":
        cmd.extend(["--two-stems", "vocals"])

    if format_type == "mp3":
        cmd.extend(["--mp3", "--mp3-bitrate", "320"])
    elif format_type == "flac":
        cmd.append("--flac")

    cmd.append(input_path)

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    stdout, stderr = proc.communicate()

    if proc.returncode != 0:
        raise RuntimeError(f"Demucs separation error (exit {proc.returncode}): {stderr or stdout}")

    # Demucs outputs into <output_dir>/<model_name>/
    model_out_dir = os.path.join(output_dir, model_name)
    if not os.path.exists(model_out_dir):
        # Fallback check inside output_dir directly
        model_out_dir = output_dir

    stem_files = {}
    found_files = []
    
    # Expected stem names by mode
    expected_stems = ["vocals", "no_vocals"] if mode == "two-stems-vocals" else (
        ["vocals", "drums", "bass", "other", "guitar", "piano"] if mode == "six-stems" else 
        ["vocals", "drums", "bass", "other"]
    )

    for stem in expected_stems:
        target_file = f"{stem}.{format_type}"
        file_path = os.path.join(model_out_dir, target_file)
        if os.path.exists(file_path):
            size = os.path.getsize(file_path)
            stem_files[stem] = {
                "stem": stem,
                "filename": target_file,
                "filepath": file_path,
                "size_bytes": size,
                "size_formatted": f"{round(size / (1024 * 1024), 2)} MB"
            }
            found_files.append((stem, file_path))

    # Also search for any extra stems created
    for f in os.listdir(model_out_dir):
        stem_name = os.path.splitext(f)[0]
        full_p = os.path.join(model_out_dir, f)
        if os.path.isfile(full_p) and stem_name not in stem_files and not f.endswith(".zip"):
            size = os.path.getsize(full_p)
            stem_files[stem_name] = {
                "stem": stem_name,
                "filename": f,
                "filepath": full_p,
                "size_bytes": size,
                "size_formatted": f"{round(size / (1024 * 1024), 2)} MB"
            }
            found_files.append((stem_name, full_p))

    # Generate ZIP bundle for 1-click download of all stems
    zip_filename = "all_stems.zip"
    zip_path = os.path.join(model_out_dir, zip_filename)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for stem_name, f_path in found_files:
            zf.write(f_path, arcname=os.path.basename(f_path))

    elapsed_s = time.time() - t0

    return {
        "status": "success",
        "mode": mode,
        "format": format_type,
        "device": f"{selected_device.upper()} ({device_name})",
        "processing_time_seconds": round(elapsed_s, 2),
        "stems_count": len(stem_files),
        "stems": stem_files,
        "zip_path": zip_path,
        "zip_filename": zip_filename,
        "output_directory": model_out_dir
    }


def main():
    parser = argparse.ArgumentParser(description="Meta AI Demucs Stem Separator for Flowork OS")
    parser.add_argument("--input", "-i", required=True, help="Input audio file")
    parser.add_argument("--output-dir", "-o", required=True, help="Directory to store separated stems")
    parser.add_argument("--mode", "-m", choices=["two-stems-vocals", "four-stems", "six-stems"], default="four-stems", help="Separation mode")
    parser.add_argument("--format", "-f", choices=["wav", "mp3", "flac"], default="wav", help="Output audio format")
    parser.add_argument("--device", "-d", choices=["auto", "cuda", "cpu"], default="auto", help="Compute device")
    parser.add_argument("--shifts", type=int, default=1, help="Number of random shifts for equivariant stabilization")

    args = parser.parse_args()

    try:
        res = run_separation(
            input_path=args.input,
            output_dir=args.output_dir,
            mode=args.mode,
            format_type=args.format,
            device=args.device,
            shifts=args.shifts
        )
        print(json.dumps(res, indent=2))
        sys.exit(0)
    except Exception as e:
        err_res = {"status": "error", "message": str(e)}
        print(json.dumps(err_res), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
