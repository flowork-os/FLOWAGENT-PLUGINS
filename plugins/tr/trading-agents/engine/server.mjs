import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const GUI_DIR = path.join(ROOT_DIR, 'gui');
const COUNCIL_SCRIPT = path.join(__dirname, 'council.py');
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_PORT = 17898;
const HOST = '127.0.0.1';
const COCKPIT_HOST_IPC = 'http://127.0.0.1:19890/api/prompt-dispatch';

let activePort = parseInt(process.env.FLOWORK_APP_PORT || process.env.PORT || DEFAULT_PORT, 10);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function runCouncil(args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [COUNCIL_SCRIPT, ...args], {
      cwd: __dirname,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Council exited with code ${code}: ${stderr || stdout}`));
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (e) {
        reject(new Error(`Failed to parse Council output: ${e.message}\nRaw: ${stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || HOST}`);
  const pathname = urlObj.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // --- API ROUTES ---
  if (pathname === '/api/status' && method === 'GET') {
    return sendJson(res, 200, {
      status: 'ONLINE',
      app: 'trading-agents',
      version: '1.1.0',
      port: activePort,
      engine: 'Hierarchical Multi-Agent Council',
      timestamp: new Date().toISOString()
    });
  }

  if (pathname === '/api/analyze' && method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const ticker = (payload.ticker || 'NVDA').toString().trim().toUpperCase();
      const assetType = (payload.asset_type || 'stock').toString().trim();
      const cash = parseFloat(payload.cash || 25000);

      console.log(`[TradingAgents Council] Executing multi-agent analysis for ${ticker} (asset: ${assetType}, cash: $${cash})...`);
      const verdict = await runCouncil([
        '--ticker', ticker,
        '--asset-type', assetType,
        '--cash', cash.toString()
      ]);

      return sendJson(res, 200, {
        success: true,
        verdict
      });
    } catch (err) {
      console.error(`[TradingAgents Council] Analysis error:`, err.message);
      return sendJson(res, 500, {
        success: false,
        error: err.message
      });
    }
  }

  if (pathname === '/api/history' && method === 'GET') {
    try {
      const memoryPath = path.join(DATA_DIR, 'trading_memory.json');
      if (fs.existsSync(memoryPath)) {
        const data = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
        return sendJson(res, 200, { success: true, count: data.length, history: data });
      }
      return sendJson(res, 200, { success: true, count: 0, history: [] });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  if (pathname === '/api/settle' && method === 'POST') {
    try {
      console.log(`[TradingAgents Council] Settling pending trades and scoring alpha...`);
      const result = await runCouncil(['--settle']);
      return sendJson(res, 200, { success: true, ...result });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  if (pathname === '/api/prompt-dispatch' && method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      console.log(`[TradingAgents Council] Forwarding prompt dispatch to Cockpit Host IPC:`, payload.triggerId);
      
      const upstreamRes = await fetch(COCKPIT_HOST_IPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const upstreamData = await upstreamRes.json().catch(() => ({}));
      return sendJson(res, upstreamRes.status, {
        success: upstreamRes.ok,
        forwarded: true,
        data: upstreamData
      });
    } catch (err) {
      console.warn(`[TradingAgents Council] Cockpit Host prompt dispatch unavailable, returning local ack:`, err.message);
      return sendJson(res, 200, {
        success: true,
        forwarded: false,
        notice: 'Host IPC simulated locally'
      });
    }
  }

  // --- STATIC GUI SERVING WITH PATH TRAVERSAL GUARDS ---
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(GUI_DIR, safePath);

  if (!filePath.startsWith(GUI_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    return fs.createReadStream(filePath).pipe(res);
  }

  const indexFallback = path.join(GUI_DIR, 'index.html');
  if (fs.existsSync(indexFallback)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(indexFallback).pipe(res);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

function startServer(portToTry) {
  server.listen(portToTry, HOST, () => {
    activePort = portToTry;
    console.log(`[TradingAgents Council] Engine listening on http://${HOST}:${activePort}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[TradingAgents Council] Port ${portToTry} in use, scanning next port...`);
      startServer(portToTry + 1);
    } else {
      console.error(`[TradingAgents Council] Server error:`, err);
    }
  });
}

startServer(activePort);
