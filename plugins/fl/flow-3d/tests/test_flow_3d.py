#!/usr/bin/env python3
"""
Flow3D Studio - Comprehensive QA & Dual Verification Test Suite
Tests contracts, keywords (exact 20), security DLP (zero path leaks), strict English, and live server endpoints.
"""

import os
import sys
import json
import yaml
import re
import unittest
import subprocess
import time
import urllib.request

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class TestFlow3DStudio(unittest.TestCase):

    def test_01_manifest_contract(self):
        """Verify plugin.manifest.json structure, ports, and metadata."""
        manifest_path = os.path.join(APP_DIR, "plugin.manifest.json")
        self.assertTrue(os.path.exists(manifest_path), "plugin.manifest.json missing")

        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        self.assertEqual(manifest.get("id"), "flow-3d")
        self.assertEqual(manifest.get("name"), "Flow3D Studio")
        self.assertEqual(manifest.get("category_id"), "CAT-018")
        self.assertIn("gui", manifest.get("entry", {}))
        self.assertIn("backend", manifest.get("entry", {}))
        self.assertEqual(manifest.get("ipc", {}).get("default_port"), 17897)
        self.assertEqual(manifest.get("ipc", {}).get("port_env"), "FLOWORK_APP_PORT")

    def test_02_trigger_contract(self):
        """Verify trigger.md exists and has valid YAML frontmatter."""
        trigger_path = os.path.join(APP_DIR, "trigger.md")
        self.assertTrue(os.path.exists(trigger_path), "trigger.md missing")

        with open(trigger_path, "r", encoding="utf-8") as f:
            content = f.read()

        match = re.match(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
        self.assertIsNotNone(match, "trigger.md frontmatter missing")
        fm = yaml.safe_load(match.group(1))
        self.assertEqual(fm.get("id"), "flow-3d")
        self.assertGreater(len(fm.get("triggers", [])), 0)

    def test_03_skill_20_keywords(self):
        """Verify SKILL.md has EXACTLY 20 English keywords."""
        skill_path = os.path.join(APP_DIR, "SKILL.md")
        self.assertTrue(os.path.exists(skill_path), "SKILL.md missing")

        with open(skill_path, "r", encoding="utf-8") as f:
            content = f.read()

        match = re.match(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
        self.assertIsNotNone(match, "SKILL.md frontmatter missing")
        fm = yaml.safe_load(match.group(1))
        keywords = fm.get("keywords", [])
        self.assertIsInstance(keywords, list, "keywords must be a YAML list")
        self.assertEqual(
            len(keywords),
            20,
            f"SKILL.md must have EXACTLY 20 keywords, found {len(keywords)}: {keywords}"
        )

    def test_04_security_zero_path_leaks(self):
        """Verify zero illegal hardcoded paths in application logic."""
        forbidden = ["/home/mrflow/flowork/apps", "/home/mrflow/flowork/system"]
        scanned_count = 0

        for root, dirs, files in os.walk(APP_DIR):
            if "node_modules" in dirs:
                dirs.remove("node_modules")
            if ".git" in dirs:
                dirs.remove(".git")
            for file in files:
                if file.endswith((".mjs", ".js", ".py", ".html", ".css", ".json")):
                    # Skip the test suite itself if referencing paths
                    if file == "test_flow_3d.py":
                        continue
                    filepath = os.path.join(root, file)
                    scanned_count += 1
                    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                        text = f.read()
                        for leak in forbidden:
                            self.assertNotIn(
                                leak,
                                text,
                                f"Security DLP Violation: Found hardcoded '{leak}' in {filepath}"
                            )

        self.assertGreater(scanned_count, 4, "Should scan at least 5 app files")

    def test_05_strict_english_gui(self):
        """Verify GUI files contain 100% standard English."""
        id_words = ["unduh", "unggah", "kirim", "simpan", "keluar", "batal", "berhasil", "gagal"]
        gui_files = [
            os.path.join(APP_DIR, "gui", "index.html"),
            os.path.join(APP_DIR, "gui", "app.js")
        ]

        for filepath in gui_files:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read().lower()
                for word in id_words:
                    self.assertNotIn(
                        f" {word} ",
                        content,
                        f"Strict English violation: found foreign word '{word}' in {filepath}"
                    )

    def test_06_server_engine_api(self):
        """Launch server on test port and verify API endpoints."""
        test_port = 17896
        env = os.environ.copy()
        env["FLOWORK_APP_PORT"] = str(test_port)

        server_proc = subprocess.Popen(
            ["node", os.path.join(APP_DIR, "engine", "server.mjs")],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

        try:
            time.sleep(1.2)

            # 1. Health check
            req = urllib.request.Request(f"http://127.0.0.1:{test_port}/api/health")
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode())
                self.assertEqual(data.get("status"), "ok")
                self.assertEqual(data.get("app"), "flow-3d")

            # 2. Stats check
            req = urllib.request.Request(f"http://127.0.0.1:{test_port}/api/stats")
            with urllib.request.urlopen(req, timeout=3) as resp:
                stats = json.loads(resp.read().decode())
                self.assertIn("breakdown", stats)
                self.assertGreater(stats.get("total_models", 0), 1000)

            # 3. Assets search
            req = urllib.request.Request(f"http://127.0.0.1:{test_port}/api/assets?modality=threejs&limit=5")
            with urllib.request.urlopen(req, timeout=3) as resp:
                assets = json.loads(resp.read().decode())
                self.assertGreater(len(assets.get("items", [])), 0)

            # 4. AI Generate
            gen_payload = json.dumps({"prompt": "cyberpunk recon drone", "modality": "threejs"}).encode()
            req = urllib.request.Request(
                f"http://127.0.0.1:{test_port}/api/generate",
                data=gen_payload,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                gen_data = json.loads(resp.read().decode())
                self.assertTrue(gen_data.get("success"))
                self.assertIn("threejs", gen_data.get("result", {}).get("modality"))

            # 5. Multi-Modality 3D WebGL Scene Rendering
            modalities = ["cadquery", "openscad", "bioinspired3d", "blender"]
            rendered_scenes = {}
            for mod in modalities:
                req = urllib.request.Request(f"http://127.0.0.1:{test_port}/api/scene/{mod}/sample_asset_{mod}/render")
                with urllib.request.urlopen(req, timeout=3) as resp:
                    html = resp.read().decode()
                    self.assertIn(f"⚡ {mod.upper()} — PROCEDURAL 3D CAD", html)
                    self.assertIn("import * as THREE", html)
                    self.assertIn("OrbitControls", html)
                    rendered_scenes[mod] = html

            # 6. Verify Deterministic Variety (No two fallback assets are identical)
            req_a = urllib.request.Request(f"http://127.0.0.1:{test_port}/api/scene/cadquery/part_alpha/render")
            req_b = urllib.request.Request(f"http://127.0.0.1:{test_port}/api/scene/cadquery/part_beta/render")
            with urllib.request.urlopen(req_a, timeout=3) as resp_a, urllib.request.urlopen(req_b, timeout=3) as resp_b:
                html_a = resp_a.read().decode()
                html_b = resp_b.read().decode()
                self.assertNotEqual(html_a, html_b, "Different assets must generate distinct 3D procedural scenes!")

        finally:
            server_proc.terminate()
            server_proc.wait(timeout=2)

    def test_07_turntable_transcode_synthetic(self):
        """Verify turntable.py video transcode pipeline with FFmpeg."""
        turntable_script = os.path.join(APP_DIR, "engine", "turntable.py")
        temp_dir = os.path.join(APP_DIR, "data", "test_scratch")
        os.makedirs(temp_dir, exist_ok=True)

        synth_in = os.path.join(temp_dir, "synth_in.mp4")
        synth_out = os.path.join(temp_dir, "synth_out.mp4")

        # Generate 1s synthetic video
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30",
            "-t", "1", "-c:v", "libx264", synth_in
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        try:
            # Run turntable.py
            cmd = ["python3", turntable_script, synth_in, synth_out, "9:16", "30"]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            self.assertEqual(res.returncode, 0, f"turntable.py failed: {res.stderr}")

            self.assertTrue(os.path.exists(synth_out))
            self.assertGreater(os.path.getsize(synth_out), 1000)
        finally:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    unittest.main()
