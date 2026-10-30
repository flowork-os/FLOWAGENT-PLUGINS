#!/usr/bin/env node
// [FL_INDEX: keywords="vibe_arcade, server_mjs, game_launcher, grokgames_api, offline_runner, sandboxed_games, anti_frame_proxy, game_downloader" | purpose="Sovereign Node.js ESM server for Flowork Vibe Arcade providing catalog search, offline games streaming, anti-frame-buster reverse proxy, on-demand game downloading, and favorites management"]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(APP_DIR, 'data');
const GUI_DIR = path.join(APP_DIR, 'gui');
const OFFLINE_GAMES_DIR = path.join(DATA_DIR, 'offline_games');
const FAVORITES_FILE = path.join(DATA_DIR, 'favorites.json');
const DB_PATH = path.join(DATA_DIR, 'grokgames.json');

const PORT = parseInt(process.env.FLOWORK_APP_PORT || '18050', 10);

if (!fs.existsSync(OFFLINE_GAMES_DIR)) {
  fs.mkdirSync(OFFLINE_GAMES_DIR, { recursive: true });
}

// Load games database
let gamesData = { games: [] };

function loadGamesData() {
  try {
    if (fs.existsSync(DB_PATH)) {
      gamesData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('[Vibe Arcade DB Error]', err);
  }
}

function saveGamesData() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(gamesData, null, 2), 'utf8');
  } catch (err) {
    console.error('[Vibe Arcade DB Save Error]', err);
  }
}

loadGamesData();
console.log(`[Vibe Arcade] Initialized with ${gamesData.games?.length || 0} games from grokgames.json`);

// Load or initialize favorites
function getFavorites() {
  try {
    if (fs.existsSync(FAVORITES_FILE)) {
      return JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf8'));
    }
  } catch (_) {}
  return [];
}

function saveFavorites(favs) {
  try {
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(favs, null, 2), 'utf8');
  } catch (err) {
    console.error('[Save Favorites Error]', err);
  }
}

