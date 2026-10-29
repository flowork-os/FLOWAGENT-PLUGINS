#!/usr/bin/env python3
"""
AutoShorts Studio — Dual QA & Security Test Suite
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import unittest
import os
import json
import re
import subprocess

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

class TestAutoShortsStudio(unittest.TestCase):

    def test_01_manifest_contract(self):
        manifest_path = os.path.join(APP_DIR, "plugin.manifest.json")
        self.assertTrue(os.path.isfile(manifest_path), "plugin.manifest.json must exist")
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        self.assertEqual(manifest.get("id"), "auto-shorts")
        self.assertEqual(manifest.get("category_id"), "CAT-010")
        self.assertIn("entry", manifest)
        self.assertIn("gui", manifest["entry"])
        self.assertIn("backend", manifest["entry"])
        self.assertTrue(os.path.isfile(os.path.join(APP_DIR, manifest["entry"]["gui"])))
        self.assertTrue(os.path.isfile(os.path.join(APP_DIR, manifest["entry"]["backend"])))
        self.assertEqual(manifest.get("ipc", {}).get("default_port"), 17899)

    def test_02_skill_keywords_count(self):
        skill_path = os.path.join(APP_DIR, "SKILL.md")
        self.assertTrue(os.path.isfile(skill_path), "SKILL.md must exist")
        with open(skill_path, "r", encoding="utf-8") as f:
            content = f.read()

        parts = content.split("---")
        self.assertGreaterEqual(len(parts), 3, "SKILL.md must have valid YAML frontmatter")
        frontmatter = parts[1]

        # Extract keywords
        kw_lines = re.findall(r'-\s+"([^"]+)"', frontmatter)
        self.assertEqual(len(kw_lines), 20, f"SKILL.md must have EXACTLY 20 keywords, found {len(kw_lines)}")

    def test_03_trigger_contract(self):
        trigger_path = os.path.join(APP_DIR, "trigger.md")
        self.assertTrue(os.path.isfile(trigger_path), "trigger.md must exist")
        with open(trigger_path, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn("PLUGIN-AUTO-SHORTS-TRIGGER", content)
        self.assertIn("CAT-010", content)
        self.assertIn("autoshorts", content)

    def test_04_no_hardcoded_host_paths(self):
        forbidden_prefix = "/home/" + "mrflow"
        for root, dirs, files in os.walk(APP_DIR):
            if "data" in root or "tests" in root or ".git" in root:
                continue
            for fname in files:
                if fname.endswith((".mjs", ".js", ".html", ".css", ".py", ".json", ".md")):
                    fpath = os.path.join(root, fname)
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                        text = f.read()
                        self.assertNotIn(forbidden_prefix, text, f"Hardcoded path leak in {fpath}")

    def test_05_strict_english_gui(self):
        index_path = os.path.join(APP_DIR, "gui", "index.html")
        with open(index_path, "r", encoding="utf-8") as f:
            html = f.read()

        # Check for forbidden non-English tokens
        forbidden_tokens = ["unduh", "unggah", "simpan", "keluar", "hapus", "cari", "pilih", "pengaturan"]
        for tok in forbidden_tokens:
            self.assertNotIn(tok, html.lower(), f"Non-English word '{tok}' found in gui/index.html")

    def test_06_cropper_probe_and_crop(self):
        scratch_dir = os.environ.get("FLOWORK_SCRATCH", os.path.join(os.path.expanduser("~"), ".FL_BIN", "scratch"))
        test_video = os.path.join(scratch_dir, "sample_shorts_video.mp4")
        if not os.path.isfile(test_video):
            self.skipTest("Sample video not found")

        cropper_script = os.path.join(APP_DIR, "engine", "cropper.py")
        res = subprocess.run(["python3", cropper_script, "probe", "--source", test_video], stdout=subprocess.PIPE, text=True)
        self.assertEqual(res.returncode, 0)
        data = json.loads(res.stdout)
        self.assertEqual(data.get("status"), "SUCCESS")
        self.assertEqual(data.get("width"), 1920)
        self.assertEqual(data.get("height"), 1080)

    def test_07_server_upload_and_endpoints(self):
        import urllib.request
        import time

        test_port = 17905
        env = os.environ.copy()
        env["FLOWORK_APP_PORT"] = str(test_port)
        env["FLOWORK_TEST_MODE"] = "1"
        server_path = os.path.join(APP_DIR, "engine", "server.mjs")
        
        proc = subprocess.Popen(["node", server_path], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        time.sleep(0.5)
        try:
            # 1. Test /api/status
            req = urllib.request.Request(f"http://127.0.0.1:{test_port}/api/status")
            with urllib.request.urlopen(req, timeout=3) as resp:
                self.assertEqual(resp.status, 200)
                status_data = json.loads(resp.read().decode())
                self.assertEqual(status_data.get("status"), "SUCCESS")

            # 2. Test /api/upload
            dummy_content = b"TEST_VIDEO_PAYLOAD_SOVEREIGN"
            upload_req = urllib.request.Request(
                f"http://127.0.0.1:{test_port}/api/upload",
                data=dummy_content,
                headers={"x-filename": "test_sample.mp4", "Content-Type": "application/octet-stream"},
                method="POST"
            )
            with urllib.request.urlopen(upload_req, timeout=3) as resp:
                self.assertEqual(resp.status, 200)
                upload_data = json.loads(resp.read().decode())
                self.assertTrue(upload_data.get("success"))
                uploaded_file = upload_data.get("filePath")
                self.assertTrue(os.path.isfile(uploaded_file))
                if os.path.isfile(uploaded_file):
                    os.remove(uploaded_file)

            # 3. Test /api/pick-file route exists and returns valid JSON without crashing
            pick_req = urllib.request.Request(f"http://127.0.0.1:{test_port}/api/pick-file", method="POST")
            with urllib.request.urlopen(pick_req, timeout=3) as resp:
                self.assertEqual(resp.status, 200)
                pick_data = json.loads(resp.read().decode())
                self.assertIn("success", pick_data)
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except Exception:
                proc.kill()
            if proc.stdout:
                proc.stdout.close()
            if proc.stderr:
                proc.stderr.close()

    def test_08_render_vertical_clip_pts_normalized(self):
        import tempfile
        tmp_dir = tempfile.gettempdir()
        test_src = os.path.join(tmp_dir, "test_render_src.mp4")
        test_out = os.path.join(tmp_dir, "test_render_out.mp4")

        # Generate 1s 60fps 1080p source video
        gen_cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=60:duration=1",
            "-f", "lavfi", "-i", "sine=frequency=1000:duration=1",
            "-c:v", "libx264", "-c:a", "aac",
            test_src
        ]
        subprocess.run(gen_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        try:
            cropper_script = os.path.join(APP_DIR, "engine", "cropper.py")
            render_cmd = [
                "python3", cropper_script, "render",
                "--source", test_src,
                "--start", "0", "--end", "1",
                "--output", test_out,
                "--crop-focus", "center"
            ]
            res = subprocess.run(render_cmd, stdout=subprocess.PIPE, text=True)
            self.assertEqual(res.returncode, 0)
            data = json.loads(res.stdout)
            self.assertEqual(data.get("status"), "SUCCESS")

            # Verify PTS start time is 0.000000 and framerate normalized to 30 fps
            probe_cmd = [
                "ffprobe", "-v", "error",
                "-show_entries", "stream=r_frame_rate,start_time",
                "-of", "json",
                test_out
            ]
            probe_res = subprocess.run(probe_cmd, stdout=subprocess.PIPE, text=True)
            probe_data = json.loads(probe_res.stdout)
            v_stream = probe_data["streams"][0]
            self.assertEqual(v_stream["start_time"], "0.000000")
            self.assertEqual(v_stream["r_frame_rate"], "30/1")

            # Verify moov atom is at start of file (+faststart)
            with open(test_out, "rb") as f:
                header = f.read(1024)
                self.assertIn(b"moov", header, "moov atom must be in the first 1KB for HTML5 faststart")
        finally:
            if os.path.isfile(test_src):
                os.remove(test_src)
            if os.path.isfile(test_out):
                os.remove(test_out)

if __name__ == "__main__":
    unittest.main()
