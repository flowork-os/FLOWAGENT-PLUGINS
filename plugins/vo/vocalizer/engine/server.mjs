// [FLOWORK-OS:SOVEREIGN] Engineered by Flowork OS <agent@floworkos.com>

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
  return 17840;
}

const PORT = resolvePort();

// 2. MIME Type Mapping
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

// 3. Reverse-Engineered Vocalizer State & Parameter Map
let dspState = {
  // Pitch & Tune
  tune_on: 1,
  tune_key: 0,       // 0:C, 1:C#, 2:D, 3:D#, 4:E, 5:F, 6:F#, 7:G, 8:G#, 9:A, 10:A#, 11:B
  tune_scale: 1,     // 0:Chromatic, 1:Major, 2:Minor
  tune_speed: 15,    // 0 - 100 ms
  tune_tol: 50,      // 0 - 100 ct
  tune_human: 20,    // 0 - 100 %

  // 4-Voice Polyphonic Harmony Engine
  harm1_int: 8,      // Unison (+8 index)
  harm1_lvl: 0.0,    // dB
  harm1_pan: 0.0,    // Center
  harm2_int: 10,     // +3rd
  harm2_lvl: -6.0,
  harm2_pan: -0.4,   // Left
  harm3_int: 12,     // +5th
  harm3_lvl: -6.0,
  harm3_pan: 0.4,    // Right
  harm4_int: 15,     // +Oct
  harm4_lvl: -12.0,
  harm4_pan: 0.0,
  harm_var: 10,      // Variation %
  harm_dimute: 0,    // DI Mute toggle

  // Dynamics & Pre-Processing
  gate_thr: -48.0,   // dB
  ds_amt: 30,        // %

  // 6-Band Parametric EQ
  eq_hpf: 80.0,      // Hz
  eq_ls_f: 120.0,    // Hz
  eq_ls_g: 0.0,      // dB
  eq_b1_f: 1200.0,   // Hz
  eq_b1_g: 0.0,      // dB
  eq_b1_q: 1.0,
  eq_b2_f: 3500.0,   // Hz
  eq_b2_g: 2.0,      // dB
  eq_b2_q: 1.2,
  eq_hs_f: 10000.0,  // Hz
  eq_hs_g: 3.0,      // dB
  eq_lpf: 18000.0,   // Hz

  // Compressor
  comp_thr: -18.0,   // dB
  comp_ratio: 3.5,   // :1
  comp_att: 12.0,    // ms
  comp_rel: 120.0,   // ms
  comp_gain: 3.0,    // dB

  // Saturation & Color
  sat_mode: 0,       // 0:Tape, 1:Tube, 2:Digital
  sat_drive: 12.0,   // dB
  sat_mix: 35.0,     // %

  // Doubler / Spreader
  dbl_amt: 25.0,     // %
  dbl_time: 18.0,    // ms

  // Modulation
  mod_mode: 0,       // 0:Off, 1:Chorus, 2:Flanger, 3:Phaser
  mod_rate: 1.2,     // Hz
  mod_mix: 0.0,      // %

  // Delay
  dly_time: 250.0,   // ms
  dly_fb: 30.0,      // %
  dly_mix: 15.0,     // %
  dly_duck: 50.0,    // %

  // Reverb
  rev_mode: 0,       // 0:Hall, 1:Plate, 2:Ambience
  rev_mix: 20.0,     // %
  rev_duck: 40.0,    // %

  // Output
  out_gain: 0.0      // dB
};