// Scan offline games from directory
function getOfflineGames() {
  if (!fs.existsSync(OFFLINE_GAMES_DIR)) return [];
  const files = fs.readdirSync(OFFLINE_GAMES_DIR);
  return files
    .filter(f => f.endsWith('.html'))
    .map(filename => {
      const filePath = path.join(OFFLINE_GAMES_DIR, filename);
      const stat = fs.statSync(filePath);
      const titleName = filename
        .replace('.html', '')
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return {
        id: 'offline-' + filename.replace('.html', ''),
        title: titleName,
        filename,
        url: `/offline_games/${filename}`,
        size_kb: Math.round(stat.size / 1024),
        is_offline: true,
        made_with: 'opus-5.5',
        description: `Standalone offline playable title (${filename})`
      };
    });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  // --- API ROUTES ---
  if (pathname === '/api/status') {
    loadGamesData();
    const offlineList = getOfflineGames();
    return sendJson(res, 200, {
      status: 'ok',
      app: 'vibe-arcade',
      version: '1.1.0',
      port: PORT,
      games_count: gamesData.games?.length || 0,
      offline_games_count: offlineList.length
    });
  }

  // --- ANTI-FRAME REVERSE PROXY ---
  if (pathname === '/api/proxy') {
    const targetUrl = reqUrl.searchParams.get('url');
    if (!targetUrl || !targetUrl.startsWith('http')) {
      return sendJson(res, 400, { error: 'Valid http/https url parameter required' });
    }

    try {
      const upstreamRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(12000)
      });

      const contentType = upstreamRes.headers.get('content-type') || 'text/html; charset=utf-8';

      if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        let html = await upstreamRes.text();
        const baseHref = targetUrl.endsWith('/') ? targetUrl : targetUrl + '/';

        // Strip frame-busting scripts / refresh meta
        html = html.replace(/<meta[^>]*http-equiv=["']refresh["'][^>]*>/gi, '');

        // Inject base href so relative resources resolve cleanly
        if (/<head[^>]*>/i.test(html)) {
          html = html.replace(/(<head[^>]*>)/i, `$1\n  <base href="${baseHref}">`);
        } else {
          html = `<base href="${baseHref}">\n` + html;
        }

        res.writeHead(upstreamRes.status, {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        });
        return res.end(html);
      } else {
        const buffer = Buffer.from(await upstreamRes.arrayBuffer());
        res.writeHead(upstreamRes.status, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(buffer);
      }
    } catch (err) {
      return sendJson(res, 502, { error: `Proxy fetch failed: ${err.message}` });
    }
  }

  // --- ON-DEMAND GAME DOWNLOAD ---
  if (pathname === '/api/games/download' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const gameId = payload.gameId;
        if (!gameId) return sendJson(res, 400, { error: 'gameId required' });

        loadGamesData();
        const game = (gamesData.games || []).find(g => g.id === gameId);
        if (!game || !game.play_url) return sendJson(res, 404, { error: 'Game not found' });

        const resp = await fetch(game.play_url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          signal: AbortSignal.timeout(10000)
        });

        if (!resp.ok) return sendJson(res, 502, { error: `HTTP ${resp.status} fetching game source` });

        let html = await resp.text();
        const baseHref = game.play_url.endsWith('/') ? game.play_url : game.play_url + '/';
        if (/<head[^>]*>/i.test(html)) {
          html = html.replace(/(<head[^>]*>)/i, `$1\n  <base href="${baseHref}">`);
        } else {
          html = `<base href="${baseHref}">\n` + html;
        }

        const safeName = gameId.replace(/[^a-zA-Z0-9_\-]/g, '_').toLowerCase();
        const targetFile = path.join(OFFLINE_GAMES_DIR, `${safeName}.html`);
        fs.writeFileSync(targetFile, html, 'utf8');

        game.offline_url = `/offline_games/${safeName}.html`;
        game.is_offline_bundled = true;
        saveGamesData();

        return sendJson(res, 200, {
          success: true,
          gameId,
          offline_url: game.offline_url,
          size_kb: Math.round(Buffer.byteLength(html, 'utf8') / 1024)
        });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // --- CATALOG LISTING ---
  if (pathname === '/api/games') {
    loadGamesData();
    const query = (reqUrl.searchParams.get('query') || '').toLowerCase().trim();
    const model = (reqUrl.searchParams.get('model') || '').toLowerCase().trim();
    const onlyOffline = reqUrl.searchParams.get('offline') === '1' || reqUrl.searchParams.get('offline') === 'true';
    const minScore = parseFloat(reqUrl.searchParams.get('min_score') || '0');

    let allGames = [...(gamesData.games || [])];
    const offlineGames = getOfflineGames();
    const offlineFileSet = new Set(offlineGames.map(og => og.filename.toLowerCase()));

    // Synchronize offline bundle status with on-disk assets
    allGames = allGames.map(g => {
      let localOffline = g.offline_url || null;
      const safeId = (g.id || '').replace(/[^a-zA-Z0-9_\-]/g, '_').toLowerCase() + '.html';
      if (!localOffline && offlineFileSet.has(safeId)) {
        localOffline = `/offline_games/${safeId}`;
      }
      return {
        ...g,
        offline_url: localOffline,
        is_offline_bundled: !!localOffline
      };
    });

    // Add unique standalone local games to catalog if not present
    offlineGames.forEach(og => {
      const matchInAll = allGames.some(g => g.id === og.id || (g.offline_url && g.offline_url.endsWith('/' + og.filename)));
      if (!matchInAll) {
        allGames.unshift({
          id: og.id,
          title: og.title,
          description: og.description,
          play_url: og.url,
          offline_url: og.url,
          made_with: og.made_with,
          screenshot_score: 9.5,
          is_offline_bundled: true
        });
      }
    });

    // Apply Filters
    let filtered = allGames;
    if (query) {
      filtered = filtered.filter(g =>
        (g.title && g.title.toLowerCase().includes(query)) ||
        (g.description && g.description.toLowerCase().includes(query)) ||
        (g.made_with && g.made_with.toLowerCase().includes(query))
      );
    }

    if (model && model !== 'all') {
      filtered = filtered.filter(g => (g.made_with || '').toLowerCase().includes(model));
    }

    if (onlyOffline) {
      filtered = filtered.filter(g => !!g.offline_url || g.is_offline_bundled);
    }

    if (minScore > 0) {
      filtered = filtered.filter(g => (g.screenshot_score || 0) >= minScore);
    }

    return sendJson(res, 200, {
      total: filtered.length,
      games: filtered
    });
  }

  if (pathname.startsWith('/api/games/')) {
    const id = pathname.replace('/api/games/', '').trim();
    loadGamesData();
    const game = (gamesData.games || []).find(g => g.id === id);
    if (!game) {
      const og = getOfflineGames().find(o => o.id === id);
      if (og) return sendJson(res, 200, og);
      return sendJson(res, 404, { error: 'Game not found', id });
    }
    return sendJson(res, 200, game);
  }

  if (pathname === '/api/offline/list') {
    return sendJson(res, 200, { offline_games: getOfflineGames() });
  }

  if (pathname === '/api/favorites') {
    if (req.method === 'GET') {
      return sendJson(res, 200, { favorites: getFavorites() });
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const gameId = payload.gameId;
          if (!gameId) return sendJson(res, 400, { error: 'gameId required' });

          let favs = getFavorites();
          if (payload.favorite === false) {
            favs = favs.filter(id => id !== gameId);
          } else if (!favs.includes(gameId)) {
            favs.push(gameId);
          }
          saveFavorites(favs);
          return sendJson(res, 200, { success: true, favorites: favs });
        } catch (e) {
          return sendJson(res, 400, { error: 'Invalid JSON payload' });
        }
      });
      return;
    }
  }

  // --- STATIC FILE ROUTES ---
  if (pathname.startsWith('/offline_games/')) {
    const rel = pathname.replace('/offline_games/', '');
    const targetFile = path.join(OFFLINE_GAMES_DIR, rel);
    return serveStatic(res, targetFile);
  }

  if (pathname.startsWith('/data/')) {
    const rel = pathname.replace('/data/', '');
    const targetFile = path.join(DATA_DIR, rel);
    return serveStatic(res, targetFile);
  }

  // GUI Files
  let guiPath = path.join(GUI_DIR, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
  if (!fs.existsSync(guiPath)) {
    guiPath = path.join(GUI_DIR, 'index.html');
  }
  serveStatic(res, guiPath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Flowork Vibe Arcade] Server running on http://127.0.0.1:${PORT}`);
});
