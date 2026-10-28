#!/usr/bin/env python3
"""
Sovereign Neural Audio-to-MIDI Transcription Engine
Powered by Spotify Basic Pitch ONNX Model
Engineered for Flowork OS (floworkos.com)
"""

import sys
import os
import argparse
import json
import time
import subprocess
from collections import defaultdict
from typing import List, Tuple, Optional, Dict, Any

import numpy as np
import scipy.signal
import onnxruntime as ort
import pretty_midi

# Core constants
AUDIO_SAMPLE_RATE = 22050
FFT_HOP = 256
AUDIO_WINDOW_LENGTH = 2  # seconds
ANNOTATIONS_FPS = AUDIO_SAMPLE_RATE // FFT_HOP  # 86 fps
ANNOT_N_FRAMES = ANNOTATIONS_FPS * AUDIO_WINDOW_LENGTH  # 172 frames
AUDIO_N_SAMPLES = AUDIO_SAMPLE_RATE * AUDIO_WINDOW_LENGTH - FFT_HOP  # 43844 samples
DEFAULT_OVERLAPPING_FRAMES = 30
MIDI_OFFSET = 21  # A0 piano key
MAX_FREQ_IDX = 87  # 88 semitones (0 to 87)
CONTOURS_BINS_PER_SEMITONE = 3
N_FREQ_BINS_CONTOURS = 88 * CONTOURS_BINS_PER_SEMITONE  # 264
PITCH_BEND_SCALE = 4096
N_PITCH_BEND_TICKS = 8192
MAGIC_ALIGNMENT_OFFSET = 0.0018
DEFAULT_MIDI_VELOCITY_SCALE = 127


