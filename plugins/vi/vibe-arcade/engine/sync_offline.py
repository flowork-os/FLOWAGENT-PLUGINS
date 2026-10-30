#!/usr/bin/env python3
# [FL_INDEX: keywords="sync_offline, mass_game_downloader, offline_games_cacher, base_href_injector, grokgames_updater" | purpose="Batch scraper and offline bundler for Flowork Vibe Arcade downloading all 270+ AI vibe-coded games to local disk with base href resolution"]

import os
import sys
import json
import re
import urllib.request
import ssl
import concurrent.futures
from urllib.parse import urlparse

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA_DIR = os.path.join(APP_DIR, 'data')
OFFLINE_DIR = os.path.join(DATA_DIR, 'offline_games')
DB_PATH = os.path.join(DATA_DIR, 'grokgames.json')

os.makedirs(OFFLINE_DIR, exist_ok=True)

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def sanitize_filename(name):
    clean = re.sub(r'[^a-zA-Z0-9_\-]', '_', name).strip('_')
    return clean.lower()

def download_one(game):
    game_id = game.get('id', '')
    play_url = game.get('play_url', '')

    if not play_url or not play_url.startswith('http'):
        return (game_id, False, 'Invalid URL', 0)

    # If already offline bundled and file exists, verify size
    safe_name = sanitize_filename(game_id)
    out_file = os.path.join(OFFLINE_DIR, f"{safe_name}.html")
    if os.path.exists(out_file) and os.path.getsize(out_file) > 1000:
        return (game_id, True, 'Already cached', os.path.getsize(out_file))

    try:
        req = urllib.request.Request(
            play_url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        )
        with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
            status = resp.status
            if status != 200:
                return (game_id, False, f'HTTP {status}', 0)
            
            ct = resp.headers.get('Content-Type', '')
            if 'text/html' not in ct and 'application/xhtml' not in ct:
                return (game_id, False, f'Non-HTML ({ct})', 0)

            raw_bytes = resp.read(25 * 1024 * 1024) # Cap at 25MB per game
            if len(raw_bytes) < 400:
                return (game_id, False, 'Payload too small', len(raw_bytes))

            html = raw_bytes.decode('utf-8', errors='ignore')

            # Ensure proper base href so relative scripts/css/textures load from original origin
            base_url = play_url if play_url.endswith('/') else play_url + '/'
            if '<head' in html.lower():
                html = re.sub(r'(<head[^>]*>)', r'\1\n  <base href="' + base_url + '">', html, count=1, flags=re.IGNORECASE)
            else:
                html = f'<base href="{base_url}">\n' + html

            with open(out_file, 'w', encoding='utf-8') as out_f:
                out_f.write(html)

            return (game_id, True, 'Downloaded', len(raw_bytes))

    except Exception as e:
        return (game_id, False, str(e), 0)

def main():
    if not os.path.exists(DB_PATH):
        print(f"[Error] {DB_PATH} not found.")
        sys.exit(1)

    with open(DB_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    games = data.get('games', [])
    print(f"[Vibe Arcade Sync] Commencing offline scraping for {len(games)} games...")

    downloaded = 0
    failed = 0
    total_bytes = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=24) as executor:
        future_map = {executor.submit(download_one, g): g for g in games}
        for future in concurrent.futures.as_completed(future_map):
            g = future_map[future]
            gid, ok, msg, size = future.result()
            safe_name = sanitize_filename(gid)
            if ok:
                downloaded += 1
                total_bytes += size
                g['offline_url'] = f'/offline_games/{safe_name}.html'
                g['is_offline_bundled'] = True
                print(f"[✓ Cached] {gid} ({round(size/1024, 1)} KB) - {msg}")
            else:
                failed += 1
                print(f"[✗ Skipped] {gid} - {msg}")

    # Save updated database
    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    print("\n" + "="*50)
    print(f"[Summary] Offline Bundled: {downloaded}/{len(games)} games")
    print(f"[Summary] Failed / Blocked: {failed}/{len(games)} games")
    print(f"[Summary] Total Cached Size: {round(total_bytes / (1024*1024), 2)} MB")
    print("="*50)

if __name__ == '__main__':
    main()
