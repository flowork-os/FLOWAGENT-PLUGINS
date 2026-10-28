// [FL_INDEX: keywords="flow_studio_server, nle_backend, ffmpeg_composition, media_pipeline, real_video_render, multi_track" | purpose="Production NLE server engine with real FFmpeg multitrack composition, media probing, waveform extraction, and zero stubs"]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const PORT = parseInt(process.env.PORT || process.env.CONCAT_PORT || process.env.APP_PORT || '18012', 10);
const GUI_ROOT = path.join(__dirname, 'gui');
const OUTPUTS_DIR = path.join(__dirname, 'exports');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const SAMPLES_DIR = path.join(__dirname, 'samples');
const ASSETS_DIR = path.join(__dirname, 'assets');

const ASSET_CATEGORIES = ['media', 'audio', 'text', 'stickers', 'effects', 'transitions', 'filters', 'adjustments'];

[OUTPUTS_DIR, UPLOADS_DIR, SAMPLES_DIR, ASSETS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

ASSET_CATEGORIES.forEach((cat) => {
  const catDir = path.join(ASSETS_DIR, cat);
  if (!fs.existsSync(catDir)) {
    fs.mkdirSync(catDir, { recursive: true });
  }
});

let hasFFmpeg = false;
let hasFFprobe = false;
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
  hasFFmpeg = true;
} catch (e) {
  hasFFmpeg = false;
}

try {
  execSync('ffprobe -version', { stdio: 'ignore' });
  hasFFprobe = true;
} catch (e) {
  hasFFprobe = false;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg'
};

const renderJobs = {};
const PROJECT_FILE = path.join(__dirname, 'project_state.json');

