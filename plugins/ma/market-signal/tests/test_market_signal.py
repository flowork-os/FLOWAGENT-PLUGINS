#!/usr/bin/env python3
"""
Test Suite for Market Signal & Swing Automation Studio
======================================================
Verifies contract compliance, 20-keyword frontmatter, technical math functions,
synthetic trade plans, and security cleanliness.

Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import os
import sys
import json
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT_DIR, "engine"))

from scanner import compute_rsi, compute_ema, compute_macd, compute_bollinger

class TestMarketSignalStudio(unittest.TestCase):

    def test_01_manifest_contract(self):
        manifest_path = os.path.join(ROOT_DIR, "plugin.manifest.json")
        self.assertTrue(os.path.exists(manifest_path), "Missing plugin.manifest.json")
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        self.assertEqual(manifest.get("id"), "market-signal")
        self.assertEqual(manifest.get("category_id"), "CAT-006")
        self.assertIn("gui", manifest.get("entry", {}))
        self.assertIn("backend", manifest.get("entry", {}))
        self.assertIn("default_port", manifest.get("ipc", {}))

    def test_02_skill_frontmatter_keywords(self):
        skill_path = os.path.join(ROOT_DIR, "SKILL.md")
        self.assertTrue(os.path.exists(skill_path), "Missing SKILL.md")
        with open(skill_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        self.assertTrue(content.startswith("---"), "SKILL.md must start with frontmatter")
        parts = content.split("---", 2)
        self.assertGreaterEqual(len(parts), 3, "Invalid frontmatter delimiters")
        fm_lines = parts[1].strip().split("\n")
        
        keywords = []
        in_kw = False
        for line in fm_lines:
            line_s = line.strip()
            if line_s == "keywords:":
                in_kw = True
                continue
            if in_kw:
                if line_s.startswith("-"):
                    keywords.append(line_s.lstrip("-").strip())
                elif line_s.endswith(":") or not line_s:
                    break
                    
        self.assertEqual(len(keywords), 20, f"SKILL.md must have EXACTLY 20 keywords, found {len(keywords)}: {keywords}")

    def test_03_technical_math_indicators(self):
        # 1. RSI test
        steady_gains = [10.0 + i * 2.0 for i in range(25)]
        rsi_bull = compute_rsi(steady_gains, 14)
        self.assertGreater(rsi_bull[-1], 80.0, "Consistent gains must yield high RSI")
        
        steady_losses = [50.0 - i * 1.5 for i in range(25)]
        rsi_bear = compute_rsi(steady_losses, 14)
        self.assertLess(rsi_bear[-1], 20.0, "Consistent losses must yield low RSI")

        # 2. EMA test
        flat = [100.0] * 30
        ema20 = compute_ema(flat, 20)
        self.assertAlmostEqual(ema20[-1], 100.0, places=2)

        # 3. MACD test
        macd_res = compute_macd(steady_gains)
        self.assertIn("macd", macd_res)
        self.assertIn("signal", macd_res)
        self.assertIn("hist", macd_res)

        # 4. Bollinger test
        bb_res = compute_bollinger(flat, 20)
        self.assertAlmostEqual(bb_res["middle"], 100.0, places=2)
        self.assertAlmostEqual(bb_res["upper"], 100.0, places=2)
        self.assertAlmostEqual(bb_res["lower"], 100.0, places=2)

    def test_04_trigger_contract(self):
        trigger_path = os.path.join(ROOT_DIR, "trigger.md")
        self.assertTrue(os.path.exists(trigger_path), "Missing trigger.md")
        with open(trigger_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("category_id: CAT-006", content)
        self.assertIn("scopes:", content)
        self.assertIn("events:", content)

    def test_05_security_and_portability(self):
        # Ensure zero illegal hardcoded home paths in code
        for sub in ["engine", "gui"]:
            dir_path = os.path.join(ROOT_DIR, sub)
            for fname in os.listdir(dir_path):
                fp = os.path.join(dir_path, fname)
                if os.path.isfile(fp):
                    with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                        text = f.read()
                        self.assertNotIn("/home/mrflow/", text, f"Hardcoded path leak in {fp}")

if __name__ == "__main__":
    unittest.main()
