// [FLOWORK-OS:SOVEREIGN] Kamidi Mastering Console Pro Engine
// Co-authored-by: Flowork OS <agent@floworkos.com>

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GUI_DIR = path.resolve(__dirname, '..', 'gui');

// 1. Dynamic Port Resolution
function resolvePort() {
  const args = process.argv.slice(2);
  const pIdx = args.indexOf('--port');
  if (pIdx !== -1 && args[pIdx + 1]) {
    return parseInt(args[pIdx + 1], 10);
  }
  if (process.env.FLOWORK_APP_PORT) {
    return parseInt(process.env.FLOWORK_APP_PORT, 10);
  }
  if (process.env.PORT) {
    return parseInt(process.env.PORT, 10);
  }
  return 17860;
}

const PORT = resolvePort();

// 2. MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// 3. Plugin State
const state = {
  status: 'online',
  app: 'kamidi-mastering',
  version: '1.0.0',
  currentPreset: 'default',
  masteringStatus: 'idle'
};

// 4. HTTP Server
const server = http.createServer((req, res) => {
  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // REST API Endpoints
  if (pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      app: state.app,
      version: state.version,
      port: PORT,
      timestamp: Date.now()
    }));
    return;
  }

  if (pathname === '/api/presets' && req.method === 'GET') {
    const presetsPath = path.resolve(GUI_DIR, 'js', 'presets.js');
    if (fs.existsSync(presetsPath)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      fs.createReadStream(presetsPath).pipe(res);
      return;
    }
  }

  // Static File Serving
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  // Sanitize path against traversal
  const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(GUI_DIR, safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // If route doesn't match a static file, fallback to index.html for SPA
    const indexPath = path.join(GUI_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[KamidiMastering] Sovereign Engine running on http://127.0.0.1:${PORT}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
