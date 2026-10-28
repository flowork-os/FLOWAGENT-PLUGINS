// 📈 Sovereign Market Signal & Swing Automation Studio — Microservice Daemon
// Dynamic Port Injection, Pure ESM, Zero-Zombie Lifecycle, SSE Real-Time Stream
// Fully Audited against KamdenAI Protocol: Dual Headers, HMAC timingSafeEqual, Replay Protection, Broker Safety
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
const SIGNING_SECRET = process.env.KAMDENAI_SIGNING_SECRET || 'flowork_market_signal_secret';

let currentWatchlist = [
  'NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMD', 'AMZN', 'META', 'GOOGL',
  'BTC-USD', 'ETH-USD', 'SOL-USD'
];

let lastScanData = {
  event: 'confirmed_buys.created',
  dateKey: new Date().toISOString().split('T')[0],
  sentAt: new Date().toISOString(),
  data: {
    scanId: `${new Date().toISOString().split('T')[0]}_morning`,
    confirmationComplete: true,
    confirmedBuys: [],
    confirmationResults: [],
    confirmedBuyCount: 0,
    noConfirmedBuys: true,
    sizingBasis: { cash: 5000, riskPercent: 1.0, defaultRiskDollars: 50.0 }
  },
  _metadata: {
    total_scanned: 0,
    confirmedBuyCount: 0,
    watchCount: 0,
    interval: '1d',
    rankings: []
  }
};

let isScanning = false;
const sseClients = new Set();

// Security & Dedup Storage (LRU-capped)
const processedDeliveries = new Set();
const receivedWebhooks = [];
const MAX_INBOUND_LOG = 50;

// Broker Safety State
let isPaperTrading = true;
const stagedOrders = [];
const executedOrders = [];

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

