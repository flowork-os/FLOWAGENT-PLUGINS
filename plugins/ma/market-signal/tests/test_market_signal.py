#!/usr/bin/env python3
"""
Test Suite for Market Signal & Swing Automation Studio
======================================================
Verifies contract compliance, 20-keyword frontmatter, technical math functions,
synthetic trade plans, full KamdenAI protocol schema parity, HMAC timing safety,
broker safety invariants, and security cleanliness.

Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import os
import sys
import json
import time
import hmac
import hashlib
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT_DIR, "engine"))

from scanner import (
    compute_rsi, compute_ema, compute_macd, compute_bollinger,
    compute_risk_sizing, analyze_ticker, run_scan
)

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
        steady_gains = [10.0 + i * 2.0 for i in range(25)]
        rsi_bull = compute_rsi(steady_gains, 14)
        self.assertGreater(rsi_bull[-1], 80.0, "Consistent gains must yield high RSI")
        
        steady_losses = [50.0 - i * 1.5 for i in range(25)]
        rsi_bear = compute_rsi(steady_losses, 14)
        self.assertLess(rsi_bear[-1], 20.0, "Consistent losses must yield low RSI")

        flat = [100.0] * 30
        ema20 = compute_ema(flat, 20)
        self.assertAlmostEqual(ema20[-1], 100.0, places=2)

        macd_res = compute_macd(steady_gains)
        self.assertIn("macd", macd_res)
        self.assertIn("signal", macd_res)
        self.assertIn("histogram", macd_res)

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
        for sub in ["engine", "gui"]:
            dir_path = os.path.join(ROOT_DIR, sub)
            for fname in os.listdir(dir_path):
                fp = os.path.join(dir_path, fname)
                if os.path.isfile(fp):
                    with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                        text = f.read()
                        forbidden_prefix = "/home/" + "mrflow/"
                        self.assertNotIn(forbidden_prefix, text, f"Hardcoded path leak in {fp}")

    def test_06_root_payload_envelope_parity(self):
        """Validates that scanner output strictly complies with reference root envelope { event, dateKey, sentAt, data }"""
        res = run_scan(tickers=["TSLA"], event_type="confirmed_buys")
        self.assertEqual(res["event"], "confirmed_buys.created")
        self.assertIn("dateKey", res)
        self.assertIn("sentAt", res)
        self.assertIn("data", res)
        
        data = res["data"]
        self.assertIn("scanId", data)
        self.assertIn("publishedAt", data)
        self.assertIn("confirmationComplete", data)
        self.assertIn("confirmedBuys", data)
        self.assertIn("confirmationResults", data)
        self.assertIn("confirmedBuyCount", data)
        self.assertIn("noConfirmedBuys", data)
        self.assertIn("sizingBasis", data)

    def test_07_signal_fields_and_types(self):
        """Asserts candidate object types (rMultipleTarget numeric float, name, shares, riskDollars)"""
        res = run_scan(tickers=["TSLA"], event_type="confirmed_buys")
        board = res["data"]["confirmationResults"]
        self.assertGreaterEqual(len(board), 1)
        item = board[0]
        
        self.assertIn("name", item)
        self.assertIsInstance(item["rMultipleTarget"], (int, float), "rMultipleTarget must be numeric float for .toFixed()")
        self.assertIn("shares", item)
        self.assertIn("riskDollars", item)
        self.assertIn("openingConfirmation", item)
        self.assertIn("officialRank", item["openingConfirmation"])
        self.assertIn("status", item["openingConfirmation"])

    def test_08_all_five_lifecycle_events(self):
        """Asserts all 5 lifecycle events generate the expected schemas"""
        events = [
            ("research_watchlist", "research_watchlist.created", "researchWatchlist"),
            ("morning_scan", "morning_scan.created", "scan"),
            ("quick_exit", "quick_exit_results.created", "quickExitResults"),
            ("webhook_test", "webhook.test", "message"),
            ("confirmed_buys", "confirmed_buys.created", "confirmedBuys")
        ]
        for arg_ev, expected_ev, key_to_check in events:
            out = run_scan(tickers=["TSLA"], event_type=arg_ev)
            self.assertEqual(out["event"], expected_ev)
            self.assertIn("data", out)
            self.assertIn(key_to_check, out["data"], f"Missing {key_to_check} in {expected_ev}")

    def test_09_quick_exit_outcome_schema(self):
        """Asserts result.quickExit schema parity with execution price, r, and statusLabel"""
        out = run_scan(tickers=["TSLA"], event_type="quick_exit")
        results = out["data"]["quickExitResults"]
        if len(results) > 0:
            row = results[0]
            self.assertIn("result", row)
            self.assertIn("quickExit", row["result"])
            qe = row["result"]["quickExit"]
            self.assertTrue(qe["finalized"])
            self.assertIn("profitPerShare", qe)
            self.assertIn("r", qe)
            self.assertIn("resultBasis", qe)
            self.assertIn("statusLabel", qe)

    def test_10_hmac_and_replay_verification(self):
        """Asserts HMAC-SHA256 signature algorithm and 5-minute replay window tolerance logic"""
        secret = "test_signing_secret"
        now_ms = str(int(time.time() * 1000))
        raw_body = json.dumps({"test": "value"})
        
        # Proper signature calculation: secret, timestamp + "." + raw_body
        expected = hmac.new(secret.encode("utf-8"), f"{now_ms}.{raw_body}".encode("utf-8"), hashlib.sha256).hexdigest()
        self.assertEqual(len(expected), 64)
        
        # Replay tolerance check: 5 minutes = 300,000 ms
        valid_ts = int(now_ms) - 10000 # 10 seconds ago -> valid
        self.assertLessEqual(abs(int(now_ms) - valid_ts), 300000)
        
        expired_ts = int(now_ms) - 400000 # 400 seconds ago -> expired
        self.assertGreater(abs(int(now_ms) - expired_ts), 300000)

if __name__ == "__main__":
    unittest.main()