// Built-in Production Presets
const PRESETS = {
  "Modern Pop Lead": {
    tune_on: 1, tune_key: 0, tune_scale: 1, tune_speed: 12, tune_tol: 40, tune_human: 15,
    gate_thr: -45, ds_amt: 40,
    eq_hpf: 90, eq_ls_f: 120, eq_ls_g: -1.5, eq_b1_f: 1000, eq_b1_g: -2.0, eq_b1_q: 1.4,
    eq_b2_f: 3800, eq_b2_g: 3.5, eq_b2_q: 1.0, eq_hs_f: 11000, eq_hs_g: 4.5, eq_lpf: 18500,
    comp_thr: -16, comp_ratio: 4.0, comp_att: 10, comp_rel: 100, comp_gain: 4.0,
    sat_mode: 0, sat_drive: 8, sat_mix: 25,
    dbl_amt: 30, dbl_time: 15,
    mod_mode: 0, mod_rate: 1.0, mod_mix: 0,
    dly_time: 320, dly_fb: 25, dly_mix: 18, dly_duck: 60,
    rev_mode: 1, rev_mix: 22, rev_duck: 45,
    out_gain: 0.0
  },
  "Hard Autotune Rap": {
    tune_on: 1, tune_key: 0, tune_scale: 2, tune_speed: 0, tune_tol: 10, tune_human: 0,
    gate_thr: -40, ds_amt: 50,
    eq_hpf: 100, eq_ls_f: 150, eq_ls_g: -2.0, eq_b1_f: 800, eq_b1_g: -3.0, eq_b1_q: 1.8,
    eq_b2_f: 4500, eq_b2_g: 5.0, eq_b2_q: 1.0, eq_hs_f: 12000, eq_hs_g: 6.0, eq_lpf: 19000,
    comp_thr: -20, comp_ratio: 6.0, comp_att: 5, comp_rel: 80, comp_gain: 6.0,
    sat_mode: 1, sat_drive: 18, sat_mix: 45,
    dbl_amt: 15, dbl_time: 10,
    mod_mode: 0, mod_rate: 1.0, mod_mix: 0,
    dly_time: 250, dly_fb: 35, dly_mix: 20, dly_duck: 70,
    rev_mode: 1, rev_mix: 18, rev_duck: 50,
    out_gain: 1.0
  },
  "Lush 4-Voice Harmonies": {
    tune_on: 1, tune_key: 0, tune_scale: 1, tune_speed: 25, tune_tol: 60, tune_human: 40,
    harm1_int: 8, harm1_lvl: -2, harm1_pan: 0,
    harm2_int: 10, harm2_lvl: -4, harm2_pan: -0.6,
    harm3_int: 12, harm3_lvl: -4, harm3_pan: 0.6,
    harm4_int: 15, harm4_lvl: -8, harm4_pan: 0,
    gate_thr: -50, ds_amt: 30,
    eq_hpf: 85, eq_ls_f: 100, eq_ls_g: 0, eq_b1_f: 1500, eq_b1_g: 0, eq_b1_q: 1.0,
    eq_b2_f: 3000, eq_b2_g: 1.5, eq_b2_q: 1.0, eq_hs_f: 9000, eq_hs_g: 2.5, eq_lpf: 17000,
    comp_thr: -15, comp_ratio: 3.0, comp_att: 20, comp_rel: 150, comp_gain: 2.5,
    sat_mode: 0, sat_drive: 6, sat_mix: 20,
    dbl_amt: 40, dbl_time: 22,
    mod_mode: 1, mod_rate: 0.8, mod_mix: 25,
    dly_time: 400, dly_fb: 30, dly_mix: 22, dly_duck: 40,
    rev_mode: 0, rev_mix: 35, rev_duck: 30,
    out_gain: 0.0
  },
  "Intimate Acoustic": {
    tune_on: 0, tune_key: 0, tune_scale: 1, tune_speed: 50, tune_tol: 80, tune_human: 70,
    gate_thr: -55, ds_amt: 20,
    eq_hpf: 70, eq_ls_f: 120, eq_ls_g: 1.0, eq_b1_f: 2200, eq_b1_g: -1.0, eq_b1_q: 1.2,
    eq_b2_f: 5000, eq_b2_g: 1.5, eq_b2_q: 1.0, eq_hs_f: 12000, eq_hs_g: 2.0, eq_lpf: 19500,
    comp_thr: -12, comp_ratio: 2.5, comp_att: 30, comp_rel: 200, comp_gain: 1.5,
    sat_mode: 0, sat_drive: 3, sat_mix: 15,
    dbl_amt: 0, dbl_time: 15,
    mod_mode: 0, mod_rate: 1.0, mod_mix: 0,
    dly_time: 180, dly_fb: 15, dly_mix: 10, dly_duck: 30,
    rev_mode: 2, rev_mix: 18, rev_duck: 20,
    out_gain: 0.0
  }
};

let activePresetName = "Modern Pop Lead";

// 4. SSE Client Management
const sseClients = new Set();

function broadcastEvent(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// 5. HTTP Server Request Dispatcher
const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- REST API Endpoints ---
  if (pathname === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      plugin: 'vocalizer',
      version: '1.0.0',
      active_preset: activePresetName,
      clients_connected: sseClients.size,
      params: dspState
    }));
    return;
  }

  if (pathname === '/api/params' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(dspState));
    return;
  }

  if (pathname === '/api/params' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const patch = JSON.parse(body);
        Object.assign(dspState, patch);
        broadcastEvent('param_update', patch);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, updated: patch }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  if (pathname === '/api/presets' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      active: activePresetName,
      presets: Object.keys(PRESETS)
    }));
    return;
  }

  if (pathname === '/api/presets/load' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { name } = JSON.parse(body);
        if (PRESETS[name]) {
          activePresetName = name;
          Object.assign(dspState, PRESETS[name]);
          broadcastEvent('preset_loaded', { name, params: dspState });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, preset: name, params: dspState }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Preset '${name}' not found` }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  if (pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    sseClients.add(res);
    res.write(`data: ${JSON.stringify({ type: 'connected', time: Date.now() })}\n\n`);
    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  if (pathname === '/api/prompt-dispatch' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        console.log('[VOCALIZER:PROMPT_DISPATCH]', payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'dispatched',
          timestamp: new Date().toISOString()
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // --- Static Files Delivery ---
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(GUI_DIR, reqPath);

  // Security: Guard against path traversal
  if (!filePath.startsWith(GUI_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

// 6. Server Lifecycle & Zero-Zombie Reaper
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[VOCALIZER] Microservice active on port ${PORT}`);
  console.log(`[VOCALIZER] Serving UI from: ${GUI_DIR}`);
});

function gracefulExit() {
  console.log('[VOCALIZER] Gracefully shutting down microservice...');
  for (const client of sseClients) {
    try { client.end(); } catch (e) {}
  }
  sseClients.clear();
  server.close(() => {
    console.log('[VOCALIZER] Socket released. Exiting 0.');
    process.exit(0);
  });
}

process.on('SIGTERM', gracefulExit);
process.on('SIGINT', gracefulExit);