function runScanner(tickers = currentWatchlist, interval = '1d', cash = 5000, risk = 1.0, eventType = 'confirmed_buys') {
  return new Promise((resolve, reject) => {
    isScanning = true;
    broadcastEvent('scan_status', { is_scanning: true });

    const args = [
      SCANNER_SCRIPT,
      '--tickers', tickers.join(','),
      '--interval', interval,
      '--cash', String(cash),
      '--risk', String(risk),
      '--event', eventType,
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-KamdenAI-Event, X-KamdenAI-Delivery, X-KamdenAI-Timestamp, X-KamdenAI-Signature, X-Flowork-Event, X-Flowork-Delivery, X-Flowork-Timestamp, X-Flowork-Signature');

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
    res.write(`data: ${JSON.stringify({ type: 'connected', time: Date.now(), isPaperTrading })}\n\n`);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // Health and Status
  if (req.method === 'GET' && pathname === '/api/status') {
    const dataObj = lastScanData.data || {};
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'market-signal',
      port: PORT,
      is_scanning: isScanning,
      total_watchlist: currentWatchlist.length,
      last_scan_time: lastScanData.last_scan_time || lastScanData.sentAt,
      confirmed_count: dataObj.confirmedBuyCount || 0,
      watch_count: lastScanData._metadata?.watchCount || 0,
      paper_trading: isPaperTrading,
      staged_orders_count: stagedOrders.length,
      uptime_sec: Math.floor(process.uptime())
    }));
    return;
  }

  // Get active signals
  if (req.method === 'GET' && pathname === '/api/signals') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      payload: lastScanData,
      is_scanning: isScanning,
      watchlist: currentWatchlist,
      paper_trading: isPaperTrading
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
      let cash = 5000;
      let risk = 1.0;
      let eventType = 'confirmed_buys';
      if (body) {
        try {
          const payload = JSON.parse(body);
          if (Array.isArray(payload.tickers) && payload.tickers.length > 0) {
            tickers = payload.tickers;
          }
          if (payload.interval) interval = payload.interval;
          if (payload.cash) cash = Number(payload.cash) || 5000;
          if (payload.risk) risk = Number(payload.risk) || 1.0;
          if (payload.event_type) eventType = payload.event_type;
        } catch (_) {}
      }

      if (isScanning) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Scan already in progress' }));
        return;
      }

      try {
        const results = await runScanner(tickers, interval, cash, risk, eventType);
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

  // Simulate or Dispatch Webhook (Full 5-Lifecycle parity + Dual Signing)
  if (req.method === 'POST' && pathname === '/api/webhook/simulate') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const targetUrl = payload.target_url || 'https://example.com/webhook';
        const secret = payload.secret || SIGNING_SECRET;
        const eventType = payload.event || 'confirmed_buys.created';
        
        const timestamp = Date.now().toString();
        const deliveryId = crypto.randomUUID();
        const dateKey = new Date().toISOString().split('T')[0];
        const sentAt = new Date().toISOString();
        const scanId = `${dateKey}_morning`;

        let webhookPayload;
        const confirmed = (lastScanData.data?.confirmedBuys || []);
        const board = (lastScanData.data?.confirmationResults || []);

        if (eventType === 'morning_scan.created') {
          webhookPayload = {
            event: 'morning_scan.created',
            dateKey,
            sentAt,
            data: {
              scanId,
              purpose: 'Preparation only; not official signals.',
              scan: {
                dateKey,
                mode: 'morning',
                buySignals: confirmed.map(x => ({ ticker: x.ticker, name: x.name || x.ticker, entry: x.entry, stop: x.stop, target: x.target })),
                watchSignals: board.filter(b => b.status === 'wait_for_reclaim').map(x => ({ ticker: x.ticker, name: x.name || x.ticker, entry: x.entry, stop: x.stop, target: x.target }))
              }
            }
          };
        } else if (eventType === 'quick_exit_results.created') {
          webhookPayload = {
            event: 'quick_exit_results.created',
            dateKey,
            sentAt,
            data: {
              scanId,
              confirmedBuyCount: confirmed.length,
              noConfirmedBuys: confirmed.length === 0,
              quickExitResults: confirmed.map(x => {
                const profitPerShare = Number((x.target - x.entry).toFixed(2));
                const shares = x.shares || 10;
                return {
                  ticker: x.ticker,
                  name: x.name || x.ticker,
                  entry: x.entry,
                  stop: x.stop,
                  target: x.target,
                  openingConfirmation: x.openingConfirmation || { officialRank: 1, status: 'confirmed_buy', statusLabel: 'Confirmed buy' },
                  result: {
                    quickExit: {
                      label: 'Morning reference execution',
                      finalized: true,
                      executionPrice: x.entry,
                      price: x.target,
                      profitPerShare: profitPerShare,
                      profitDollars: Number((profitPerShare * shares).toFixed(2)),
                      r: 1.5,
                      resultBasis: 'target_first',
                      executionBasis: 'Published entry verified after publication; no embedded cost adjustment; not a broker fill',
                      status: 'profit',
                      statusLabel: 'Winner'
                    }
                  }
                };
              }),
              studyResults: [],
              studyCount: 0
            }
          };
        } else if (eventType === 'research_watchlist.created') {
          webhookPayload = {
            event: 'research_watchlist.created',
            dateKey,
            sentAt,
            data: {
              purpose: 'Research only; not official signals.',
              researchWatchlist: board.slice(0, 4).map(x => ({
                ticker: x.ticker,
                name: x.name || x.ticker,
                entry: x.entry,
                stop: x.stop,
                target: x.target
              }))
            }
          };
        } else if (eventType === 'webhook.test') {
          webhookPayload = {
            event: 'webhook.test',
            dateKey,
            sentAt,
            data: {
              message: 'Illustrative delivery test only.',
              currentEvents: [
                'research_watchlist.created',
                'morning_scan.created',
                'confirmed_buys.created',
                'quick_exit_results.created'
              ]
            }
          };
        } else {
          // Default: confirmed_buys.created
          webhookPayload = {
            event: 'confirmed_buys.created',
            dateKey,
            sentAt,
            data: {
              scanId,
              publishedAt: sentAt,
              confirmationComplete: true,
              confirmedBuys: confirmed,
              confirmationResults: board,
              confirmedBuyCount: confirmed.length,
              noConfirmedBuys: confirmed.length === 0,
              sizingBasis: {
                cash: 5000,
                riskPercent: 1.0,
                defaultRiskDollars: 50.0
              },
              ...(confirmed.length === 0 ? { message: 'Completed opening review: no official confirmations.' } : {})
            }
          };
        }

        const rawBody = JSON.stringify(webhookPayload);
        const signature = crypto.createHmac('sha256', secret)
          .update(`${timestamp}.${rawBody}`)
          .digest('hex');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          simulated: true,
          target_url: targetUrl,
          headers: {
            'X-KamdenAI-Event': webhookPayload.event,
            'X-KamdenAI-Delivery': deliveryId,
            'X-KamdenAI-Timestamp': timestamp,
            'X-KamdenAI-Signature': signature,
            'X-Flowork-Event': webhookPayload.event,
            'X-Flowork-Delivery': deliveryId,
            'X-Flowork-Timestamp': timestamp,
            'X-Flowork-Signature': signature
          },
          body: webhookPayload
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: e.message }));
      }
    });
    return;
  }

  // Inbound Webhook Receiver (Timing-Safe HMAC Verification, 5-min Replay Check & Deduplication)
  if (req.method === 'POST' && pathname === '/api/webhook/receive') {
    let rawBody = '';
    req.on('data', (c) => { rawBody += c; });
    req.on('end', () => {
      try {
        const headerTs = req.headers['x-kamdenai-timestamp'] || req.headers['x-flowork-timestamp'];
        const headerSig = req.headers['x-kamdenai-signature'] || req.headers['x-flowork-signature'];
        const deliveryId = req.headers['x-kamdenai-delivery'] || req.headers['x-flowork-delivery'] || crypto.randomUUID();
        const eventName = req.headers['x-kamdenai-event'] || req.headers['x-flowork-event'] || 'unknown';

        if (!headerTs || !headerSig) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'Missing required signature or timestamp headers' }));
          return;
        }

        // 1. Replay attack protection (5-minute tolerance)
        const tsNum = parseInt(headerTs, 10);
        if (isNaN(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'Timestamp outside 5-minute validity window (potential replay)' }));
          return;
        }

        // 2. Delivery ID Deduplication
        if (processedDeliveries.has(deliveryId)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ignored', reason: 'duplicate_delivery', deliveryId }));
          return;
        }

        // 3. Timing-safe HMAC verification
        const expectedSig = crypto.createHmac('sha256', SIGNING_SECRET)
          .update(`${headerTs}.${rawBody}`)
          .digest('hex');

        const sigBuf = Buffer.from(headerSig, 'utf8');
        const expBuf = Buffer.from(expectedSig, 'utf8');

        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'Invalid HMAC signature' }));
          return;
        }

        // Deduplication mark
        processedDeliveries.add(deliveryId);
        if (processedDeliveries.size > 2000) {
          const first = processedDeliveries.values().next().value;
          processedDeliveries.delete(first);
        }

        const parsedPayload = JSON.parse(rawBody || '{}');
        const logEntry = {
          deliveryId,
          event: eventName,
          timestamp: headerTs,
          receivedAt: new Date().toISOString(),
          verified: true,
          payload: parsedPayload
        };

        receivedWebhooks.unshift(logEntry);
        if (receivedWebhooks.length > MAX_INBOUND_LOG) {
          receivedWebhooks.pop();
        }

        broadcastEvent('inbound_webhook', logEntry);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          verified: true,
          deliveryId,
          event: eventName,
          receivedAt: logEntry.receivedAt
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: `Webhook parse failure: ${err.message}` }));
      }
    });
    return;
  }

  // Get Inbound Webhook Feed
  if (req.method === 'GET' && pathname === '/api/webhook/feed') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', webhooks: receivedWebhooks }));
    return;
  }

  // Broker Safeguards: Status, Staged Orders & Approval
  if (req.method === 'GET' && pathname === '/api/broker/orders') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      isPaperTrading,
      stagedOrders,
      executedOrders
    }));
    return;
  }

  // Broker Safeguards: Stage an Order (Strict Invariant: Status comes before rank!)
  if (req.method === 'POST' && pathname === '/api/broker/stage-order') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const orderData = JSON.parse(body || '{}');
        
        // Cardinal Invariant Check
        if (orderData.status !== 'confirmed_buy') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'error',
            message: `Invariant violation: Only confirmed_buy candidates may be staged for execution. Provided: ${orderData.status}`
          }));
          return;
        }

        const staged = {
          orderId: crypto.randomUUID(),
          ticker: orderData.ticker,
          name: orderData.name || orderData.ticker,
          entry: Number(orderData.entry),
          stop: Number(orderData.stop),
          target: Number(orderData.target),
          shares: Number(orderData.shares) || 1,
          riskDollars: Number(orderData.riskDollars) || 50.0,
          rMultipleTarget: Number(orderData.rMultipleTarget) || 1.5,
          mode: isPaperTrading ? 'PAPER' : 'LIVE',
          status: 'PENDING_APPROVAL',
          stagedAt: new Date().toISOString()
        };

        stagedOrders.unshift(staged);
        broadcastEvent('broker_order_staged', staged);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', order: staged }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      }
    });
    return;
  }

  // Broker Safeguards: Approve Staged Order
  if (req.method === 'POST' && pathname === '/api/broker/approve-order') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const { orderId } = JSON.parse(body || '{}');
        const idx = stagedOrders.findIndex(o => o.orderId === orderId);
        if (idx === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'Order not found in staging queue' }));
          return;
        }

        const approved = stagedOrders.splice(idx, 1)[0];
        approved.status = isPaperTrading ? 'FILLED_PAPER' : 'FILLED_LIVE';
        approved.executedAt = new Date().toISOString();
        approved.fillPrice = approved.entry;

        executedOrders.unshift(approved);
        broadcastEvent('broker_order_executed', approved);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', order: approved }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      }
    });
    return;
  }

  // Broker Safeguards: Toggle Paper Trading Mode
  if (req.method === 'POST' && pathname === '/api/broker/mode') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const { paperTrading } = JSON.parse(body || '{}');
        if (typeof paperTrading === 'boolean') {
          isPaperTrading = paperTrading;
          broadcastEvent('broker_mode_changed', { isPaperTrading });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', isPaperTrading }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      }
    });
    return;
  }

  // Active Prompt Injection Proxy (Forward to Flowork Cockpit Host on 19890)
  if (req.method === 'POST' && pathname === '/api/prompt-dispatch') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const forwardReq = http.request('http://127.0.0.1:19890/api/prompt-dispatch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        }, (fRes) => {
          let fBody = '';
          fRes.on('data', (d) => { fBody += d; });
          fRes.on('end', () => {
            res.writeHead(fRes.statusCode || 200, { 'Content-Type': 'application/json' });
            res.end(fBody || JSON.stringify({ status: 'ok', message: 'Dispatched to host' }));
          });
        });
        forwardReq.on('error', (err) => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: `Host forward error: ${err.message}` }));
        });
        forwardReq.write(body);
        forwardReq.end();
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
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