def load_audio(audio_path: str) -> np.ndarray:
    """Decode any audio format to 22,050 Hz 32-bit mono float via ffmpeg."""
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    cmd = [
        "ffmpeg",
        "-nostdin",
        "-hide_banner",
        "-loglevel", "error",
        "-i", audio_path,
        "-f", "f32le",
        "-ac", "1",
        "-ar", str(AUDIO_SAMPLE_RATE),
        "-"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = proc.communicate()
    if proc.returncode != 0:
        err_msg = stderr.decode(errors="replace")
        raise RuntimeError(f"FFmpeg decoding error (code {proc.returncode}): {err_msg}")

    audio = np.frombuffer(stdout, dtype=np.float32)
    return audio


def window_audio_signal(audio_original: np.ndarray, hop_size: int):
    """Yield fixed-size padded windows of AUDIO_N_SAMPLES."""
    total_len = audio_original.shape[0]
    for i in range(0, total_len, hop_size):
        chunk = audio_original[i : i + AUDIO_N_SAMPLES]
        if len(chunk) < AUDIO_N_SAMPLES:
            chunk = np.pad(chunk, pad_width=[(0, AUDIO_N_SAMPLES - len(chunk))])
        yield np.expand_dims(chunk, axis=-1)  # shape: (AUDIO_N_SAMPLES, 1)


def unwrap_model_output(
    output: np.ndarray,
    audio_original_length: int,
    n_overlapping_frames: int,
    hop_size: int,
) -> np.ndarray:
    """Concatenate overlapping frame predictions back into single continuous spectrogram."""
    n_olap = int(0.5 * n_overlapping_frames)
    if n_olap > 0:
        output = output[:, n_olap:-n_olap, :]

    unwrapped = output.reshape(output.shape[0] * output.shape[1], output.shape[2])
    n_expected_windows = audio_original_length / hop_size
    n_frames_per_window = (AUDIO_WINDOW_LENGTH * ANNOTATIONS_FPS) - n_overlapping_frames
    return unwrapped[: int(n_expected_windows * n_frames_per_window), :]


def model_frames_to_seconds(n_frames: int) -> np.ndarray:
    """Convert frame indices into actual time in seconds with window alignment adjustment."""
    original_times = np.arange(n_frames, dtype=np.float64) * (FFT_HOP / AUDIO_SAMPLE_RATE)
    window_numbers = np.floor(np.arange(n_frames, dtype=np.float64) / ANNOT_N_FRAMES)
    window_offset = (FFT_HOP / AUDIO_SAMPLE_RATE) * (
        ANNOT_N_FRAMES - (AUDIO_N_SAMPLES / FFT_HOP)
    ) + MAGIC_ALIGNMENT_OFFSET
    return original_times - (window_offset * window_numbers)


def infer_onsets_from_frames(onsets: np.ndarray, frames: np.ndarray, n_diff: int = 2) -> np.ndarray:
    """Detect note onsets from energy changes in frames."""
    diffs = []
    for n in range(1, n_diff + 1):
        frames_appended = np.concatenate([np.zeros((n, frames.shape[1])), frames])
        diffs.append(frames_appended[n:, :] - frames_appended[:-n, :])
    frame_diff = np.min(diffs, axis=0)
    frame_diff[frame_diff < 0] = 0
    frame_diff[:n_diff, :] = 0
    max_fd = np.max(frame_diff)
    if max_fd > 0:
        frame_diff = np.max(onsets) * frame_diff / max_fd
    return np.maximum(onsets, frame_diff)


def decode_polyphonic_notes(
    frames: np.ndarray,
    onsets: np.ndarray,
    onset_thresh: float = 0.5,
    frame_thresh: float = 0.3,
    min_note_len: int = 11,
    infer_onsets: bool = True,
    melodia_trick: bool = True,
    energy_tol: int = 11,
) -> List[Tuple[int, int, int, float]]:
    """Decode raw model frames and onsets into discrete note events."""
    n_frames = frames.shape[0]
    if infer_onsets:
        onsets = infer_onsets_from_frames(onsets, frames)

    peak_thresh_mat = np.zeros_like(onsets)
    peaks = scipy.signal.argrelmax(onsets, axis=0)
    peak_thresh_mat[peaks] = onsets[peaks]

    onset_idx = np.where(peak_thresh_mat >= onset_thresh)
    onset_time_idx = onset_idx[0][::-1]
    onset_freq_idx = onset_idx[1][::-1]

    remaining_energy = np.copy(frames)
    note_events: List[Tuple[int, int, int, float]] = []

    for note_start_idx, freq_idx in zip(onset_time_idx, onset_freq_idx):
        if note_start_idx >= n_frames - 1:
            continue

        i = note_start_idx + 1
        k = 0
        while i < n_frames - 1 and k < energy_tol:
            if remaining_energy[i, freq_idx] < frame_thresh:
                k += 1
            else:
                k = 0
            i += 1

        i -= k
        if i - note_start_idx <= min_note_len:
            continue

        remaining_energy[note_start_idx:i, freq_idx] = 0
        if freq_idx < MAX_FREQ_IDX:
            remaining_energy[note_start_idx:i, freq_idx + 1] = 0
        if freq_idx > 0:
            remaining_energy[note_start_idx:i, freq_idx - 1] = 0

        amplitude = float(np.mean(frames[note_start_idx:i, freq_idx]))
        note_events.append((note_start_idx, i, int(freq_idx + MIDI_OFFSET), amplitude))

    if melodia_trick:
        energy_shape = remaining_energy.shape
        while np.max(remaining_energy) > frame_thresh:
            i_mid, freq_idx = np.unravel_index(np.argmax(remaining_energy), energy_shape)
            remaining_energy[i_mid, freq_idx] = 0

            # Forward search
            i = i_mid + 1
            k = 0
            while i < n_frames - 1 and k < energy_tol:
                if remaining_energy[i, freq_idx] < frame_thresh:
                    k += 1
                else:
                    k = 0
                remaining_energy[i, freq_idx] = 0
                if freq_idx < MAX_FREQ_IDX:
                    remaining_energy[i, freq_idx + 1] = 0
                if freq_idx > 0:
                    remaining_energy[i, freq_idx - 1] = 0
                i += 1
            i_end = i - 1 - k

            # Backward search
            i = i_mid - 1
            k = 0
            while i > 0 and k < energy_tol:
                if remaining_energy[i, freq_idx] < frame_thresh:
                    k += 1
                else:
                    k = 0
                remaining_energy[i, freq_idx] = 0
                if freq_idx < MAX_FREQ_IDX:
                    remaining_energy[i, freq_idx + 1] = 0
                if freq_idx > 0:
                    remaining_energy[i, freq_idx - 1] = 0
                i -= 1
            i_start = i + 1 + k

            if i_end - i_start <= min_note_len:
                continue

            amplitude = float(np.mean(frames[i_start:i_end, freq_idx]))
            note_events.append((i_start, i_end, int(freq_idx + MIDI_OFFSET), amplitude))

    # Sort note events chronologically
    note_events.sort(key=lambda x: (x[0], x[2]))
    return note_events


def extract_pitch_bends(
    contours: np.ndarray,
    note_events: List[Tuple[int, int, int, float]],
    n_bins_tolerance: int = 25,
) -> List[Tuple[int, int, int, float, Optional[List[int]]]]:
    """Compute pitch bend values along note durations using gaussian smoothed contours."""
    window_length = n_bins_tolerance * 2 + 1
    freq_gaussian = scipy.signal.windows.gaussian(window_length, std=5)
    results = []

    for start_idx, end_idx, pitch_midi, amplitude in note_events:
        freq_idx = (pitch_midi - MIDI_OFFSET) * CONTOURS_BINS_PER_SEMITONE
        freq_start_idx = max(freq_idx - n_bins_tolerance, 0)
        freq_end_idx = min(N_FREQ_BINS_CONTOURS, freq_idx + n_bins_tolerance + 1)

        gauss_slice = freq_gaussian[
            max(0, n_bins_tolerance - freq_idx) : window_length - max(0, freq_idx - (N_FREQ_BINS_CONTOURS - n_bins_tolerance - 1))
        ]

        submatrix = contours[start_idx:end_idx, freq_start_idx:freq_end_idx] * gauss_slice
        pb_shift = n_bins_tolerance - max(0, n_bins_tolerance - freq_idx)

        bends = (np.argmax(submatrix, axis=1) - pb_shift).tolist() if len(submatrix) > 0 else []
        results.append((start_idx, end_idx, pitch_midi, amplitude, bends))

    return results


def save_as_midi(
    note_events_timed: List[Tuple[float, float, int, float, Optional[List[int]]]],
    output_path: str,
    tempo: float = 120.0,
    include_pitch_bends: bool = True,
):
    """Save parsed note events into standard MIDI file (.mid)."""
    mid = pretty_midi.PrettyMIDI(initial_tempo=tempo)
    piano_program = pretty_midi.instrument_name_to_program("Acoustic Grand Piano")
    instrument = pretty_midi.Instrument(program=piano_program)

    for start_time, end_time, pitch, amplitude, bends in note_events_timed:
        vel = int(np.clip(round(DEFAULT_MIDI_VELOCITY_SCALE * amplitude), 20, 127))
        note = pretty_midi.Note(
            velocity=vel,
            pitch=pitch,
            start=start_time,
            end=end_time,
        )
        instrument.notes.append(note)

        if include_pitch_bends and bends:
            bend_times = np.linspace(start_time, end_time, len(bends))
            bend_ticks = np.round(np.array(bends) * PITCH_BEND_SCALE / CONTOURS_BINS_PER_SEMITONE).astype(int)
            bend_ticks = np.clip(bend_ticks, -N_PITCH_BEND_TICKS, N_PITCH_BEND_TICKS - 1)
            for pb_time, pb_val in zip(bend_times, bend_ticks):
                instrument.pitch_bends.append(pretty_midi.PitchBend(int(pb_val), float(pb_time)))

    mid.instruments.append(instrument)
    mid.write(output_path)


def transcribe(
    audio_path: str,
    model_path: str,
    output_midi_path: str,
    onset_thresh: float = 0.5,
    frame_thresh: float = 0.3,
    min_note_len_ms: float = 127.7,
    tempo: float = 120.0,
    include_pitch_bends: bool = True,
) -> Dict[str, Any]:
    """Execute complete end-to-end transcription pipeline."""
    t0 = time.time()

    # 1. Decode audio
    audio = load_audio(audio_path)
    audio_orig_len = audio.shape[0]
    duration_s = float(audio_orig_len) / AUDIO_SAMPLE_RATE

    if audio_orig_len < AUDIO_SAMPLE_RATE * 0.1:
        raise ValueError("Audio is too short (less than 100ms).")

    # 2. Window and run ONNX session
    overlap_frames = DEFAULT_OVERLAPPING_FRAMES
    overlap_samples = overlap_frames * FFT_HOP
    hop_size = AUDIO_N_SAMPLES - overlap_samples

    audio_padded = np.concatenate([np.zeros((int(overlap_samples / 2),), dtype=np.float32), audio])
    
    # Batch collection
    windows = list(window_audio_signal(audio_padded, hop_size))
    if not windows:
        windows = [np.zeros((AUDIO_N_SAMPLES, 1), dtype=np.float32)]

    batch_arr = np.stack(windows, axis=0)  # (N, AUDIO_N_SAMPLES, 1)

    # Initialize ONNX runtime session with GPU/CPU fallback
    providers = ["CPUExecutionProvider"]
    if "CUDAExecutionProvider" in ort.get_available_providers():
        providers.insert(0, "CUDAExecutionProvider")

    session = ort.InferenceSession(model_path, providers=providers)
    
    # Run batch inference
    # Outputs: note (StatefulPartitionedCall:1), onset (StatefulPartitionedCall:2), contour (StatefulPartitionedCall:0)
    ort_res = session.run(
        ["StatefulPartitionedCall:1", "StatefulPartitionedCall:2", "StatefulPartitionedCall:0"],
        {"serving_default_input_2:0": batch_arr.astype(np.float32)},
    )
    batch_notes, batch_onsets, batch_contours = ort_res[0], ort_res[1], ort_res[2]

    # 3. Unwrap overlapping frames
    notes_matrix = unwrap_model_output(batch_notes, audio_orig_len, overlap_frames, hop_size)
    onsets_matrix = unwrap_model_output(batch_onsets, audio_orig_len, overlap_frames, hop_size)
    contours_matrix = unwrap_model_output(batch_contours, audio_orig_len, overlap_frames, hop_size)

    # 4. Decode notes
    min_note_len_frames = int(round(min_note_len_ms / 1000.0 * (AUDIO_SAMPLE_RATE / FFT_HOP)))
    raw_notes = decode_polyphonic_notes(
        notes_matrix,
        onsets_matrix,
        onset_thresh=onset_thresh,
        frame_thresh=frame_thresh,
        min_note_len=min_note_len_frames,
    )

    # 5. Extract pitch bends
    if include_pitch_bends:
        notes_with_bends = extract_pitch_bends(contours_matrix, raw_notes)
    else:
        notes_with_bends = [(n[0], n[1], n[2], n[3], None) for n in raw_notes]

    # 6. Map frame numbers to time seconds
    time_grid = model_frames_to_seconds(notes_matrix.shape[0])
    timed_events: List[Tuple[float, float, int, float, Optional[List[int]]]] = []
    
    for start_f, end_f, pitch, amp, bends in notes_with_bends:
        t_start = float(time_grid[min(start_f, len(time_grid) - 1)])
        t_end = float(time_grid[min(end_f, len(time_grid) - 1)])
        if t_end <= t_start:
            t_end = t_start + 0.05
        timed_events.append((t_start, t_end, pitch, amp, bends))

    # 7. Write MIDI file
    save_as_midi(timed_events, output_midi_path, tempo=tempo, include_pitch_bends=include_pitch_bends)

    elapsed_s = time.time() - t0

    # Format JSON payload for GUI
    formatted_notes = []
    for start_t, end_t, pitch, amp, bends in timed_events:
        formatted_notes.append({
            "start": round(start_t, 4),
            "end": round(end_t, 4),
            "duration": round(end_t - start_t, 4),
            "pitch": int(pitch),
            "velocity": int(np.clip(round(DEFAULT_MIDI_VELOCITY_SCALE * amp), 20, 127)),
            "amplitude": round(float(amp), 4),
            "bends": bends[:20] if bends else None  # preview bends
        })

    return {
        "status": "success",
        "audio_duration_seconds": round(duration_s, 2),
        "note_count": len(formatted_notes),
        "processing_time_seconds": round(elapsed_s, 3),
        "output_midi": output_midi_path,
        "notes": formatted_notes,
    }


def main():
    parser = argparse.ArgumentParser(description="Spotify Basic Pitch ONNX Transcriber for Flowork OS")
    parser.add_argument("--input", "-i", required=True, help="Input audio file")
    parser.add_argument("--output-midi", "-o", required=True, help="Output MIDI (.mid) file")
    parser.add_argument("--output-json", "-j", help="Output JSON results path")
    parser.add_argument("--model-path", "-m", help="Path to nmp.onnx model")
    parser.add_argument("--onset-thresh", type=float, default=0.5, help="Onset threshold (0.0 to 1.0)")
    parser.add_argument("--frame-thresh", type=float, default=0.3, help="Frame threshold (0.0 to 1.0)")
    parser.add_argument("--min-note-len", type=float, default=127.7, help="Minimum note length in milliseconds")
    parser.add_argument("--tempo", type=float, default=120.0, help="Output MIDI tempo BPM")
    parser.add_argument("--no-pitch-bends", action="store_true", help="Disable pitch bends")

    args = parser.parse_args()

    # Resolve default model path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = args.model_path or os.path.join(script_dir, "models", "nmp.onnx")

    try:
        res = transcribe(
            audio_path=args.input,
            model_path=model_path,
            output_midi_path=args.output_midi,
            onset_thresh=args.onset_thresh,
            frame_thresh=args.frame_thresh,
            min_note_len_ms=args.min_note_len,
            tempo=args.tempo,
            include_pitch_bends=not args.no_pitch_bends,
        )

        out_json_str = json.dumps(res, indent=2)
        if args.output_json:
            with open(args.output_json, "w", encoding="utf-8") as f:
                f.write(out_json_str)
        
        print(out_json_str)
        sys.exit(0)

    except Exception as e:
        err_payload = {"status": "error", "message": str(e)}
        print(json.dumps(err_payload), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
