#!/usr/bin/env python3
# [FL_INDEX: keywords="test_vibe_arcade, unit_test, manifest_contract, grokgames_audit, offline_games_test, server_routes" | purpose="Comprehensive unit test suite for Flowork Vibe Arcade app verifying manifest contract, SKILL.md keywords count, grokgames database integrity, offline bundled games, and HTTP endpoints"]

import unittest
import os
import sys
import json
import subprocess
import time
import urllib.request

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
APPS_JSON = os.path.abspath(os.path.join(APP_DIR, '..', 'apps.json'))

class TestVibeArcade(unittest.TestCase):

    def test_01_manifest_and_skill_contract(self):
        """Verify plugin.manifest.json and SKILL.md exactly 20 keywords."""
        manifest_path = os.path.join(APP_DIR, 'plugin.manifest.json')
        self.assertTrue(os.path.exists(manifest_path), "plugin.manifest.json missing")
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        self.assertEqual(manifest.get('id'), 'vibe-arcade')
        self.assertEqual(manifest.get('entry', {}).get('gui'), 'gui/index.html')
        self.assertEqual(manifest.get('entry', {}).get('backend'), 'engine/server.mjs')
        self.assertEqual(manifest.get('ipc', {}).get('default_port'), 18050)

        # Check SKILL.md has EXACTLY 20 keywords
        skill_path = os.path.join(APP_DIR, 'SKILL.md')
        self.assertTrue(os.path.exists(skill_path), "SKILL.md missing")
        with open(skill_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertTrue(content.startswith('---'), "SKILL.md missing YAML frontmatter")
        parts = content.split('---', 2)
        frontmatter = parts[1]

        keywords = []
        in_keywords = False
        for line in frontmatter.splitlines():
            sline = line.strip()
            if sline.startswith('keywords:'):
                in_keywords = True
                continue
            if in_keywords:
                if sline.startswith('- '):
                    keywords.append(sline[2:].strip())
                elif sline and not sline.startswith('#'):
                    break
        self.assertEqual(len(keywords), 20, f"SKILL.md must have EXACTLY 20 keywords, found {len(keywords)}: {keywords}")

        # Check trigger.md
        trigger_path = os.path.join(APP_DIR, 'trigger.md')
        self.assertTrue(os.path.exists(trigger_path), "trigger.md missing")

    def test_02_apps_json_registration(self):
        """Verify vibe-arcade is registered in Flowork apps.json."""
        self.assertTrue(os.path.exists(APPS_JSON), "apps.json missing")
        with open(APPS_JSON, 'r', encoding='utf-8') as f:
            d = json.load(f)
        app_ids = [a.get('id') for a in d.get('apps', [])]
        self.assertIn('vibe-arcade', app_ids, "vibe-arcade not registered in apps.json")

    def test_03_grokgames_data_integrity(self):
        """Verify grokgames.json exists and has >= 270 valid game records."""
        db_path = os.path.join(APP_DIR, 'data', 'grokgames.json')
        self.assertTrue(os.path.exists(db_path), "grokgames.json missing")
        with open(db_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        games = data.get('games', [])
        self.assertGreaterEqual(len(games), 270, f"Expected at least 270 games, got {len(games)}")

        # Verify first game schema
        first = games[0]
        self.assertIn('id', first)
        self.assertIn('title', first)
        self.assertIn('play_url', first)
        self.assertIn('screenshot_score', first)
        self.assertIn('made_with', first)

    def test_04_offline_games_bundle(self):
        """Verify offline standalone HTML games are properly bundled."""
        offline_dir = os.path.join(APP_DIR, 'data', 'offline_games')
        self.assertTrue(os.path.exists(offline_dir), "offline_games directory missing")
        files = os.listdir(offline_dir)
        self.assertIn('hyperbrick.html', files)
        self.assertIn('labyrinthos.html', files)
        self.assertIn('cyber_runner.html', files)
        self.assertIn('asteroid_defend.html', files)

        for fname in ['hyperbrick.html', 'labyrinthos.html', 'cyber_runner.html', 'asteroid_defend.html']:
            p = os.path.join(offline_dir, fname)
            self.assertGreater(os.path.getsize(p), 1000, f"File {fname} is too small or empty")

    def test_05_server_http_endpoints(self):
        """Verify server starts, responds on API routes, and serves static files."""
        server_script = os.path.join(APP_DIR, 'engine', 'server.mjs')
        test_port = '18055'
        env = os.environ.copy()
        env['FLOWORK_APP_PORT'] = test_port

        proc = subprocess.Popen(['node', server_script], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            # Wait for server to boot
            time.sleep(1.0)

            # 1. Status endpoint
            status_url = f'http://127.0.0.1:{test_port}/api/status'
            with urllib.request.urlopen(status_url, timeout=3) as resp:
                self.assertEqual(resp.status, 200)
                data = json.loads(resp.read().decode('utf-8'))
                self.assertEqual(data.get('status'), 'ok')
                self.assertEqual(data.get('app'), 'vibe-arcade')
                self.assertEqual(data.get('version'), '1.1.0')
                self.assertGreaterEqual(data.get('games_count', 0), 270)
                self.assertGreaterEqual(data.get('offline_games_count', 0), 250)

            # 2. Games endpoint with filter
            games_url = f'http://127.0.0.1:{test_port}/api/games?model=opus-5.5'
            with urllib.request.urlopen(games_url, timeout=3) as resp:
                self.assertEqual(resp.status, 200)
                data = json.loads(resp.read().decode('utf-8'))
                self.assertGreater(data.get('total', 0), 0)

            # 3. Offline list endpoint
            offline_url = f'http://127.0.0.1:{test_port}/api/offline/list'
            with urllib.request.urlopen(offline_url, timeout=3) as resp:
                self.assertEqual(resp.status, 200)
                data = json.loads(resp.read().decode('utf-8'))
                self.assertGreaterEqual(len(data.get('offline_games', [])), 250)

            # 4. Anti-Frame Proxy endpoint validation
            proxy_url = f'http://127.0.0.1:{test_port}/api/proxy?url=invalid'
            try:
                urllib.request.urlopen(proxy_url, timeout=3)
            except urllib.error.HTTPError as err:
                self.assertEqual(err.code, 400)

            # 5. Static HTML
            gui_url = f'http://127.0.0.1:{test_port}/index.html'
            with urllib.request.urlopen(gui_url, timeout=3) as resp:
                self.assertEqual(resp.status, 200)
                html = resp.read().decode('utf-8')
                self.assertIn('FLOWORK VIBE ARCADE', html)

        finally:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except Exception:
                proc.kill()
            if proc.stdout: proc.stdout.close()
            if proc.stderr: proc.stderr.close()


if __name__ == '__main__':
    unittest.main()
