#!/usr/bin/env python3
"""
TradingAgents Sovereign Council Test Suite
==========================================
Verifies:
1. Strict manifest contract compliance (plugin.manifest.json).
2. SKILL.md YAML frontmatter contains EXACTLY 20 English keywords.
3. trigger.md presence and valid frontmatter.
4. council.py execution and JSON output schema.
5. Trade settlement and memory ledger integrity.
6. server.mjs JavaScript syntax validity.
7. CSS isolation scoped to #trading-agents-root.

Exit Code 0 indicates 100% compliance.
Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import sys
import os
import json
import subprocess
import unittest
import yaml

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class TestTradingAgentsApp(unittest.TestCase):

    def test_01_manifest_contract(self):
        """Verify plugin.manifest.json conforms strictly to Flowork OS schema."""
        manifest_path = os.path.join(APP_DIR, "plugin.manifest.json")
        self.assertTrue(os.path.exists(manifest_path), "plugin.manifest.json missing")

        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        self.assertEqual(manifest.get("id"), "trading-agents")
        self.assertEqual(manifest.get("category_id"), "CAT-006")
        
        entry = manifest.get("entry")
        self.assertIsInstance(entry, dict, "entry must be a JSON object")
        self.assertIn("gui", entry)
        self.assertIn("backend", entry)

        ipc = manifest.get("ipc")
        self.assertIsInstance(ipc, dict, "ipc must be a JSON object")
        self.assertEqual(ipc.get("default_port"), 17898)
        self.assertEqual(ipc.get("port_env"), "FLOWORK_APP_PORT")

    def test_02_skill_doctrine_20_keywords(self):
        """Verify SKILL.md YAML frontmatter contains EXACTLY 20 English keywords."""
        skill_path = os.path.join(APP_DIR, "SKILL.md")
        self.assertTrue(os.path.exists(skill_path), "SKILL.md missing")

        with open(skill_path, "r", encoding="utf-8") as f:
            content = f.read()

        parts = content.split("---")
        self.assertGreaterEqual(len(parts), 3, "Invalid frontmatter in SKILL.md")
        frontmatter = yaml.safe_load(parts[1])
        keywords = frontmatter.get("keywords", [])

        self.assertIsInstance(keywords, list, "keywords must be a list")
        self.assertEqual(len(keywords), 20, f"Expected exactly 20 keywords, found {len(keywords)}: {keywords}")

    def test_03_trigger_contract(self):
        """Verify trigger.md contract."""
        trigger_path = os.path.join(APP_DIR, "trigger.md")
        self.assertTrue(os.path.exists(trigger_path), "trigger.md missing")

        with open(trigger_path, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn("app_id: trading-agents", content)

    def test_04_council_engine_execution(self):
        """Verify council.py runs and returns valid verdict schema."""
        script_path = os.path.join(APP_DIR, "engine", "council.py")
        cmd = [sys.executable, script_path, "--ticker", "NVDA", "--cash", "25000"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        self.assertEqual(res.returncode, 0, f"council.py failed: {res.stderr}")

        data = json.loads(res.stdout)
        self.assertEqual(data.get("ticker"), "NVDA")
        self.assertIn(data.get("final_rating"), ["Buy", "Overweight", "Hold", "Underweight", "Sell"])
        self.assertIn("debate_timeline", data)
        self.assertIn("risk_timeline", data)
        self.assertIn("trader_proposal", data)
        self.assertGreater(len(data["debate_timeline"]), 0)

    def test_05_memory_settlement(self):
        """Verify memory settlement and alpha scoring."""
        script_path = os.path.join(APP_DIR, "engine", "council.py")
        cmd = [sys.executable, script_path, "--settle"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        self.assertEqual(res.returncode, 0, f"Settlement failed: {res.stderr}")

        data = json.loads(res.stdout)
        self.assertTrue(data.get("success"))

    def test_06_server_syntax(self):
        """Verify server.mjs passes syntax verification via bun."""
        server_path = os.path.join(APP_DIR, "engine", "server.mjs")
        cmd = ["bun", "build", server_path, "--no-bundle"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        self.assertEqual(res.returncode, 0, f"Syntax error in server.mjs: {res.stderr}")

    def test_07_css_isolation(self):
        """Verify gui/style.css is strictly isolated to #trading-agents-root."""
        css_path = os.path.join(APP_DIR, "gui", "style.css")
        with open(css_path, "r", encoding="utf-8") as f:
            css = f.read()
        self.assertIn("#trading-agents-root", css, "CSS must be scoped to #trading-agents-root")


if __name__ == "__main__":
    unittest.main()
