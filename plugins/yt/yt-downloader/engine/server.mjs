import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, exec, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { executeWasmSync } from './wasm_runner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WASM_PATH = path.join(__dirname, 'engine.wasm');
const GUI_DIR = path.resolve(__dirname, '..', 'gui');

const PORT = parseInt(process.env.FLOWORK_APP_PORT || '17895', 10);
const HOST = '127.0.0.1';
const BASE_ORIGIN = ['http:', '', `${HOST}:${PORT}`].join('/');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4'
};

// Helper: Find yt-dlp binary path
function findYtDlp() {
  const possiblePaths = [
    path.join(os.homedir(), '.local', 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    'yt-dlp'
  ];
  for (const p of possiblePaths) {
    if (p === 'yt-dlp' || fs.existsSync(p)) return p;
  }
  return 'yt-dlp';
}

// Native Directory Picker
async function pickNativeFolder() {
  const platform = os.platform();
  const defaultDir = path.join(os.homedir(), 'Downloads');

  if (platform === 'linux') {
    return new Promise((resolve) => {
      execFile('zenity', [
        '--file-selection',
        '--directory',
        `--filename=${defaultDir}/`,
        '--title=Select Download Folder'
      ], (err, stdout) => {
        if (!err && stdout.trim()) return resolve(stdout.trim());
        const pyScript = `import tkinter, tkinter.filedialog as fd; r=tkinter.Tk(); r.withdraw(); print(fd.askdirectory(initialdir='${defaultDir}') or '')`;
        execFile('python3', ['-c', pyScript], (err2, stdout2) => {
          resolve(!err2 && stdout2.trim() ? stdout2.trim() : defaultDir);
        });
      });
    });
  } else if (platform === 'win32') {
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.SelectedPath = '${defaultDir}'; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }`;
    return new Promise((resolve) => {
      exec(`powershell -NoProfile -Command "${psScript}"`, (err, stdout) => {
        resolve(!err && stdout.trim() ? stdout.trim() : defaultDir);
      });
    });
  } else if (platform === 'darwin') {
    const osascript = `POSIX path of (choose folder with prompt "Select Download Folder:" default location "${defaultDir}")`;
    return new Promise((resolve) => {
      execFile('osascript', ['-e', osascript], (err, stdout) => {
        resolve(!err && stdout.trim() ? stdout.trim() : defaultDir);
      });
    });
  }
  return defaultDir;
}

// Build FFmpeg speed filter:
// to reach target duration (e.g. 59s): speedFactor = originalDuration / targetDuration
// For audio: atempo filter (atempo accepts 0.5 to 2.0 per filter instance, so chain if needed)
function buildAudioAtempoFilter(factor) {
  let f = factor;
  const filters = [];
  while (f > 2.0) {
    filters.push('atempo=2.0');
    f /= 2.0;
  }
  while (f < 0.5) {
    filters.push('atempo=0.5');
    f /= 0.5;
  }
  filters.push(`atempo=${f.toFixed(4)}`);
  return filters.join(',');
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, BASE_ORIGIN);
  const pathname = decodeURIComponent(url.pathname);

  // API: Health & Status
  if (pathname === '/health' || pathname === '/api/health') {
    try {
      const wasmRes = executeWasmSync(WASM_PATH, { action: 'health' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', wasm: wasmRes, port: PORT, ytdlp: findYtDlp() }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', wasm_fallback: true, port: PORT, error: e.message }));
    }
  }

  // API: Select Destination Folder
  if (pathname === '/api/pick-folder') {
    try {
      const folder = await pickNativeFolder();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, folder }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: e.message }));
    }
  }

  // API: Inspect Video Metadata & Available Resolutions via yt-dlp
  if (pathname === '/api/inspect') {
    const videoUrl = url.searchParams.get('url') || '';
    if (!videoUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'URL is required' }));
    }

    const ytdlpBin = findYtDlp();
    const args = [
      '--skip-download',
      '--dump-single-json',
      '--no-playlist',
      '--js-runtimes', `node:${process.execPath}`,
      videoUrl
    ];

    execFile(ytdlpBin, args, { maxBuffer: 15 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        // Fallback to WASM simulation if offline or error
        try {
          const wasmRes = executeWasmSync(WASM_PATH, { action: 'inspect', url: videoUrl });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ...wasmRes, fallback: true, notice: stderr || err.message }));
        } catch (_) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: stderr || err.message }));
        }
      }

      try {
        const info = JSON.parse(stdout);

        // Extract and sort all unique available video heights/resolutions
        const availableHeights = new Set();
        if (Array.isArray(info.formats)) {
          for (const f of info.formats) {
            if (f.vcodec && f.vcodec !== 'none' && f.height && Number.isInteger(f.height)) {
              availableHeights.add(f.height);
            }
          }
        }
        const sortedResolutions = Array.from(availableHeights).sort((a, b) => b - a);
        const maxRes = sortedResolutions.length > 0 ? sortedResolutions[0] : null;

        const result = {
          success: true,
          title: info.title || 'Untitled YouTube Media',
          duration: info.duration || 0,
          duration_string: info.duration_string || `${info.duration || 0}s`,
          author: info.uploader || info.channel || 'Unknown Channel',
          thumbnail: info.thumbnail || '',
          view_count: info.view_count || 0,
          resolutions: sortedResolutions,
          max_resolution: maxRes ? `${maxRes}p` : 'Unknown'
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (parseErr) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: parseErr.message }));
      }
    });
    return;
  }

  // API: Download & Process Media (SSE stream for live log updates)
  if (pathname === '/api/download-stream' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const {
          url: videoUrl,
          mediaType = 'audio',       // 'audio' | 'video'
          format = 'mp3',            // 'mp3' | 'wav' | 'flac' | 'mp4'
          resolution = 'best',       // 'best' | '2160' | '1440' | '1080' | '720' | '480'
          speedMode = 'suno59',      // 'suno59' | 'normal'
          customDuration = 59,       // target in seconds if suno59
          targetFolder = path.join(os.homedir(), 'Downloads')
        } = payload;

        if (!videoUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Video URL is required' }));
        }

        // Setup SSE Header
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        const sendEvent = (event, data) => {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        const resLabel = mediaType === 'video' ? `Resolution: ${resolution === 'best' ? 'Max Quality (Best)' : resolution + 'p'}` : 'Audio Mode';
        sendEvent('log', { text: `[Engine] Target output directory: ${targetFolder}` });
        sendEvent('log', { text: `[Engine] Mode: ${speedMode.toUpperCase()} | Format: ${mediaType.toUpperCase()} (${format.toUpperCase()}) | ${resLabel}` });

        if (!fs.existsSync(targetFolder)) {
          fs.mkdirSync(targetFolder, { recursive: true });
        }

        const ytdlpBin = findYtDlp();
        const tmpDir = path.join(os.tmpdir(), `ytdl_${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        const rawMediaTemplate = path.join(tmpDir, 'source.%(ext)s');

        // Formulate format selector:
        // NEVER restrict by [ext=mp4] because YouTube serves 1080p, 1440p, 4K as VP9/AV1!
        // yt-dlp + --merge-output-format mp4 will merge highest quality into MP4!
        let formatSelector = '';
        if (mediaType === 'audio') {
          formatSelector = 'bestaudio/best';
        } else {
          if (!resolution || resolution === 'best') {
            formatSelector = 'bestvideo+bestaudio/best';
          } else {
            const h = parseInt(resolution, 10);
            formatSelector = `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`;
          }
        }

        sendEvent('log', { text: `[yt-dlp] Format selector string: "${formatSelector}"` });
        sendEvent('log', { text: `[yt-dlp] Initiating stream extraction from YouTube...` });
        sendEvent('progress', { pct: 15, status: 'Downloading source stream...' });

        // Download raw stream via yt-dlp with automatic MP4 merging
        const dlArgs = [
          '--no-playlist',
          '--js-runtimes', `node:${process.execPath}`,
          '-o', rawMediaTemplate
        ];

        if (mediaType === 'video') {
          dlArgs.push('--merge-output-format', 'mp4');
        }

        dlArgs.push('-f', formatSelector);
        dlArgs.push(videoUrl);

        const stderrLines = [];
        const dlProc = spawn(ytdlpBin, dlArgs);

        dlProc.stdout.on('data', (d) => {
          const line = d.toString().trim();
          if (line) {
            sendEvent('log', { text: `[yt-dlp] ${line}` });
            const m = line.match(/(\d+\.?\d*)%/);
            if (m) {
              const p = Math.min(70, 15 + Math.round(parseFloat(m[1]) * 0.55));
              sendEvent('progress', { pct: p, status: `Downloading: ${m[1]}%` });
            }
          }
        });

        dlProc.stderr.on('data', (d) => {
          const line = d.toString().trim();
          if (line) {
            sendEvent('log', { text: `[yt-dlp warning] ${line}` });
            stderrLines.push(line);
          }
        });

        dlProc.on('close', async (code) => {
          if (code !== 0) {
            const errDetail = stderrLines.length > 0 ? stderrLines.slice(-3).join(' | ') : `exit code ${code}`;
            sendEvent('error', { message: `yt-dlp extraction failed: ${errDetail}` });
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
            res.end();
            return;
          }

          // Locate downloaded raw file
          const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('source.'));
          if (files.length === 0) {
            sendEvent('error', { message: 'Failed to locate downloaded media stream.' });
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
            res.end();
            return;
          }

          const rawFile = path.join(tmpDir, files[0]);
          sendEvent('log', { text: `[Engine] Raw stream captured: ${files[0]}` });
          sendEvent('progress', { pct: 75, status: 'Analyzing duration and stream codec with ffprobe...' });

          // Probe original duration & dimensions
          execFile('ffprobe', [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            rawFile
          ], (probeErr, stdout) => {
            let origDuration = 60;
            let videoTitle = 'media_export';
            let actualWidth = 0;
            let actualHeight = 0;

            try {
              const probeJson = JSON.parse(stdout);
              origDuration = parseFloat(probeJson.format?.duration || 60);
              if (probeJson.format?.tags?.title) {
                videoTitle = probeJson.format.tags.title.replace(/[^\w\s-]/g, '_').trim();
              }
              const vStream = probeJson.streams?.find(s => s.codec_type === 'video');
              if (vStream) {
                actualWidth = vStream.width || 0;
                actualHeight = vStream.height || 0;
              }
            } catch (_) {}

            if (actualHeight > 0) {
              sendEvent('log', { text: `[Engine] Video resolution verified: ${actualWidth}x${actualHeight} (${actualHeight}p)` });
            }
            sendEvent('log', { text: `[Engine] Original duration: ${origDuration.toFixed(2)} seconds` });

            // Compute speed factor
            let speedFactor = 1.0;
            if (speedMode === 'suno59') {
              const targetSec = Number(customDuration) || 59;
              if (origDuration > targetSec) {
                speedFactor = origDuration / targetSec;
                sendEvent('log', { text: `[Suno Protection] Speeding up ${speedFactor.toFixed(3)}x to fit into ${targetSec}s (Bypass copyright scan!)` });
              } else {
                sendEvent('log', { text: `[Engine] Duration is already <= ${targetSec}s, speed adjustment kept at 1.0x.` });
              }
            } else {
              sendEvent('log', { text: `[Engine] Normal mode selected (Original 1.0x playback speed).` });
            }

            const safeTitle = (videoTitle || 'suno_audio').substring(0, 50).replace(/\s+/g, '_');
            const suffix = speedMode === 'suno59' ? '_suno59s' : '_normal';
            const resTag = mediaType === 'video' ? `_${actualHeight || resolution || 'hd'}p` : '';
            const finalExt = mediaType === 'audio' ? (format === 'wav' ? 'wav' : (format === 'flac' ? 'flac' : 'mp3')) : 'mp4';
            const finalFilename = `${safeTitle}${resTag}${suffix}.${finalExt}`;
            const finalOutputFile = path.join(targetFolder, finalFilename);

            sendEvent('progress', { pct: 85, status: `Applying DSP & finalizing ${finalFilename}...` });

            // Build FFmpeg command
            if (mediaType === 'audio') {
              const ffmpegArgs = ['-y', '-i', rawFile];
              if (speedFactor !== 1.0) {
                const atempo = buildAudioAtempoFilter(speedFactor);
                ffmpegArgs.push('-af', atempo);
              }
              if (finalExt === 'mp3') {
                ffmpegArgs.push('-c:a', 'libmp3lame', '-b:a', '320k');
              } else if (finalExt === 'wav') {
                ffmpegArgs.push('-c:a', 'pcm_s16le');
              } else if (finalExt === 'flac') {
                ffmpegArgs.push('-c:a', 'flac');
              }
              if (speedMode === 'suno59') {
                ffmpegArgs.push('-t', (Number(customDuration) || 59).toString());
              }
              ffmpegArgs.push(finalOutputFile);

              sendEvent('log', { text: `[FFmpeg] Rendering audio stream...` });
              execFile('ffmpeg', ffmpegArgs, (ffErr, ffOut, ffStderr) => {
                try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
                if (ffErr) {
                  sendEvent('error', { message: ffStderr || ffErr.message });
                  res.end();
                  return;
                }
                finishSuccess(finalOutputFile, finalFilename, speedFactor);
              });
            } else {
              // VIDEO MODE:
              if (speedFactor !== 1.0) {
                // Suno 59s Speed Ramp for video
                const ptsFactor = (1 / speedFactor).toFixed(5);
                const atempo = buildAudioAtempoFilter(speedFactor);
                const ffmpegArgs = [
                  '-y', '-i', rawFile,
                  '-vf', `setpts=${ptsFactor}*PTS`,
                  '-af', atempo,
                  '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
                  '-c:a', 'aac', '-b:a', '256k',
                  '-t', (Number(customDuration) || 59).toString(),
                  finalOutputFile
                ];

                sendEvent('log', { text: `[FFmpeg] Applying speed ramp & encoding video (CRF 18)...` });
                execFile('ffmpeg', ffmpegArgs, (ffErr, ffOut, ffStderr) => {
                  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
                  if (ffErr) {
                    sendEvent('error', { message: ffStderr || ffErr.message });
                    res.end();
                    return;
                  }
                  finishSuccess(finalOutputFile, finalFilename, speedFactor);
                });
              } else {
                // NORMAL SPEED (1.0x): Lossless stream copy directly!
                // yt-dlp has already merged the high-res stream with audio into MP4!
                sendEvent('log', { text: `[FFmpeg] Normal mode: Performing lossless copy (zero quality loss)...` });
                const ffmpegArgs = [
                  '-y', '-i', rawFile,
                  '-c', 'copy',
                  finalOutputFile
                ];

                execFile('ffmpeg', ffmpegArgs, (copyErr) => {
                  if (!copyErr && fs.existsSync(finalOutputFile) && fs.statSync(finalOutputFile).size > 1000) {
                    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
                    finishSuccess(finalOutputFile, finalFilename, 1.0);
                  } else {
                    // Fallback to high quality transcode if stream-copy isn't container-compatible
                    sendEvent('log', { text: `[FFmpeg] Remuxing stream with high-fidelity x264 (CRF 18)...` });
                    const transcodeArgs = [
                      '-y', '-i', rawFile,
                      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
                      '-c:a', 'aac', '-b:a', '256k',
                      finalOutputFile
                    ];
                    execFile('ffmpeg', transcodeArgs, (transErr, out, transStderr) => {
                      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
                      if (transErr) {
                        sendEvent('error', { message: transStderr || transErr.message });
                        res.end();
                        return;
                      }
                      finishSuccess(finalOutputFile, finalFilename, 1.0);
                    });
                  }
                });
              }
            }

            function finishSuccess(savedPath, filename, factor) {
              sendEvent('progress', { pct: 100, status: 'Completed successfully!' });
              sendEvent('log', { text: `[Success] Output file ready: ${savedPath}` });
              sendEvent('complete', {
                success: true,
                savedPath: savedPath,
                filename: filename,
                folder: targetFolder,
                resolution: actualHeight ? `${actualHeight}p` : resolution,
                speedFactor: Number(factor).toFixed(2),
                mode: speedMode
              });
              res.end();
            }
          });
        });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Static File Serving for GUI
  let safePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(GUI_DIR, safePath);

  if (!filePath.startsWith(GUI_DIR)) {
    res.writeHead(403);
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      return res.end('File Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[YT-Downloader Sovereign Engine] Running on ${BASE_ORIGIN} (PID: ${process.pid})`);
});

const cleanup = (sig) => {
  console.log(`[YT-Downloader Engine] Received ${sig}, terminating cleanly...`);
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => cleanup('SIGTERM'));
process.on('SIGINT', () => cleanup('SIGINT'));
