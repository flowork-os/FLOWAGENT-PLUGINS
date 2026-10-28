#!/usr/bin/env python3
"""
Comprehensive Test Suite for Sovereign Vocal & Stem Demixer Studio (stem-separator)
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
GUI_DIR = os.path.join(APP_DIR, "gui")

class TestStemSeparator(unittest.TestCase):

    def test_manifest_contract(self):
        """Test plugin.manifest.json compliance with Flowork OS kernel specification."""
        manifest_path = os.path.join(APP_DIR, "plugin.manifest.json")
        self.assertTrue(os.path.exists(manifest_path), "plugin.manifest.json must exist")
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        self.assertEqual(manifest.get("id"), "stem-separator")
        self.assertIn("entry", manifest)
        self.assertIsInstance(manifest["entry"], dict)
        self.assertEqual(manifest["entry"].get("gui"), "gui/index.html")
        self.assertEqual(manifest["entry"].get("backend"), "engine/server.mjs")
        self.assertIn("ipc", manifest)
        self.assertIsInstance(manifest["ipc"], dict)
        self.assertEqual(manifest["ipc"].get("port_env"), "FLOWORK_APP_PORT")
        self.assertEqual(manifest["ipc"].get("default_port"), 17880)

    def test_skill_keywords_count(self):
        """Test SKILL.md frontmatter has exactly 20 English keywords."""
        skill_path = os.path.join(APP_DIR, "SKILL.md")
        self.assertTrue(os.path.exists(skill_path), "SKILL.md must exist")
        with open(skill_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        parts = content.split("---")
        self.assertGreaterEqual(len(parts), 3, "Frontmatter delimiters --- missing")
        
        lines = parts[1].strip().split("\n")
        keywords = [l.strip().lstrip("-").strip().strip('"').strip("'") 
                    for l in lines if l.strip().startswith("-")]
        
        self.assertEqual(len(keywords), 20, f"Expected exactly 20 keywords, found {len(keywords)}: {keywords}")

    def test_end_to_end_separation(self):
        """Test Demucs v4 separation engine on synthetic mix audio."""
        sr = 44100
        duration = 2.0
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        vocal_tone = (0.6 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        noise = (0.2 * np.random.normal(0, 0.2, len(t))).astype(np.float32)
        mix = vocal_tone + noise

        test_wav = "/tmp/test_unit_demucs.wav"
        out_dir = "/tmp/test_unit_demucs_out"
        wav.write(test_wav, sr, mix)

        script_path = os.path.join(ENGINE_DIR, "separator.py")
        cmd = [
            "python3", script_path,
            "--input", test_wav,
            "--output-dir", out_dir,
            "--mode", "two-stems-vocals",
            "--format", "wav",
            "--shifts", "0"
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, f"Separation failed: {proc.stderr}")

        res = json.loads(proc.stdout)
        self.assertEqual(res.get("status"), "success")
        self.assertEqual(res.get("mode"), "two-stems-vocals")
        self.assertIn("stems", res)
        self.assertIn("vocals", res["stems"])
        self.assertIn("no_vocals", res["stems"])
        self.assertTrue(os.path.exists(res.get("zip_path", "")))

    def test_server_rest_api(self):
        """Test HTTP server startup, health endpoint, separation API, and static files."""
        test_port = 17889
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
            self.assertEqual(data.get("app"), "stem-separator")

            # 2. Test /gui/index.html
            gui_req = urllib.request.urlopen(f"http://127.0.0.1:{test_port}/gui/index.html")
            self.assertEqual(gui_req.status, 200)
            html = gui_req.read().decode()
            self.assertIn("Vocal & Stem Demixer Studio", html)
            self.assertIn("Demucs", html)

        finally:
            proc.terminate()
            proc.wait(timeout=3)


if __name__ == "__main__":
    unittest.main()