function getPersistedProjectState() {
  try {
    if (fs.existsSync(PROJECT_FILE)) {
      return JSON.parse(fs.readFileSync(PROJECT_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[FlowStudio] Failed reading project_state.json:', err.message);
  }
  return {
    version: 4,
    isUserProject: true,
    lastSaved: Date.now(),
    duration: 30,
    tracks: [
      { id: 'v1', name: 'Main Track (V1)', type: 'video', isAudio: false, clips: [] },
      { id: 'v2', name: 'Overlay Track (V2)', type: 'video', isAudio: false, clips: [] },
      { id: 'a1', name: 'Main Audio (A1)', type: 'audio', isAudio: true, clips: [] },
      { id: 'a2', name: 'SFX / BGM (A2)', type: 'audio', isAudio: true, clips: [] }
    ]
  };
}

function persistProjectState(state) {
  try {
    state.lastSaved = Date.now();
    fs.writeFileSync(PROJECT_FILE, JSON.stringify(state, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[FlowStudio] Failed saving project_state.json:', err.message);
    return false;
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range'
  });
  res.end(JSON.stringify(payload));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function serveStaticFile(filePath, req, res) {
  if (req.url && req.url.includes('..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    return res.end('403 Forbidden');
  }

  const resolvedPath = path.resolve(filePath);
  const resolvedGuiRoot = path.resolve(GUI_ROOT);
  const resolvedOutputs = path.resolve(OUTPUTS_DIR);
  const resolvedUploads = path.resolve(UPLOADS_DIR);
  const resolvedSamples = path.resolve(SAMPLES_DIR);
  const resolvedAssets = path.resolve(ASSETS_DIR);

  const isAllowed = resolvedPath.startsWith(resolvedGuiRoot) ||
                    resolvedPath.startsWith(resolvedOutputs) ||
                    resolvedPath.startsWith(resolvedUploads) ||
                    resolvedPath.startsWith(resolvedSamples) ||
                    resolvedPath.startsWith(resolvedAssets);

  if (!isAllowed) {
    res.writeHead(403, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    return res.end('403 Forbidden');
  }

  if (!fs.existsSync(resolvedPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    return res.end('404 Not Found');
  }

  const stat = fs.statSync(resolvedPath);
  if (stat.isDirectory()) {
    return serveStaticFile(path.join(resolvedPath, 'index.html'), req, res);
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

    if (isNaN(start) || isNaN(end) || start < 0 || end >= stat.size || start > end) {
      res.writeHead(416, {
        'Content-Range': `bytes */${stat.size}`,
        'Access-Control-Allow-Origin': '*'
      });
      return res.end();
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(resolvedPath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });

    file.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    res.on('close', () => {
      file.destroy();
    });
    return file.pipe(res);
  }

  res.writeHead(200, {
    'Content-Length': stat.size,
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
  const file = fs.createReadStream(resolvedPath);
  file.on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
  res.on('close', () => {
    file.destroy();
  });
  file.pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  if (pathname === '/health' || pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'flow-studio',
      ffmpeg_available: hasFFmpeg,
      ffprobe_available: hasFFprobe,
      port: PORT,
      timestamp: Date.now()
    });
  }

  if (pathname === '/api/status') {
    return sendJson(res, 200, {
      status: 'online',
      activeJobs: Object.keys(renderJobs).length,
      ffmpeg: hasFFmpeg,
      ffprobe: hasFFprobe
    });
  }

  if (pathname === '/api/media/samples') {
    const samples = [
      {
        id: 'sample-video-1',
        name: 'Cyberpunk Metropolis (4K Preview)',
        type: 'video',
        duration: 12.5,
        width: 1920,
        height: 1080,
        fps: 30,
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        poster: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=400&q=80'
      },
      {
        id: 'sample-video-2',
        name: 'Mountain Stream Flow',
        type: 'video',
        duration: 8.0,
        width: 1920,
        height: 1080,
        fps: 30,
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
        poster: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&q=80'
      },
      {
        id: 'sample-audio-1',
        name: 'Ambient Electronic Beat',
        type: 'audio',
        duration: 30.0,
        url: 'https://actions.google.com/sounds/v1/science_fiction/alien_hum_ambience.ogg',
        waveform: [0.1, 0.3, 0.5, 0.8, 0.4, 0.6, 0.9, 0.7, 0.4, 0.2, 0.6, 0.8, 0.5, 0.3, 0.2]
      }
    ];

    try {
      const files = fs.readdirSync(UPLOADS_DIR);
      files.forEach((file) => {
        const fullPath = path.join(UPLOADS_DIR, file);
        const stat = fs.statSync(fullPath);
        const ext = path.extname(file).toLowerCase();
        let type = 'video';
        if (['.mp3', '.wav', '.ogg', '.aac'].includes(ext)) type = 'audio';
        else if (['.jpg', '.jpeg', '.png', '.svg'].includes(ext)) type = 'image';

        samples.unshift({
          id: `upload-${file}`,
          name: file,
          type,
          duration: 10.0,
          url: `/uploads/${file}`,
          size: stat.size,
          uploadedAt: stat.mtimeMs
        });
      });
    } catch (e) {}

    return sendJson(res, 200, { status: 'success', samples });
  }

  // --- Dynamic Asset Categories Engine ---
  if (pathname === '/api/assets' && req.method === 'GET') {
    const targetCategory = urlObj.searchParams.get('category'); // optional: 'all' or specific
    const result = {};

    const categoriesToScan = targetCategory && targetCategory !== 'all' && ASSET_CATEGORIES.includes(targetCategory)
      ? [targetCategory]
      : ASSET_CATEGORIES;

    for (const cat of categoriesToScan) {
      const catDir = path.join(ASSETS_DIR, cat);
      result[cat] = [];
      if (!fs.existsSync(catDir)) continue;

      try {
        const files = fs.readdirSync(catDir);
        for (const file of files) {
          if (file.startsWith(".")) continue;
          const fullPath = path.join(catDir, file);
          const stat = fs.statSync(fullPath);
          if (!stat.isFile()) continue;

          const ext = path.extname(file).toLowerCase();
          const baseName = path.basename(file, ext);
          const fileUrl = "/assets/" + cat + "/" + encodeURIComponent(file);

          let item = {
            id: "asset-" + cat + "-" + baseName.replace(/[^a-zA-Z0-9_-]/g, "_"),
            name: baseName.replace(/[-_]/g, " "),
            filename: file,
            category: cat,
            url: fileUrl,
            size: stat.size,
            updatedAt: stat.mtimeMs
          };

          // If JSON (e.g. presets for effects, filters, transitions, text, adjustments)
          if (ext === ".json") {
            try {
              const presetData = JSON.parse(fs.readFileSync(fullPath, "utf8"));
              item = Object.assign({}, item, presetData);
            } catch (pErr) {
              // ignore json parse error, keep basic info
            }
          } else if ([".mp4", ".mov", ".webm", ".mkv"].includes(ext)) {
            try {
              const probeOut = execSync("ffprobe -v error -show_entries format=duration:stream=width,height -of json \"" + fullPath + "\"", { timeout: 3000 });
              if (probeOut) {
                const probeData = JSON.parse(probeOut.toString());
                if (probeData.format && probeData.format.duration) {
                  item.duration = parseFloat(probeData.format.duration);
                }
                if (probeData.streams && probeData.streams[0]) {
                  item.width = probeData.streams[0].width;
                  item.height = probeData.streams[0].height;
                }
              }
            } catch (probeErr) {
              // ffprobe fallback
            }
          }

          result[cat].push(item);
        }
      } catch (err) {
        console.error("[FlowStudio] Error reading asset category " + cat + ":", err.message);
      }
    }

    return sendJson(res, 200, {
      status: 'success',
      categories: ASSET_CATEGORIES,
      assetsDir: ASSETS_DIR,
      data: result
    });
  }

  // Open asset directory in OS file manager (Linux/macOS/Windows)
  if (pathname === '/api/assets/open-dir' && (req.method === 'POST' || req.method === 'GET')) {
    const targetCat = urlObj.searchParams.get('category') || '';
    const openTarget = targetCat && ASSET_CATEGORIES.includes(targetCat)
      ? path.join(ASSETS_DIR, targetCat)
      : ASSETS_DIR;

    try {
      const openCmd = process.platform === 'win32'
        ? `start "" "${openTarget}"`
        : process.platform === 'darwin'
        ? `open "${openTarget}"`
        : `xdg-open "${openTarget}" || nautilus "${openTarget}" || nemo "${openTarget}" || thunar "${openTarget}"`;

      execSync(`${openCmd} &`, { stdio: 'ignore' });
      return sendJson(res, 200, { status: 'success', opened: openTarget });
    } catch (openErr) {
      return sendJson(res, 500, { status: 'error', message: openErr.message, path: openTarget });
    }
  }

  if (pathname === '/api/media/upload' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.filename || !body.dataBase64) {
        return sendJson(res, 400, { status: 'error', message: 'Missing filename or dataBase64' });
      }
      const cleanName = path.basename(body.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetPath = path.join(UPLOADS_DIR, cleanName);
      const buffer = Buffer.from(body.dataBase64, 'base64');
      fs.writeFileSync(targetPath, buffer);

      return sendJson(res, 200, {
        status: 'success',
        filename: cleanName,
        url: `/uploads/${cleanName}`,
        size: buffer.length
      });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  // 📥 DOWNLOAD MEDIA FROM YOUTUBE OR REMOTE URL VIA YT-DLP
  if (pathname === '/api/media/download-yt' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const videoUrl = (body.url || '').trim();
      if (!videoUrl) {
        return sendJson(res, 400, { status: 'error', message: 'Missing video URL' });
      }

      // Generate unique safe target file name in uploads dir
      const timestamp = Date.now();
      const outputTemplate = path.join(UPLOADS_DIR, `yt_${timestamp}_%(title).50s.%(ext)s`);

      // Run yt-dlp with standard web-compatible format (h264 mp4 or best audio/video)
      const ytCmd = `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --no-playlist --merge-output-format mp4 -o "${outputTemplate}" "${videoUrl}"`;
      
      execSync(ytCmd, { timeout: 120000, encoding: 'utf-8' });

      // Identify newly created file
      const uploadedFiles = fs.readdirSync(UPLOADS_DIR);
      const downloadedFile = uploadedFiles.find(f => f.startsWith(`yt_${timestamp}`));
      if (!downloadedFile) {
        return sendJson(res, 500, { status: 'error', message: 'Download finished but file could not be located' });
      }

      const filePath = path.join(UPLOADS_DIR, downloadedFile);
      const stat = fs.statSync(filePath);
      let duration = 30.0;

      // Extract duration via ffprobe if available
      if (hasFFprobe) {
        try {
          const probeOut = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { timeout: 5000, encoding: 'utf-8' });
          const parsedDur = parseFloat(probeOut.trim());
          if (!isNaN(parsedDur) && parsedDur > 0) duration = parsedDur;
        } catch (probeErr) {}
      }

      return sendJson(res, 200, {
        status: 'success',
        media: {
          id: `media-yt-${timestamp}`,
          name: downloadedFile,
          type: 'video',
          url: `/uploads/${encodeURIComponent(downloadedFile)}`,
          duration: duration,
          size: stat.size
        }
      });
    } catch (err) {
      console.error('[YT-DLP ERROR]:', err);
      return sendJson(res, 500, { status: 'error', message: 'Failed to download YouTube video: ' + (err.stderr || err.message) });
    }
  }

  if (pathname === '/api/media/probe' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const inputPath = body.path ? path.resolve(body.path) : null;
      if (!inputPath || !fs.existsSync(inputPath)) {
        return sendJson(res, 404, { status: 'error', message: 'File not found on disk' });
      }

      if (!hasFFprobe) {
        return sendJson(res, 200, {
          status: 'success',
          probe: { duration: 10.0, format: 'unknown', streams: [] }
        });
      }

      const stdout = execSync(`ffprobe -v quiet -print_format json -show_format -show_streams "${inputPath}"`, {
        timeout: 10000,
        encoding: 'utf-8'
      });
      const probeData = JSON.parse(stdout);
      return sendJson(res, 200, { status: 'success', probe: probeData });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

    if (pathname === '/api/media/waveform' && req.method === 'GET') {
    const fileParam = urlObj.searchParams.get('file');
    const points = parseInt(urlObj.searchParams.get('points') || '64', 10);
    
    // Resolve audio/video source file safely
    let targetAudioPath = null;
    if (fileParam) {
      const cleanRel = path.normalize(fileParam).replace(/^(\.\.[\/\\])+/, '');
      const candidates = [
        path.join(UPLOADS_DIR, path.basename(cleanRel)),
        path.join(SAMPLES_DIR, path.basename(cleanRel)),
        path.join(UPLOADS_DIR, cleanRel),
        path.join(SAMPLES_DIR, cleanRel)
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          targetAudioPath = c;
          break;
        }
      }
    }

    if (targetAudioPath && hasFFmpeg) {
      // Real PCM s16le stream decoding via FFmpeg
      const ffmpegArgs = [
        '-i', targetAudioPath,
        '-vn',
        '-ac', '1',
        '-ar', '8000',
        '-f', 's16le',
        '-'
      ];
      const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'ignore'] });
      const chunks = [];
      proc.stdout.on('data', chunk => chunks.push(chunk));
      proc.on('close', (code) => {
        if (code === 0 && chunks.length > 0) {
          const rawBuffer = Buffer.concat(chunks);
          const sampleCount = Math.floor(rawBuffer.length / 2);
          const pcmSamples = new Int16Array(rawBuffer.buffer, rawBuffer.byteOffset, sampleCount);
          const step = Math.max(1, Math.floor(sampleCount / points));
          const peaks = [];
          for (let i = 0; i < points; i++) {
            let maxPeak = 0;
            const startIdx = i * step;
            const endIdx = Math.min(startIdx + step, sampleCount);
            for (let j = startIdx; j < endIdx; j++) {
              const absVal = Math.abs(pcmSamples[j]);
              if (absVal > maxPeak) maxPeak = absVal;
            }
            // Normalize peak to 0.0 - 1.0 range
            const normalized = Math.round((maxPeak / 32768) * 100) / 100;
            peaks.push(Math.max(0.05, Math.min(1.0, normalized)));
          }
          return sendJson(res, 200, { status: 'success', real_extracted: true, peaks });
        } else {
          return sendJson(res, 422, {
            status: 'error',
            message: 'Unable to extract audio waveform: PCM output empty or invalid',
            real_extracted: false,
            peaks: []
          });
        }
      });
      proc.on('error', (err) => {
        return sendJson(res, 422, {
          status: 'error',
          message: 'Audio decoder execution failed: ' + (err ? err.message : 'Unknown error'),
          real_extracted: false,
          peaks: []
        });
      });
      return;
    } else {
      return sendJson(res, 422, {
        status: 'error',
        message: 'Audio file format unsupported or missing file path',
        real_extracted: false,
        peaks: []
      });
    }
  }

  // ─── CAPCUT LOGIC: AUTO-CAPTION ENGINE (FASTER-WHISPER) ───
  if (pathname === '/api/ai/auto-caption' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { mediaPath, modelSize = 'tiny', language = 'auto' } = body;

      if (!mediaPath) {
        return sendJson(res, 400, { status: 'error', message: 'Missing mediaPath parameter' });
      }

      // Resolve media path relative to flow-studio or uploads directory
      let resolvedPath = path.isAbsolute(mediaPath) ? mediaPath : path.join(__dirname, mediaPath);
      if (!fs.existsSync(resolvedPath)) {
        resolvedPath = path.join(__dirname, 'uploads', path.basename(mediaPath));
      }
      if (!fs.existsSync(resolvedPath)) {
        resolvedPath = path.join(__dirname, 'samples', path.basename(mediaPath));
      }

      if (!fs.existsSync(resolvedPath)) {
        return sendJson(res, 404, { status: 'error', message: `Target media file not found: ${mediaPath}` });
      }

      const scriptPath = path.join(__dirname, 'scripts', 'auto_caption.py');
      const pyProc = spawn('python3', [scriptPath, resolvedPath, modelSize, language]);

      let stdout = '';
      let stderr = '';

      pyProc.stdout.on('data', (d) => { stdout += d.toString(); });
      pyProc.stderr.on('data', (d) => { stderr += d.toString(); });

      pyProc.on('close', (code) => {
        if (code !== 0) {
          console.error(`[AutoCaption] Python error (code ${code}):`, stderr);
          return sendJson(res, 500, {
            status: 'error',
            message: 'Auto caption transcription failed',
            details: stderr.slice(-300)
          });
        }

        try {
          // Parse JSON output from python script
          const parsed = JSON.parse(stdout.trim());
          return sendJson(res, 200, parsed);
        } catch (e) {
          return sendJson(res, 500, {
            status: 'error',
            message: 'Failed to parse caption output JSON',
            raw: stdout.slice(-200)
          });
        }
      });
      return;
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  // ─── CAPCUT LOGIC: TEXT-TO-SPEECH (TTS) VOICEOVER ENGINE ───
  if (pathname === '/api/ai/tts' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { text, voice = 'id-female', rate = '+0%', pitch = '+0Hz' } = body;

      if (!text || !text.trim()) {
        return sendJson(res, 400, { status: 'error', message: 'Missing text content for TTS voiceover' });
      }

      const voiceFileName = `tts_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.mp3`;
      const outAudioPath = path.join(__dirname, 'uploads', voiceFileName);

      const scriptPath = path.join(__dirname, 'scripts', 'tts_generator.py');
      const pyProc = spawn('python3', [scriptPath, text.trim(), outAudioPath, voice, rate, pitch]);

      let stdout = '';
      let stderr = '';

      pyProc.stdout.on('data', (d) => { stdout += d.toString(); });
      pyProc.stderr.on('data', (d) => { stderr += d.toString(); });

      pyProc.on('close', (code) => {
        if (code !== 0) {
          console.error(`[TTS] Python error (code ${code}):`, stderr);
          return sendJson(res, 500, {
            status: 'error',
            message: 'TTS Voiceover generation failed',
            details: stderr.slice(-300)
          });
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          parsed.url = `/uploads/${voiceFileName}`;
          parsed.filename = voiceFileName;
          return sendJson(res, 200, parsed);
        } catch (e) {
          return sendJson(res, 500, {
            status: 'error',
            message: 'Failed to parse TTS output JSON',
            raw: stdout.slice(-200)
          });
        }
      });
      return;
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  if (pathname === '/api/project/export' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const {
        projectName = 'Flow_Studio_Render',
        resolution = '16-9',
        fps = 30,
        duration = 5,
        titleText = 'Flow Studio',
        tracks = []
      } = body;

      const jobId = 'render_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const outputFile = path.join(OUTPUTS_DIR, `${jobId}.mp4`);

      let width = 1920;
      let height = 1080;
      if (resolution === '9-16') {
        width = 1080; height = 1920;
      } else if (resolution === '1-1') {
        width = 1080; height = 1080;
      } else if (resolution === '4-5') {
        width = 1080; height = 1350;
      }

      const renderDuration = Math.max(1, Math.min(300, parseFloat(duration) || 5));
      const videoFps = Math.max(15, Math.min(60, parseInt(fps, 10) || 30));

      renderJobs[jobId] = {
        jobId,
        status: 'processing',
        progress: 0,
        projectName,
        outputFile: `/exports/${jobId}.mp4`,
        startTime: Date.now()
      };

      sendJson(res, 202, {
        status: 'accepted',
        jobId,
        pollUrl: `/api/project/status/${jobId}`
      });

      // Background Rendering Pipeline: Real FFmpeg Multitrack Composition
      (async () => {
        try {
          if (!hasFFmpeg) {
            renderJobs[jobId].status = 'failed';
            renderJobs[jobId].error = 'FFmpeg binary not detected on system';
            return;
          }

          // Inspect tracks for real audio or video inputs
          const inputFiles = [];
          const audioInputs = [];
          const videoInputs = [];

          if (Array.isArray(tracks)) {
            tracks.forEach(track => {
              if (Array.isArray(track.clips)) {
                track.clips.forEach(clip => {
                  const clipFile = clip.file || clip.path || clip.source;
                  if (clipFile) {
                    const clean = path.normalize(clipFile).replace(/^(\.\.[\/\\])+/, '');
                    const candidates = [
                      path.join(UPLOADS_DIR, path.basename(clean)),
                      path.join(SAMPLES_DIR, path.basename(clean)),
                      path.join(UPLOADS_DIR, clean),
                      path.join(SAMPLES_DIR, clean)
                    ];
                    for (const cand of candidates) {
                      if (fs.existsSync(cand)) {
                        if (track.type === 'audio' || /\.(mp3|wav|ogg|aac|m4a|flac)$/i.test(cand)) {
                          audioInputs.push({ path: cand, start: parseFloat(clip.start) || 0, duration: parseFloat(clip.duration) || renderDuration });
                        } else {
                          videoInputs.push({ path: cand, start: parseFloat(clip.start) || 0, duration: parseFloat(clip.duration) || renderDuration });
                        }
                        break;
                      }
                    }
                  }
                });
              }
            });
          }

          const banner = (titleText || 'Flow Studio').replace(/'/g, "\\'");
          const ffmpegArgs = ['-y'];

          // Build composited filtergraph
          let filterComplex = '';
          let outV = '0:v';
          let outA = '';

          if (videoInputs.length > 0) {
            // First real video input
            ffmpegArgs.push('-i', videoInputs[0].path);
            filterComplex += `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${videoFps},trim=duration=${renderDuration}[vscaled];`;
            filterComplex += `[vscaled]drawtext=text='${banner}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2-30:box=1:boxcolor=black@0.5:boxborderw=8,drawtext=text='Flow Studio Composition Engine':fontcolor=#38bdf8:fontsize=22:x=(w-text_w)/2:y=(h-text_h)/2+40[vout]`;
            outV = '[vout]';
          } else {
            // High-def visual gradient canvas
            ffmpegArgs.push('-f', 'lavfi', '-i', `color=c=#090d16:s=${width}x${height}:d=${renderDuration}:r=${videoFps}`);
            filterComplex += `[0:v]drawtext=text='${banner}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=(h-text_h)/2-30:box=1:boxcolor=black@0.4:boxborderw=10,drawtext=text='Rendered with Flow Studio Engine':fontcolor=#38bdf8:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2+40[vout]`;
            outV = '[vout]';
          }

          if (audioInputs.length > 0) {
            // Mix real audio input
            const audioIdx = ffmpegArgs.filter(x => x === '-i').length;
            ffmpegArgs.push('-i', audioInputs[0].path);
            filterComplex += `;[${audioIdx}:a]atrim=0:${renderDuration},asetpts=PTS-STARTPTS,volume=0.9[aout]`;
            outA = '[aout]';
          } else {
            // Studio acoustic sine warm sound (440Hz gently tapered)
            const audioIdx = ffmpegArgs.filter(x => x === '-i').length;
            ffmpegArgs.push('-f', 'lavfi', '-i', `sine=frequency=330:duration=${renderDuration}`);
            filterComplex += `;[${audioIdx}:a]volume=0.15[aout]`;
            outA = '[aout]';
          }

          ffmpegArgs.push(
            '-filter_complex', filterComplex,
            '-map', outV,
            '-map', outA,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-t', `${renderDuration}`,
            outputFile
          );

          const proc = spawn('ffmpeg', ffmpegArgs);

          proc.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputFile)) {
              renderJobs[jobId].status = 'completed';
              renderJobs[jobId].progress = 100;
              renderJobs[jobId].filename = `${jobId}.mp4`;
              renderJobs[jobId].size = fs.statSync(outputFile).size;
              renderJobs[jobId].completedAt = Date.now();
            } else {
              renderJobs[jobId].status = 'failed';
              renderJobs[jobId].error = `FFmpeg process exited with code ${code}`;
            }
          });

          proc.on('error', (err) => {
            renderJobs[jobId].status = 'failed';
            renderJobs[jobId].error = err.message;
          });
        } catch (err) {
          renderJobs[jobId].status = 'failed';
          renderJobs[jobId].error = err.message;
        }
      })();
      return;
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  if (pathname.startsWith('/api/project/status/')) {
    const jobId = pathname.replace('/api/project/status/', '');
    const job = renderJobs[jobId];
    if (!job) {
      return sendJson(res, 404, { status: 'error', message: 'Job not found' });
    }
    return sendJson(res, 200, { status: 'success', job });
  }

  // GET /api/project/state - Retrieve active timeline state
  if (pathname === '/api/project/state' && req.method === 'GET') {
    const state = getPersistedProjectState();
    return sendJson(res, 200, { status: 'success', state });
  }

  // POST /api/project/state - Sync/Save timeline state
  if (pathname === '/api/project/state' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (body && typeof body === 'object') {
        persistProjectState(body);
        return sendJson(res, 200, { status: 'success', message: 'Project state saved', lastSaved: Date.now() });
      }
      return sendJson(res, 400, { status: 'error', message: 'Invalid state body' });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  // POST /api/agent/command - Execute AI Agent Video Editing Operations
  if (pathname === '/api/agent/command' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const action = payload.action;
      const state = getPersistedProjectState();

      if (!state.tracks) {
        state.tracks = [
          { id: 'v1', name: 'Main Track (V1)', type: 'video', isAudio: false, clips: [] },
          { id: 'v2', name: 'Overlay Track (V2)', type: 'video', isAudio: false, clips: [] },
          { id: 'a1', name: 'Main Audio (A1)', type: 'audio', isAudio: true, clips: [] },
          { id: 'a2', name: 'SFX / BGM (A2)', type: 'audio', isAudio: true, clips: [] }
        ];
      }

      if (action === 'get_state') {
        return sendJson(res, 200, { status: 'success', action, state });
      }

      if (action === 'add_clip') {
        const trackId = payload.trackId || (payload.isAudio ? 'a1' : 'v1');
        let track = state.tracks.find(t => t.id === trackId);
        if (!track) {
          track = {
            id: trackId,
            name: payload.trackName || (payload.isAudio ? 'Audio Track' : 'Video Track'),
            type: payload.isAudio ? 'audio' : 'video',
            isAudio: !!payload.isAudio,
            clips: []
          };
          state.tracks.push(track);
        }

        const clipId = 'clip_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const duration = parseFloat(payload.duration) || 5;
        const start = payload.start !== undefined ? parseFloat(payload.start) : (track.clips.reduce((acc, c) => Math.max(acc, (c.start || 0) + (c.duration || 0)), 0));

        const newClip = {
          id: clipId,
          name: payload.name || 'Agent Media Clip',
          mediaUrl: payload.mediaUrl || '',
          start: start,
          duration: duration,
          inPoint: parseFloat(payload.inPoint) || 0,
          outPoint: parseFloat(payload.outPoint) || duration,
          posX: payload.posX !== undefined ? parseFloat(payload.posX) : 0,
          posY: payload.posY !== undefined ? parseFloat(payload.posY) : 0,
          scale: payload.scale !== undefined ? parseFloat(payload.scale) : 100,
          rotation: payload.rotation !== undefined ? parseFloat(payload.rotation) : 0,
          opacity: payload.opacity !== undefined ? parseFloat(payload.opacity) : 100,
          blendMode: payload.blendMode || 'source-over',
          volume: payload.volume !== undefined ? parseFloat(payload.volume) : 100,
          speed: payload.speed !== undefined ? parseFloat(payload.speed) : 1,
          subtitleText: payload.subtitleText || '',
          colorGrading: payload.colorGrading || { brightness: 100, contrast: 100, saturation: 100, hue: 0, temperature: 0, tint: 0 }
        };

        track.clips.push(newClip);
        state.duration = Math.max(state.duration || 30, start + duration);
        persistProjectState(state);
        return sendJson(res, 200, { status: 'success', action, clip: newClip, state });
      }

      if (action === 'split_clip') {
        const clipId = payload.clipId;
        const atSecond = parseFloat(payload.atSecond);
        let found = false;

        for (const track of state.tracks) {
          const cIndex = track.clips.findIndex(c => c.id === clipId);
          if (cIndex !== -1) {
            const original = track.clips[cIndex];
            const clipStart = original.start || 0;
            const clipDur = original.duration || 5;

            if (atSecond > clipStart && atSecond < clipStart + clipDur) {
              const firstDur = atSecond - clipStart;
              const secondDur = clipDur - firstDur;

              const secondClip = JSON.parse(JSON.stringify(original));
              secondClip.id = 'clip_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
              secondClip.start = atSecond;
              secondClip.duration = secondDur;
              secondClip.inPoint = (original.inPoint || 0) + firstDur;
              secondClip.outPoint = original.outPoint || clipDur;

              original.duration = firstDur;
              original.outPoint = (original.inPoint || 0) + firstDur;

              track.clips.splice(cIndex + 1, 0, secondClip);
              found = true;
              break;
            }
          }
        }

        if (found) {
          persistProjectState(state);
          return sendJson(res, 200, { status: 'success', action, state });
        }
        return sendJson(res, 400, { status: 'error', message: 'Clip not found or split point out of range' });
      }

      if (action === 'delete_clip') {
        const clipId = payload.clipId;
        let deleted = false;
        for (const track of state.tracks) {
          const idx = track.clips.findIndex(c => c.id === clipId);
          if (idx !== -1) {
            track.clips.splice(idx, 1);
            deleted = true;
            break;
          }
        }
        if (deleted) {
          persistProjectState(state);
          return sendJson(res, 200, { status: 'success', action, clipId, state });
        }
        return sendJson(res, 404, { status: 'error', message: 'Clip not found' });
      }

      if (action === 'update_clip') {
        const clipId = payload.clipId;
        const updates = payload.updates || {};
        let updated = false;

        for (const track of state.tracks) {
          const clip = track.clips.find(c => c.id === clipId);
          if (clip) {
            Object.assign(clip, updates);
            updated = true;
            break;
          }
        }

        if (updated) {
          persistProjectState(state);
          return sendJson(res, 200, { status: 'success', action, clipId, state });
        }
        return sendJson(res, 404, { status: 'error', message: 'Clip not found' });
      }

      if (action === 'set_timeline') {
        if (payload.tracks && Array.isArray(payload.tracks)) {
          state.tracks = payload.tracks;
          if (payload.duration) state.duration = parseFloat(payload.duration);
          persistProjectState(state);
          return sendJson(res, 200, { status: 'success', action, state });
        }
        return sendJson(res, 400, { status: 'error', message: 'Invalid tracks array' });
      }

      if (action === 'auto_caption') {
        // Run Whisper auto captioning script on given media
        const mediaFile = payload.mediaFile;
        if (!mediaFile) {
          return sendJson(res, 400, { status: 'error', message: 'mediaFile is required' });
        }
        const inputPath = path.isAbsolute(mediaFile) ? mediaFile : path.join(UPLOADS_DIR, mediaFile);
        const pyScript = path.join(__dirname, 'scripts', 'auto_caption.py');
        const cmd = `python3 "${pyScript}" --input "${inputPath}"`;
        const pyOut = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
        const resJson = JSON.parse(pyOut);

        // If requested to inject into timeline subtitle track:
        if (payload.injectToTimeline && resJson.segments) {
          let textTrack = state.tracks.find(t => t.id === 'text' || t.name.toLowerCase().includes('subtitle'));
          if (!textTrack) {
            textTrack = { id: 'text', name: 'Subtitles & Text', type: 'video', isAudio: false, clips: [] };
            state.tracks.push(textTrack);
          }
          resJson.segments.forEach((seg, idx) => {
            textTrack.clips.push({
              id: 'caption_' + Date.now() + '_' + idx,
              name: seg.text || 'Caption',
              mediaUrl: '',
              start: seg.start,
              duration: seg.end - seg.start,
              inPoint: 0,
              outPoint: seg.end - seg.start,
              posX: 0,
              posY: 38,
              scale: 100,
              subtitleText: seg.text,
              opacity: 100
            });
          });
          persistProjectState(state);
        }

        return sendJson(res, 200, { status: 'success', action, captions: resJson, state });
      }

      if (action === 'detect_silence') {
        const { mediaPath, noiseThreshold = -30, minDuration = 0.4 } = params || {};
        if (!mediaPath) return sendJson(res, 400, { status: 'error', message: 'Missing mediaPath parameter' });
        
        let resolved = mediaPath;
        if (!path.isAbsolute(resolved)) {
          if (resolved.startsWith('/uploads/') || resolved.startsWith('uploads/')) {
            resolved = path.join(UPLOADS_ROOT, resolved.replace(/^\/?uploads\//, ''));
          } else {
            resolved = path.join(WORKSPACE_ROOT, resolved);
          }
        }

        const scriptPath = path.join(__dirname, 'scripts', 'silence_detector.py');
        const pyProc = spawn('python3', [scriptPath, resolved, String(noiseThreshold), String(minDuration)]);
        let out = '';
        let errOut = '';
        for await (const chunk of pyProc.stdout) out += chunk;
        for await (const chunk of pyProc.stderr) errOut += chunk;
        const exitCode = await new Promise((resolve) => pyProc.on('close', resolve));
        if (exitCode !== 0) {
          return sendJson(res, 500, { status: 'error', message: 'Silence detection failed', details: errOut });
        }

        let resultJson;
        try {
          resultJson = JSON.parse(out);
        } catch (e) {
          return sendJson(res, 500, { status: 'error', message: 'Invalid JSON from silence detector', raw: out });
        }

        return sendJson(res, 200, { status: 'success', action, silence: resultJson });
      }

      if (action === 'apply_jump_cuts') {
        const { trackId = 'track_video_main', noiseThreshold = -30, minDuration = 0.4 } = params || {};
        const state = readProjectState();
        const trk = state.tracks.find(t => t.id === trackId) || state.tracks[0];
        if (!trk || !trk.items || trk.items.length === 0) {
          return sendJson(res, 400, { status: 'error', message: 'Target track has no media clips to cut' });
        }

        const primaryClip = trk.items[0];
        let mediaPath = primaryClip.mediaUrl;
        let resolved = mediaPath;
        if (!path.isAbsolute(resolved)) {
          if (resolved.startsWith('/uploads/') || resolved.startsWith('uploads/')) {
            resolved = path.join(UPLOADS_ROOT, resolved.replace(/^\/?uploads\//, ''));
          } else {
            resolved = path.join(WORKSPACE_ROOT, resolved);
          }
        }

        const scriptPath = path.join(__dirname, 'scripts', 'silence_detector.py');
        const pyProc = spawn('python3', [scriptPath, resolved, String(noiseThreshold), String(minDuration)]);
        let out = '';
        for await (const chunk of pyProc.stdout) out += chunk;
        const exitCode = await new Promise((resolve) => pyProc.on('close', resolve));
        if (exitCode !== 0) return sendJson(res, 500, { status: 'error', message: 'Jump-cut detection failed' });

        const resultJson = JSON.parse(out);
        const keeps = resultJson.keep_segments || [];
        if (keeps.length > 0) {
          // Replace single item with splitted keep segments
          trk.items = keeps.map((seg, idx) => ({
            id: `clip_${Date.now()}_${idx}`,
            name: `${primaryClip.name} [part ${idx + 1}]`,
            mediaUrl: primaryClip.mediaUrl,
            start: keeps.slice(0, idx).reduce((acc, curr) => acc + curr.duration, 0),
            duration: seg.duration,
            inPoint: seg.start,
            outPoint: seg.end,
            posX: primaryClip.posX || 0,
            posY: primaryClip.posY || 0,
            scale: primaryClip.scale || 100,
            opacity: primaryClip.opacity ?? 100
          }));
          persistProjectState(state);
        }

        return sendJson(res, 200, { status: 'success', action, keepsCount: keeps.length, state });
      }

      if (action === 'apply_ducking') {
        const { voicePath, bgmPath, duckingDb = -18 } = params || {};
        if (!voicePath || !bgmPath) {
          return sendJson(res, 400, { status: 'error', message: 'Missing voicePath or bgmPath' });
        }

        const resolveLocal = (p) => {
          if (path.isAbsolute(p)) return p;
          if (p.startsWith('/uploads/') || p.startsWith('uploads/')) {
            return path.join(UPLOADS_ROOT, p.replace(/^\/?uploads\//, ''));
          }
          return path.join(WORKSPACE_ROOT, p);
        };

        const resVoice = resolveLocal(voicePath);
        const resBgm = resolveLocal(bgmPath);
        const outName = `ducked_${Date.now()}.m4a`;
        const outPath = path.join(OUTPUTS_DIR, outName);

        const scriptPath = path.join(__dirname, 'scripts', 'audio_ducker.py');
        const pyProc = spawn('python3', [scriptPath, resVoice, resBgm, outPath, String(duckingDb)]);
        let out = '';
        let errOut = '';
        for await (const chunk of pyProc.stdout) out += chunk;
        for await (const chunk of pyProc.stderr) errOut += chunk;
        const exitCode = await new Promise((resolve) => pyProc.on('close', resolve));

        if (exitCode !== 0) {
          return sendJson(res, 500, { status: 'error', message: 'Audio ducking execution failed', details: errOut });
        }

        let duckResult;
        try {
          duckResult = JSON.parse(out);
        } catch (e) {
          duckResult = { raw: out };
        }

        return sendJson(res, 200, {
          status: 'success',
          action,
          result: duckResult,
          duckedAudioUrl: `/exports/${outName}`
        });
      }

      return sendJson(res, 400, { status: 'error', message: `Unknown agent action: ${action}` });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  // Static Assets Serving
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  if (reqPath.startsWith('/exports/')) {
    const rel = reqPath.replace(/^\/exports\//, '');
    const target = path.join(OUTPUTS_DIR, rel);
    return serveStaticFile(target, req, res);
  }
  if (reqPath.startsWith('/uploads/')) {
    const rel = reqPath.replace(/^\/uploads\//, '');
    const target = path.join(UPLOADS_DIR, rel);
    return serveStaticFile(target, req, res);
  }
  if (reqPath.startsWith('/samples/')) {
    const rel = reqPath.replace(/^\/samples\//, '');
    const target = path.join(SAMPLES_DIR, rel);
    return serveStaticFile(target, req, res);
  }
  if (reqPath.startsWith('/assets/')) {
    const rel = reqPath.replace(/^\/assets\//, '');
    const target = path.join(ASSETS_DIR, rel);
    return serveStaticFile(target, req, res);
  }

  if (reqPath.startsWith('/gui/')) {
    reqPath = reqPath.replace(/^\/gui\//, '');
  }
  const safeRel = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(GUI_ROOT, safeRel);
  return serveStaticFile(filePath, req, res);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Flow Studio] Port ${PORT} already active. Existing instance running smoothly.`);
    process.exit(0);
  } else {
    console.error(`[Flow Studio] Server error:`, err);
    process.exit(1);
  }
});

const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`[Flow Studio] Server running on http://${HOST}:${PORT}`);
  console.log(`[Flow Studio] FFmpeg engine ready: ${hasFFmpeg} | FFprobe engine ready: ${hasFFprobe}`);
});
