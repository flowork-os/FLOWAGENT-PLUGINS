import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.FLOWORK_APP_PORT || process.env.PORT || '17880', 10);
const HOST = '127.0.0.1';

// Base workspace temp directory
const TEMP_DIR = path.join(os.tmpdir(), 'flowork_stem_separator');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const GUI_DIR = path.resolve(__dirname, '..', 'gui');
const SCRIPT_PATH = path.resolve(__dirname, 'separator.py');

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
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.zip': 'application/zip'
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
      if (raw.length > 50 * 1024 * 1024) {
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
      if (totalLen > 150 * 1024 * 1024) { // 150MB upload limit
        req.destroy();
        reject(new Error('Audio payload exceeds 150MB limit'));
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function pickNativeFile() {
  return new Promise(resolve => {
    const platform = process.platform;
    let proc;

    if (platform === 'linux') {
      proc = spawn('zenity', [
        '--file-selection',
        '--title=Select Audio File for Stem Separation',
        '--file-filter=Audio Files (mp3, wav, flac, ogg, m4a, aac)|*.mp3 *.wav *.flac *.ogg *.m4a *.aac *.opus *.wma'
      ]);
    } else if (platform === 'darwin') {
      const script = 'choose file of type {"mp3", "wav", "flac", "ogg", "m4a", "aac"} with prompt "Select Audio File for Stem Separation"';
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

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-filename, X-Filename, *',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  // Health Endpoint
  if (pathname === '/health' || pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      app: 'stem-separator',
      name: 'Sovereign Vocal & Stem Demixer Studio',
      version: '1.0.0',
      port: PORT,
      engine: 'Meta AI Demucs v4 (Hybrid Transformer)'
    });
  }

  // Native OS File Picker
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

  // Upload Endpoint
  if (pathname === '/api/upload' && req.method === 'POST') {
    try {
      const contentType = req.headers['content-type'] || '';
      let targetPath;
      let rawHeaderName = req.headers['x-filename'] || req.headers['X-Filename'] || `track_${Date.now()}.wav`;
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

  // Separation Endpoint
  if (pathname === '/api/separate' && req.method === 'POST') {
    try {
      const params = await parseJsonBody(req);
      const inputPath = params.filePath;

      if (!inputPath || !fs.existsSync(inputPath)) {
        return sendJson(res, 400, { error: `Input audio file not found: ${inputPath}` });
      }

      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const jobOutputDir = path.join(TEMP_DIR, jobId);
      fs.mkdirSync(jobOutputDir, { recursive: true });

      const mode = params.mode || 'four-stems'; // 'two-stems-vocals', 'four-stems', 'six-stems'
      const format = params.format || 'wav'; // 'wav', 'mp3', 'flac'
      const shifts = params.shifts !== undefined ? String(params.shifts) : '1';

      const args = [
        SCRIPT_PATH,
        '--input', inputPath,
        '--output-dir', jobOutputDir,
        '--mode', mode,
        '--format', format,
        '--shifts', shifts,
        '--device', 'auto'
      ];

      const pyProc = spawn('python3', args);
      let stdoutData = '';
      let stderrData = '';

      pyProc.stdout.on('data', chunk => { stdoutData += chunk.toString(); });
      pyProc.stderr.on('data', chunk => { stderrData += chunk.toString(); });

      pyProc.on('close', code => {
        if (code !== 0) {
          let errDetail = stderrData || 'Demucs separation failed';
          try {
            const parsedErr = JSON.parse(stderrData);
            if (parsedErr.message) errDetail = parsedErr.message;
          } catch (_) {}
          return sendJson(res, 500, { error: errDetail });
        }

        try {
          const result = JSON.parse(stdoutData.trim());
          result.jobId = jobId;

          // Attach downloadable URLs to each stem
          for (const key of Object.keys(result.stems)) {
            result.stems[key].downloadUrl = `/api/download/${jobId}/${result.stems[key].filename}`;
          }

          result.zipDownloadUrl = `/api/download/${jobId}/${result.zip_filename}`;
          return sendJson(res, 200, { success: true, data: result });
        } catch (jsonErr) {
          return sendJson(res, 500, {
            error: `Failed to parse separation output: ${jsonErr.message}`,
            raw: stdoutData
          });
        }
      });

    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // Download Endpoint (safely scoped to jobId)
  if (pathname.startsWith('/api/download/')) {
    const parts = pathname.replace('/api/download/', '').split('/');
    if (parts.length >= 2) {
      const safeJobId = path.basename(parts[0]);
      const safeFileName = path.basename(parts[1]);
      const candidatePaths = [
        path.join(TEMP_DIR, safeJobId, 'htdemucs', safeFileName),
        path.join(TEMP_DIR, safeJobId, 'htdemucs_6s', safeFileName),
        path.join(TEMP_DIR, safeJobId, safeFileName)
      ];

      let targetPath = null;
      for (const p of candidatePaths) {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          targetPath = p;
          break;
        }
      }

      if (targetPath) {
        const ext = path.extname(targetPath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Disposition': `attachment; filename="${safeFileName}"`,
          'Access-Control-Allow-Origin': '*'
        });

        const stream = fs.createReadStream(targetPath);
        return stream.pipe(res);
      }
    }
    return sendJson(res, 404, { error: 'Stem file not found or expired' });
  }

  // Static GUI serving
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
  console.log(`[Stem Separator Engine] Demucs v4 Studio online at http://${HOST}:${PORT}`);
});
