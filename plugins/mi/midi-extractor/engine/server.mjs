import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.FLOWORK_APP_PORT || process.env.PORT || '17870', 10);
const HOST = '127.0.0.1';

// Base directories
const TEMP_DIR = path.join(os.tmpdir(), 'flowork_midi_extractor');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const GUI_DIR = path.resolve(__dirname, '..', 'gui');
const MODEL_PATH = path.resolve(__dirname, 'models', 'nmp.onnx');
const SCRIPT_PATH = path.resolve(__dirname, 'transcribe_onnx.py');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-filename, X-Filename, *'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 50 * 1024 * 1024) { // 50MB limit
        req.destroy();
        reject(new Error('Payload too large (max 50MB)'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function parseBinaryBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLen = 0;
    req.on('data', chunk => {
      chunks.push(chunk);
      totalLen += chunk.length;
      if (totalLen > 100 * 1024 * 1024) { // 100MB audio limit
        req.destroy();
        reject(new Error('Audio payload exceeds 100MB limit'));
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Native OS file picker dialog
 */
function pickNativeFile() {
  return new Promise(resolve => {
    const platform = process.platform;
    let proc;

    if (platform === 'linux') {
      proc = spawn('zenity', [
        '--file-selection',
        '--title=Select Audio File for MIDI Extraction',
        '--file-filter=Audio Files (mp3, wav, flac, ogg, m4a, aac)|*.mp3 *.wav *.flac *.ogg *.m4a *.aac *.opus *.wma'
      ]);
    } else if (platform === 'darwin') {
      const script = 'choose file of type {"mp3", "wav", "flac", "ogg", "m4a", "aac"} with prompt "Select Audio File for MIDI Extraction"';
      proc = spawn('osascript', ['-e', script]);
    } else if (platform === 'win32') {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = "Audio Files|*.mp3;*.wav;*.flac;*.ogg;*.m4a;*.aac"; if($f.ShowDialog() -eq 'OK'){Write-Output $f.FileName}`;
      proc = spawn('powershell', ['-NoProfile', '-Command', ps]);
    } else {
      return resolve(null);
    }

    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.on('close', code => {
      if (code === 0 && out.trim()) {
        resolve(out.trim());
      } else {
        resolve(null);
      }
    });
    proc.on('error', () => resolve(null));
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = urlObj.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-filename, X-Filename, *',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  // Health check
  if (pathname === '/health' || pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      app: 'midi-extractor',
      name: 'Sovereign Audio-to-MIDI Neural Studio',
      version: '1.0.0',
      port: PORT,
      modelReady: fs.existsSync(MODEL_PATH)
    });
  }

  // Native OS file picker
  if (pathname === '/api/pick-file' && req.method === 'POST') {
    try {
      const filePath = await pickNativeFile();
      if (filePath && fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        return sendJson(res, 200, {
          success: true,
          filePath,
          fileName: path.basename(filePath),
          size: stats.size
        });
      }
      return sendJson(res, 200, { success: false, reason: 'canceled_or_unsupported' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Upload endpoint (supports JSON base64 or raw stream with x-filename header)
  if (pathname === '/api/upload' && req.method === 'POST') {
    try {
      const contentType = req.headers['content-type'] || '';
      let targetPath;
      let rawHeaderName = req.headers['x-filename'] || req.headers['X-Filename'] || `audio_${Date.now()}.wav`;
      let originalName = rawHeaderName;
      try {
        originalName = decodeURIComponent(rawHeaderName);
      } catch (_) {
        originalName = rawHeaderName;
      }

      if (contentType.includes('application/json')) {
        const body = await parseJsonBody(req);
        if (!body.base64Data) {
          return sendJson(res, 400, { error: 'Missing base64Data in JSON body' });
        }
        if (body.fileName) originalName = body.fileName;
        
        const cleanBase64 = body.base64Data.replace(/^data:audio\/\w+;base64,/, '');
        const buffer = Buffer.from(cleanBase64, 'base64');
        const safeBase = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
        targetPath = path.join(TEMP_DIR, `${Date.now()}_${safeBase}`);
        fs.writeFileSync(targetPath, buffer);
      } else {
        const buffer = await parseBinaryBody(req);
        if (buffer.length === 0) {
          return sendJson(res, 400, { error: 'Empty file payload' });
        }
        const safeBase = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
        targetPath = path.join(TEMP_DIR, `${Date.now()}_${safeBase}`);
        fs.writeFileSync(targetPath, buffer);
      }

      const stats = fs.statSync(targetPath);
      return sendJson(res, 200, {
        success: true,
        filePath: targetPath,
        fileName: path.basename(targetPath),
        originalName,
        size: stats.size
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Transcription endpoint
  if (pathname === '/api/transcribe' && req.method === 'POST') {
    try {
      const params = await parseJsonBody(req);
      const inputPath = params.filePath;

      if (!inputPath || !fs.existsSync(inputPath)) {
        return sendJson(res, 400, { error: `Input audio file not found: ${inputPath}` });
      }

      const fileBase = path.basename(inputPath, path.extname(inputPath));
      const midiFileName = `${fileBase}_${Date.now()}.mid`;
      const outputMidiPath = path.join(TEMP_DIR, midiFileName);

      const args = [
        SCRIPT_PATH,
        '--input', inputPath,
        '--output-midi', outputMidiPath,
        '--model-path', MODEL_PATH,
        '--onset-thresh', String(params.onsetThreshold ?? 0.5),
        '--frame-thresh', String(params.frameThreshold ?? 0.3),
        '--min-note-len', String(params.minNoteLengthMs ?? 127.7),
        '--tempo', String(params.tempo ?? 120.0)
      ];

      if (params.includePitchBends === false) {
        args.push('--no-pitch-bends');
      }

      const pyProc = spawn('python3', args);
      let stdoutData = '';
      let stderrData = '';

      pyProc.stdout.on('data', chunk => { stdoutData += chunk.toString(); });
      pyProc.stderr.on('data', chunk => { stderrData += chunk.toString(); });

      pyProc.on('close', code => {
        if (code !== 0) {
          let errDetail = stderrData || 'Transcription failed';
          try {
            const parsedErr = JSON.parse(stderrData);
            if (parsedErr.message) errDetail = parsedErr.message;
          } catch (_) {}
          return sendJson(res, 500, { error: errDetail });
        }

        try {
          const result = JSON.parse(stdoutData.trim());
          result.downloadUrl = `/api/download/${midiFileName}`;
          result.midiFileName = midiFileName;
          return sendJson(res, 200, { success: true, data: result });
        } catch (jsonErr) {
          return sendJson(res, 500, {
            error: `Failed to parse transcription output: ${jsonErr.message}`,
            raw: stdoutData
          });
        }
      });

    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // Download endpoint
  if (pathname.startsWith('/api/download/')) {
    const reqFile = path.basename(pathname.replace('/api/download/', ''));
    const safeFilePath = path.join(TEMP_DIR, reqFile);

    if (fs.existsSync(safeFilePath) && fs.statSync(safeFilePath).isFile()) {
      res.writeHead(200, {
        'Content-Type': 'audio/midi',
        'Content-Disposition': `attachment; filename="${reqFile}"`,
        'Access-Control-Allow-Origin': '*'
      });
      const stream = fs.createReadStream(safeFilePath);
      return stream.pipe(res);
    }
    return sendJson(res, 404, { error: 'File not found or expired' });
  }

  // Static files for GUI
  let reqPath = pathname;
  if (reqPath === '/' || reqPath === '/gui' || reqPath === '/gui/') {
    reqPath = '/index.html';
  } else if (reqPath.startsWith('/gui/')) {
    reqPath = reqPath.replace(/^\/gui/, '');
  }

  const filePath = path.join(GUI_DIR, reqPath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Internal Server Error: ${err.message}`);
      }
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(content);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[MIDI Extractor Engine] Sovereign Audio-to-MIDI service online at http://${HOST}:${PORT}`);
});
