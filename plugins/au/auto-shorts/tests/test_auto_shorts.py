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

if __name__ == "__main__":
    unittest.main()
