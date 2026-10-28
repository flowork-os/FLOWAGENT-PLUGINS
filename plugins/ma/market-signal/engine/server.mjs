// 📈 Sovereign Market Signal & Swing Automation Studio — Microservice Daemon
// Dynamic Port Injection, Pure ESM, Zero-Zombie Lifecycle, SSE Real-Time Stream
// Co-authored-by: Flowork OS <agent@floworkos.com>

import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SCANNER_SCRIPT = path.join(__dirname, 'scanner.py');

const PORT = parseInt(process.env.FLOWORK_APP_PORT || process.env.PORT || '17892', 10);
const HOST = '127.0.0.1';

let currentWatchlist = [
  'NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMD', 'AMZN', 'META', 'GOOGL',
  'BTC-USD', 'ETH-USD', 'SOL-USD'
];

let lastScanData = {
  total_scanned: 0,
  confirmed_count: 0,
  watch_count: 0,
  last_scan_time: null,
  interval: '1d',
  rankings: []
};

let isScanning = false;
const sseClients = new Set();

function broadcastEvent(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

function runScanner(tickers = currentWatchlist, interval = '1d') {
  return new Promise((resolve, reject) => {
    isScanning = true;
    broadcastEvent('scan_status', { is_scanning: true });

    const args = [
      SCANNER_SCRIPT,
      '--tickers', tickers.join(','),
      '--interval', interval,
      '--json'
    ];

    const child = spawn('python3', args, { cwd: ROOT_DIR });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      isScanning = false;
      if (code === 0) {
        try {
          const res = JSON.parse(stdout);
          res.last_scan_time = new Date().toISOString();
          lastScanData = res;
          broadcastEvent('scan_complete', lastScanData);
          resolve(lastScanData);
        } catch (err) {
          reject(new Error(`Failed to parse scanner output: ${err.message}`));
        }
      } else {
        broadcastEvent('scan_error', { code, error: stderr.trim() });
        reject(new Error(`Scanner failed with exit code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || HOST}`);
  const pathname = parsedUrl.pathname;

  // SSE Stream
  if (req.method === 'GET' && pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    sseClients.add(res);
    res.write(`data: ${JSON.stringify({ type: 'connected', time: Date.now() })}\n\n`);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // Health and Status
  if (req.method === 'GET' && pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'market-signal',
      port: PORT,
      is_scanning: isScanning,
      total_watchlist: currentWatchlist.length,
      last_scan_time: lastScanData.last_scan_time,
      confirmed_count: lastScanData.confirmed_count,
      watch_count: lastScanData.watch_count,
      uptime_sec: Math.floor(process.uptime())
    }));
    return;
  }

  // Get active signals
  if (req.method === 'GET' && pathname === '/api/signals') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      data: lastScanData,
      is_scanning: isScanning,
      watchlist: currentWatchlist
    }));
    return;
  }

  // Trigger Scan
  if (req.method === 'POST' && pathname === '/api/scan') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      let tickers = currentWatchlist;
      let interval = '1d';
      if (body) {
        try {
          const payload = JSON.parse(body);
          if (Array.isArray(payload.tickers) && payload.tickers.length > 0) {
            tickers = payload.tickers;
          }
          if (payload.interval) interval = payload.interval;
        } catch (_) {}
      }

      if (isScanning) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Scan already in progress' }));
        return;
      }

      try {
        const results = await runScanner(tickers, interval);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', data: results }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      }
    });
    return;
  }

  // Update Watchlist
  if (req.method === 'POST' && pathname === '/api/watchlist') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (payload.action === 'add' && payload.ticker) {
          const t = payload.ticker.trim().toUpperCase();
          if (!currentWatchlist.includes(t)) currentWatchlist.push(t);
        } else if (payload.action === 'remove' && payload.ticker) {
          const t = payload.ticker.trim().toUpperCase();
          currentWatchlist = currentWatchlist.filter(x => x !== t);
        } else if (Array.isArray(payload.watchlist)) {
          currentWatchlist = payload.watchlist.map(x => x.trim().toUpperCase()).filter(Boolean);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', watchlist: currentWatchlist }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Invalid payload' }));
      }
    });
    return;
  }

  // Simulate or Dispatch Webhook
  if (req.method === 'POST' && pathname === '/api/webhook/simulate') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const targetUrl = payload.target_url || 'https://example.com/webhook';
        const secret = payload.secret || 'flowork_market_signal_secret';
        
        const timestamp = Date.now().toString();
        const dataPayload = JSON.stringify({
          event: 'signals.published',
          timestamp: timestamp,
          signals: lastScanData.rankings.filter(r => r.status === 'CONFIRMED BUY' || r.status === 'WATCH ONLY')
        });

        const signature = crypto.createHmac('sha256', secret)
          .update(`${timestamp}.${dataPayload}`)
          .digest('hex');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          simulated: true,
          target_url: targetUrl,
          headers: {
            'X-Flowork-Event': 'signals.published',
            'X-Flowork-Timestamp': timestamp,
            'X-Flowork-Signature': signature
          },
          body: JSON.parse(dataPayload)
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: e.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'error', message: `Route not found: ${pathname}` }));
});

server.listen(PORT, HOST, () => {
  console.log(`[Plugin:market-signal] Sovereign Microservice listening on http://${HOST}:${PORT}`);
  // Initial scan in background
  setTimeout(() => {
    runScanner().catch(err => console.error('[Plugin:market-signal] Initial scan warning:', err.message));
  }, 1000);
});

// Periodic background scanner (every 3 minutes)
const intervalTimer = setInterval(() => {
  if (!isScanning) {
    runScanner().catch(() => {});
  }
}, 180000);

const shutdown = () => {
  console.log('[Plugin:market-signal] Gracefully shutting down microservice...');
  clearInterval(intervalTimer);
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
