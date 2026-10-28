#!/usr/bin/env python3
"""
Comprehensive Test Suite for Sovereign Audio-to-MIDI Neural Studio (midi-extractor)
"""

import os
import sys
import json
import time
import urllib.request
import subprocess
import unittest
import numpy as np
import scipy.io.wavfile as wav

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE_DIR = os.path.join(APP_DIR, "engine")
MODELS_DIR = os.path.join(ENGINE_DIR, "models")
GUI_DIR = os.path.join(APP_DIR, "gui")

class TestMidiExtractor(unittest.TestCase):

    def test_manifest_contract(self):
        """Test plugin.manifest.json compliance with Flowork OS kernel specification."""
        manifest_path = os.path.join(APP_DIR, "plugin.manifest.json")
        self.assertTrue(os.path.exists(manifest_path), "plugin.manifest.json must exist")
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        self.assertEqual(manifest.get("id"), "midi-extractor")
        self.assertIn("entry", manifest)
        self.assertIsInstance(manifest["entry"], dict)
        self.assertEqual(manifest["entry"].get("gui"), "gui/index.html")
        self.assertEqual(manifest["entry"].get("backend"), "engine/server.mjs")
        self.assertIn("ipc", manifest)
        self.assertIsInstance(manifest["ipc"], dict)
        self.assertEqual(manifest["ipc"].get("port_env"), "FLOWORK_APP_PORT")
        self.assertEqual(manifest["ipc"].get("default_port"), 17870)

    def test_skill_keywords_count(self):
        """Test SKILL.md frontmatter has exactly 20 English keywords."""
        skill_path = os.path.join(APP_DIR, "SKILL.md")
        self.assertTrue(os.path.exists(skill_path), "SKILL.md must exist")
        with open(skill_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        parts = content.split("---")
        self.assertGreaterEqual(len(parts), 3, "Frontmatter delimiters --- missing")
        
        # Parse keywords lines
        lines = parts[1].strip().split("\n")
        keywords = [l.strip().lstrip("-").strip().strip('"').strip("'") 
                    for l in lines if l.strip().startswith("-")]
        
        self.assertEqual(len(keywords), 20, f"Expected exactly 20 keywords, found {len(keywords)}: {keywords}")

    def test_onnx_model_presence(self):
        """Test that Spotify Basic Pitch ONNX model is present and non-empty."""
        model_path = os.path.join(MODELS_DIR, "nmp.onnx")
        self.assertTrue(os.path.exists(model_path), f"ONNX model missing at {model_path}")
        size = os.path.getsize(model_path)
        self.assertGreater(size, 100000, f"ONNX model size {size} bytes is suspiciously small")

    def test_end_to_end_transcription(self):
        """Test transcription script on synthetic 440 Hz (A4) sine wave."""
        sr = 22050
        duration = 1.0
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        sine_wave = (0.7 * np.sin(2 * np.pi * 440.0 * t)).astype(np.float32)

        test_wav = "/tmp/test_unit_sine.wav"
        test_mid = "/tmp/test_unit_sine.mid"
        wav.write(test_wav, sr, sine_wave)

        script_path = os.path.join(ENGINE_DIR, "transcribe_onnx.py")
        cmd = [
            "python3", script_path,
            "--input", test_wav,
            "--output-midi", test_mid,
            "--onset-thresh", "0.4",
            "--frame-thresh", "0.25"
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, f"Transcription failed: {proc.stderr}")

        res = json.loads(proc.stdout)
        self.assertEqual(res.get("status"), "success")
        self.assertGreaterEqual(res.get("note_count", 0), 1)
        
        # Verify detected pitch is 69 (A4 = 440Hz)
        detected_pitches = [n["pitch"] for n in res.get("notes", [])]
        self.assertIn(69, detected_pitches, f"Expected MIDI note 69 (440Hz), got {detected_pitches}")

        # Verify output MIDI file exists and has size
        self.assertTrue(os.path.exists(test_mid))
        self.assertGreater(os.path.getsize(test_mid), 50)

    def test_server_rest_api(self):
        """Test HTTP server startup, health endpoint, transcribe API, and static files."""
        test_port = 17879
        env = os.environ.copy()
        env["FLOWORK_APP_PORT"] = str(test_port)

        server_path = os.path.join(ENGINE_DIR, "server.mjs")
        proc = subprocess.Popen(["node", server_path], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        time.sleep(1.5)

        try:
            # 1. Test /health
            req = urllib.request.urlopen(f"http://127.0.0.1:{test_port}/health")
            self.assertEqual(req.status, 200)
            data = json.loads(req.read().decode())
            self.assertEqual(data.get("status"), "ok")
            self.assertEqual(data.get("app"), "midi-extractor")
            self.assertTrue(data.get("modelReady"))

            # 2. Test /api/transcribe
            payload = json.dumps({"filePath": "/tmp/test_unit_sine.wav"}).encode()
            t_req = urllib.request.Request(
                f"http://127.0.0.1:{test_port}/api/transcribe",
                data=payload,
                headers={"Content-Type": "application/json"}
            )
            t_res = urllib.request.urlopen(t_req)
            self.assertEqual(t_res.status, 200)
            t_data = json.loads(t_res.read().decode())
            self.assertTrue(t_data.get("success"))
            self.assertIn("notes", t_data.get("data", {}))

            # 3. Test static GUI index.html
            gui_req = urllib.request.urlopen(f"http://127.0.0.1:{test_port}/gui/index.html")
            self.assertEqual(gui_req.status, 200)
            html = gui_req.read().decode()
            self.assertIn("Audio-to-MIDI Neural Studio", html)
            self.assertIn("piano-roll-canvas", html)

        finally:
            proc.terminate()
            proc.wait(timeout=3)


if __name__ == "__main__":
    unittest.main()
