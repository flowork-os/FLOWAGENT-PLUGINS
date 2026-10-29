#!/usr/bin/env node
// [FL_INDEX: keywords="stickman_engine, http_server, voice_fx, video_render, task_queue, sse_progress, rest_api" | purpose="Sovereign Stickman Studio backend server providing complete REST & SSE endpoints for voice transformation, async video render job queue, real-time progress polling, exports management, and Canvas GUI delivery"]
/**
 * Stickman Studio — Sovereign Backend Engine
 * Co-authored-by: Flowork OS <agent@floworkos.com>
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile, spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');
const GUI_DIR = path.join(APP_ROOT, 'gui');
const DATA_DIR = path.join(APP_ROOT, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const EXPORTS_DIR = path.join(DATA_DIR, 'exports');

[DATA_DIR, UPLOADS_DIR, EXPORTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const PORT = parseInt(process.env.STICKMAN_PORT || process.env.FLOWORK_APP_PORT || '18040', 10);

// Global In-Memory Job Store for Asynchronous Video Rendering & Voice Processing
const JOBS = new Map();
const SSE_CLIENTS = new Set();

function broadcastJobUpdate(job) {
  const payload = `data: ${JSON.stringify(job)}\n\n`;
  for (const client of SSE_CLIENTS) {
    try {
      client.write(payload);
    } catch (e) {
      SSE_CLIENTS.delete(client);
    }
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 50 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({ raw: body });
      }
    });
    req.on('error', reject);
  });
}

function pickFolderNative() {
  return new Promise((resolve) => {
    execFile('zenity', ['--file-selection', '--directory', '--title=Select Destination Folder'], (err, stdout) => {
      if (!err && stdout.trim()) return resolve(stdout.trim());
      execFile('kdialog', ['--getexistingdirectory', process.env.HOME || '/home/mrflow'], (kErr, kStdout) => {
        if (!kErr && kStdout.trim()) return resolve(kStdout.trim());
        const pyScript = `import tkinter as tk, tkinter.filedialog as fd, os; root=tk.Tk(); root.withdraw(); p=fd.askdirectory(initialdir=os.path.expanduser('~')); print(p if p else '')`;
        execFile('python3', ['-c', pyScript], (pyErr, pyStdout) => {
          if (!pyErr && pyStdout.trim()) return resolve(pyStdout.trim());
          const fallback = path.join(process.env.HOME || '/tmp', 'Downloads');
          if (fs.existsSync(fallback)) return resolve(fallback);
          return resolve(process.env.HOME || '/tmp');
        });
      });
    });
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Headers for Sovereign Canvas UI
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  try {
    // -------------------------------------------------------------
    // 1. Health & System Info
    // -------------------------------------------------------------
    if (pathname === '/api/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        status: 'UP',
        app: 'stickman-studio',
        version: '1.0.0',
        port: PORT,
        active_jobs: Array.from(JOBS.values()).filter(j => j.status === 'processing').length,
        total_jobs: JOBS.size,
        timestamp: new Date().toISOString()
      }));
    }

    // -------------------------------------------------------------
    // 2. Real-time Server-Sent Events (SSE) Stream
    // -------------------------------------------------------------
    if (pathname === '/api/jobs/stream' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
      SSE_CLIENTS.add(res);

      req.on('close', () => {
        SSE_CLIENTS.delete(res);
      });
      return;
    }

    // -------------------------------------------------------------
    // 3. Voice FX Profiles List
    // -------------------------------------------------------------
    if (pathname === '/api/voice/profiles' && req.method === 'GET') {
      const profiles = [
        { id: 'kids', name: 'Cute Kids / Bocil', description: 'Bright, high pitch formant with lively child voice', pitch: 1.45, speed: 1.05 },
        { id: 'cartoon', name: 'Wacky Cartoon', description: 'Expressive cartoon character with pitch oscillation', pitch: 1.6, speed: 1.1 },
        { id: 'chipmunk', name: 'High-Speed Chipmunk', description: 'Classic Alvin chipmunk ultra-high pitch', pitch: 1.85, speed: 1.25 },
        { id: 'robot', name: 'Cybernetic Robot', description: 'Flanged robotic modular vocoder voice', pitch: 0.95, speed: 1.0 },
        { id: 'deep_boss', name: 'Deep Titan Boss', description: 'Heavy resonant low pitch cinematic villain', pitch: 0.72, speed: 0.95 }
      ];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ profiles }));
    }

    // -------------------------------------------------------------
    // 4. Voice Transformation (POST /api/voice/transform)
    // -------------------------------------------------------------
    if (pathname === '/api/voice/transform' && req.method === 'POST') {
      const body = await parseBody(req);
      const { input_path, profile, custom_pitch, custom_speed } = body;

      if (!input_path || !fs.existsSync(input_path)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Valid input_path is required' }));
      }

      const outName = `fx_${profile || 'kids'}_${Date.now()}.wav`;
      const outputPath = path.join(EXPORTS_DIR, outName);
      const pythonScript = path.join(__dirname, 'voice_fx.py');
      const args = [pythonScript, input_path, outputPath, profile || 'kids'];
      if (custom_pitch) args.push(String(custom_pitch));
      if (custom_speed) args.push(String(custom_speed));

      execFile('python3', args, (error, stdout, stderr) => {
        if (error) {
          console.error('[VoiceFX Error]', stderr || error.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: stderr || error.message }));
        }
        try {
          const result = JSON.parse(stdout);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, output_path: outputPath }));
        }
      });
      return;
    }

    // -------------------------------------------------------------
    // 5. Audio Analyzer (POST /api/audio/analyze)
    // -------------------------------------------------------------
    if (pathname === '/api/audio/analyze' && req.method === 'POST') {
      const body = await parseBody(req);
      const { audio_path, fps } = body;

      if (!audio_path || !fs.existsSync(audio_path)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Valid audio_path is required' }));
      }

      const pythonScript = path.join(__dirname, 'audio_analyzer.py');
      const args = [pythonScript, audio_path, String(fps || 30)];

      execFile('python3', args, (error, stdout, stderr) => {
        if (error) {
          console.error('[Analyzer Error]', stderr || error.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: stderr || error.message }));
        }
        try {
          const result = JSON.parse(stdout);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Invalid analyzer JSON output', raw: stdout }));
        }
      });
      return;
    }

    // -------------------------------------------------------------
    // 5b. Storyboard Audio Chunker & Auto-Partition (POST /api/storyboard/slice)
    // -------------------------------------------------------------
    if (pathname === '/api/storyboard/slice' && req.method === 'POST') {
      const body = await parseBody(req);
      const { audio_path, target_seconds } = body;

      if (!audio_path || !fs.existsSync(audio_path)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Valid audio_path is required' }));
      }

      const scriptPath = path.join(__dirname, 'audio_chunker.py');
      const args = [scriptPath, audio_path, String(target_seconds || 8.0)];

      execFile('python3', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          console.error('[Chunker Error]', stderr || error.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: stderr || error.message }));
        }
        try {
          const result = JSON.parse(stdout);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Failed to parse chunker output', raw: stdout }));
        }
      });
      return;
    }

    // -------------------------------------------------------------
    // 5c. Instantaneous Single Part Frame Preview (POST /api/storyboard/preview)
    // -------------------------------------------------------------
    if (pathname === '/api/storyboard/preview' && req.method === 'POST') {
      const partConfig = await parseBody(req);
      const partId = partConfig.id || `preview_${Date.now()}`;
      const outPreviewName = `part_${partId}_${Date.now()}.png`;
      const outPreviewPath = path.join(EXPORTS_DIR, outPreviewName);

      const scriptPath = path.join(__dirname, 'part_preview.py');
      const args = [scriptPath, JSON.stringify(partConfig), outPreviewPath];

      execFile('python3', args, (error, stdout, stderr) => {
        if (error) {
          console.error('[Part Preview Error]', stderr || error.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: stderr || error.message }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          preview_url: `/exports/${outPreviewName}`,
          preview_path: outPreviewPath
        }));
      });
      return;
    }

    // -------------------------------------------------------------
    // 5d. Native Folder Picker (GET /api/pick-folder)
    // -------------------------------------------------------------
    if (pathname === '/api/pick-folder' && req.method === 'GET') {
      const folderPath = await pickFolderNative();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ path: folderPath }));
    }

    // -------------------------------------------------------------
    // 5e. Raw Media Upload (POST /api/fs/upload-media)
    // -------------------------------------------------------------
    if (pathname === '/api/fs/upload-media' && req.method === 'POST') {
      let rawHeader = parsedUrl.searchParams.get('filename') || req.headers['x-filename'] || `media_${Date.now()}.mp4`;
      let origName = rawHeader;
      try { origName = decodeURIComponent(rawHeader); } catch (_) {}
      const cleanName = origName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const targetFile = path.join(UPLOADS_DIR, `${Date.now()}_${cleanName}`);
      const writeStream = fs.createWriteStream(targetFile);
      req.pipe(writeStream);
      writeStream.on('finish', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          path: targetFile,
          filename: path.basename(targetFile),
          size: fs.statSync(targetFile).size
        }));
      });
      writeStream.on('error', (err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
      return;
    }

    // -------------------------------------------------------------
    // 5f. 3-Second Micro-Beats & Multimodal Storyboard (POST /api/beats/slice)
    // -------------------------------------------------------------
    if (pathname === '/api/beats/slice' && req.method === 'POST') {
      const body = await parseBody(req);
      const { media_path, target_seconds } = body;
      if (!media_path || !fs.existsSync(media_path)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Valid media_path is required' }));
      }

      const beatsScript = path.join(__dirname, 'video_beats_extractor.py');
      const directorScript = path.join(__dirname, 'cognitive_director.py');
      const outDir = path.join(DATA_DIR, 'beats_' + Date.now());
      fs.mkdirSync(outDir, { recursive: true });

      const maxDur = body.max_duration !== undefined ? String(body.max_duration) : '90.0';
      const args1 = [beatsScript, media_path, outDir, String(target_seconds || 3.0), maxDur];
      execFile('python3', args1, { maxBuffer: 10 * 1024 * 1024 }, (err1, stdout1, stderr1) => {
        if (err1) {
          console.error('[Beats Extractor Error]', stderr1 || err1.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: stderr1 || err1.message }));
        }

        const manifestPath = path.join(outDir, 'beats_manifest.json');
        if (!fs.existsSync(manifestPath)) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Manifest file not generated' }));
        }

        execFile('python3', [directorScript, manifestPath], (err2) => {
          if (err2) {
            console.warn('[Cognitive Director Warning]', err2.message);
          }
          try {
            const finalManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, manifest: finalManifest }));
          } catch (readErr) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Failed to read beats manifest' }));
          }
        });
      });
      return;
    }

    // -------------------------------------------------------------
    // 5g. Keyframes Static Serving (GET /api/keyframes/:batchId/:filename or /api/keyframes/:filename)
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/keyframes/')) {
      const parts = pathname.replace('/api/keyframes/', '').split('/').filter(Boolean);
      const keyframeName = parts.pop();
      const batchDirName = parts.pop();

      let foundPath = null;
      if (batchDirName) {
        const candidate = path.join(DATA_DIR, batchDirName, 'keyframes', keyframeName);
        if (fs.existsSync(candidate)) foundPath = candidate;
      }

      if (!foundPath) {
        const searchDirs = [
          path.join(DATA_DIR, 'keyframes'),
          path.join(__dirname, 'output', 'keyframes'),
          path.join('/tmp', 'test_beats', 'keyframes')
        ];
        try {
          const beatDirs = fs.readdirSync(DATA_DIR).filter(d => d.startsWith('beats_') || d.startsWith('demo_') || d.startsWith('cand2_'));
          beatDirs.sort().reverse();
          for (const bd of beatDirs) {
            searchDirs.unshift(path.join(DATA_DIR, bd, 'keyframes'));
          }
        } catch (_) {}

        for (const sd of searchDirs) {
          const candidate = path.join(sd, keyframeName);
          if (fs.existsSync(candidate)) {
            foundPath = candidate;
            break;
          }
        }
      }

      if (foundPath) {
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Private-Network': 'true'
        });
        return fs.createReadStream(foundPath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Keyframe not found' }));
      }
    }

    // -------------------------------------------------------------
    // 5g2. Extracted Audio Serving (GET /api/audio/:batchId/:filename)
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/audio/')) {
      const parts = pathname.replace('/api/audio/', '').split('/').filter(Boolean);
      const audioName = parts.pop();
      const batchDirName = parts.pop();

      let foundAudio = null;
      if (batchDirName && audioName) {
        const candidate = path.join(DATA_DIR, batchDirName, audioName);
        if (fs.existsSync(candidate)) foundAudio = candidate;
      }

      if (!foundAudio && audioName) {
        // Fallback search across recent batch dirs
        try {
          const beatDirs = fs.readdirSync(DATA_DIR).filter(d => d.startsWith('beats_'));
          beatDirs.sort().reverse();
          for (const bd of beatDirs) {
            const cand = path.join(DATA_DIR, bd, audioName);
            if (fs.existsSync(cand)) {
              foundAudio = cand;
              break;
            }
          }
        } catch (_) {}
      }

      if (foundAudio) {
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Private-Network': 'true'
        });
        return fs.createReadStream(foundAudio).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Audio file not found' }));
      }
    }

    // -------------------------------------------------------------
    // 5h. AutoShorts Bridge (GET /api/bridge/autoshorts)
    // -------------------------------------------------------------
    if (pathname === '/api/bridge/autoshorts' && req.method === 'GET') {
      const candidatePaths = [
        path.resolve(APP_ROOT, '..', 'auto-shorts', 'data'),
        path.resolve(APP_ROOT, '..', 'flow-studio', 'samples'),
        path.resolve(APP_ROOT, '..', 'flow-studio', 'exports'),
        path.resolve(APP_ROOT, '..', 'yt-downloader', '~', 'Downloads'),
        UPLOADS_DIR
      ];
      const clips = [];
      for (const cp of candidatePaths) {
        if (!fs.existsSync(cp)) continue;
        try {
          const files = fs.readdirSync(cp, { recursive: true });
          for (const f of files) {
            if (typeof f === 'string' && f.endsWith('.mp4')) {
              const fullP = path.join(cp, f);
              const st = fs.statSync(fullP);
              clips.push({
                name: path.basename(fullP),
                path: fullP,
                size_mb: (st.size / (1024 * 1024)).toFixed(1) + ' MB',
                modified_at: st.mtime.toISOString()
              });
            }
          }
        } catch (_) {}
      }
      clips.sort((a, b) => new Date(b.modified_at) - new Date(a.modified_at));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ clips: clips.slice(0, 20) }));
    }

    // -------------------------------------------------------------
    // 5i. 3D Model Vault Registry & Inspection (GET /api/vault/3d)
    // -------------------------------------------------------------
    if (pathname === '/api/vault/3d' && req.method === 'GET') {
      const vaultManifestPath = path.resolve(APP_ROOT, '..', '..', 'system', 'library', 'manifest.json');
      const query = (parsedUrl.searchParams.get('q') || '').toLowerCase();
      const modality = parsedUrl.searchParams.get('modality') || '';

      if (fs.existsSync(vaultManifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(vaultManifestPath, 'utf8'));
          const libraryDir = path.dirname(vaultManifestPath);
          
          let results = [];
          if (query) {
            const searchDirs = modality && manifest.modalities[modality]
              ? [path.join(libraryDir, manifest.modalities[modality].path.replace('system/library/', ''))]
              : [
                  path.join(libraryDir, 'bioinspired3d'),
                  path.join(libraryDir, 'threejs'),
                  path.join(libraryDir, 'cadquery'),
                  path.join(libraryDir, 'openscad')
                ];

            for (const sDir of searchDirs) {
              if (!fs.existsSync(sDir)) continue;
              const files = fs.readdirSync(sDir);
              for (const f of files) {
                if (f.toLowerCase().includes(query)) {
                  results.push({
                    name: f,
                    path: path.join(sDir, f),
                    modality: path.basename(sDir)
                  });
                  if (results.length >= 50) break;
                }
              }
              if (results.length >= 50) break;
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            status: 'connected',
            vault_name: manifest.name,
            total_assets: manifest.total_generators_and_designs,
            modalities: manifest.modalities,
            search_query: query || null,
            results_count: results.length,
            results: results
          }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Failed to read vault manifest', details: e.message }));
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '3D Asset Vault manifest not found' }));
      }
    }

    // -------------------------------------------------------------
    // 6. Asynchronous Render Stickman Animation Video (POST /api/render/video)
    // -------------------------------------------------------------
    if (pathname === '/api/render/video' && req.method === 'POST') {
      const body = await parseBody(req);
      const {
        audio_path,
        video_path,
        render_mode,
        beats,
        title,
        background,
        character_style,
        resolution,
        fps,
        voice_profile,
        destination_dir
      } = body;

      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const outVideo = `stickman_${Date.now()}.mp4`;
      const outputVideoPath = path.join(EXPORTS_DIR, outVideo);

      const jobRecord = {
        id: jobId,
        type: 'render_video',
        status: 'queued',
        progress: 0,
        stage: 'initializing',
        created_at: new Date().toISOString(),
        params: {
          audio_path: audio_path || video_path || 'voice_kids.mp3',
          video_path: video_path || null,
          render_mode: render_mode || 'full_stickman',
          beats: beats || [],
          title: title || 'Stickman Parody Short',
          background: background || 'podcast_studio',
          character_style: character_style || 'classic',
          resolution: resolution || '720x1280',
          fps: fps || 24,
          voice_profile: voice_profile || 'kids',
          destination_dir: destination_dir || null
        },
        output_file: outVideo,
        output_url: `/exports/${outVideo}`,
        output_path: outputVideoPath,
        error: null
      };

      JOBS.set(jobId, jobRecord);
      broadcastJobUpdate(jobRecord);

      // Launch async processing pipeline in background
      setTimeout(() => {
        executeRenderJob(jobId);
      }, 50);

      res.writeHead(202, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        message: 'Render job queued successfully',
        job_id: jobId,
        status: 'queued',
        poll_url: `/api/jobs/${jobId}`,
        sse_stream: '/api/jobs/stream'
      }));
    }

    // -------------------------------------------------------------
    // 7. Job Status & Progress Polling (GET /api/jobs/:id)
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/jobs/') && req.method === 'GET' && pathname !== '/api/jobs' && pathname !== '/api/jobs/stream') {
      const jobId = pathname.replace('/api/jobs/', '');
      const job = JOBS.get(jobId);

      if (!job) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: `Job ${jobId} not found` }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(job));
    }

    // -------------------------------------------------------------
    // 8. List All Jobs (GET /api/jobs)
    // -------------------------------------------------------------
    if (pathname === '/api/jobs' && req.method === 'GET') {
      const jobsList = Array.from(JOBS.values()).reverse();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        total: jobsList.length,
        jobs: jobsList
      }));
    }

    // -------------------------------------------------------------
    // 9. Cancel / Abort Job (POST /api/jobs/:id/cancel)
    // -------------------------------------------------------------
    if (pathname.match(/^\/api\/jobs\/[^/]+\/cancel$/) && req.method === 'POST') {
      const jobId = pathname.split('/')[3];
      const job = JOBS.get(jobId);

      if (!job) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: `Job ${jobId} not found` }));
      }

      if (job.status === 'completed' || job.status === 'failed') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: `Job already ${job.status}` }));
      }

      job.status = 'cancelled';
      job.stage = 'aborted_by_operator';
      job.updated_at = new Date().toISOString();
      JOBS.set(jobId, job);
      broadcastJobUpdate(job);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, message: `Job ${jobId} cancelled` }));
    }

    // -------------------------------------------------------------
    // 10. List Exported Files (GET /api/exports)
    // -------------------------------------------------------------
    if (pathname === '/api/exports' && req.method === 'GET') {
      const files = fs.readdirSync(EXPORTS_DIR).map(filename => {
        const fullPath = path.join(EXPORTS_DIR, filename);
        const stats = fs.statSync(fullPath);
        return {
          filename,
          url: `/exports/${filename}`,
          size_bytes: stats.size,
          size_mb: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
          modified_at: stats.mtime.toISOString()
        };
      }).sort((a, b) => new Date(b.modified_at) - new Date(a.modified_at));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ count: files.length, exports: files }));
    }

    // -------------------------------------------------------------
    // Static GUI Server & Asset Delivery
    // -------------------------------------------------------------
    let filePath = path.join(GUI_DIR, pathname === '/' ? 'index.html' : pathname);

    if (pathname.startsWith('/exports/')) {
      filePath = path.join(EXPORTS_DIR, pathname.replace('/exports/', ''));
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
        '.mp4': 'video/mp4'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      return fs.createReadStream(filePath).pipe(res);
    }

    const indexHtml = path.join(GUI_DIR, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return fs.createReadStream(indexHtml).pipe(res);
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));

  } catch (err) {
    console.error('[Stickman Studio Server Error]', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
    }
  }
});

// Asynchronous Real Production Worker for Render Jobs
function executeRenderJob(jobId) {
  const job = JOBS.get(jobId);
  if (!job || job.status === 'cancelled') return;

  job.status = 'processing';
  job.stage = 'initializing_worker';
  job.progress = 5;
  broadcastJobUpdate(job);

  const scriptPath = path.join(__dirname, 'video_render_worker.py');
  const tempConfigPath = path.join(DATA_DIR, `cfg_${jobId}.json`);
  const progressPath = path.join(DATA_DIR, `prog_${jobId}.json`);

  const cfg = {
    audio_path: job.params.audio_path ? (job.params.audio_path.startsWith('/') ? job.params.audio_path : path.join(APP_ROOT, job.params.audio_path)) : undefined,
    video_path: job.params.video_path ? (job.params.video_path.startsWith('/') ? job.params.video_path : path.join(APP_ROOT, job.params.video_path)) : undefined,
    render_mode: job.params.render_mode || 'full_stickman',
    beats: job.params.beats || [],
    title: job.params.title || 'Stickman Story',
    background: job.params.background || 'podcast_studio'
  };

  fs.writeFileSync(tempConfigPath, JSON.stringify(cfg, null, 2), 'utf-8');

  const pyProcess = spawn('python3', [scriptPath, tempConfigPath, job.output_path, progressPath]);

  pyProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.startsWith('PROGRESS:')) {
        try {
          const prog = JSON.parse(line.replace('PROGRESS:', ''));
          job.stage = prog.stage || job.stage;
          job.progress = prog.percent !== undefined ? prog.percent : job.progress;
          job.current_frame = prog.current_frame || 0;
          job.total_frames = prog.total_frames || 0;
          job.eta = prog.eta || '';
          JOBS.set(jobId, job);
          broadcastJobUpdate(job);
        } catch (e) {}
      }
    }
  });

  pyProcess.stderr.on('data', (data) => {
    console.error(`[Worker ${jobId} stderr]:`, data.toString().trim());
  });

  pyProcess.on('close', (code) => {
    if (fs.existsSync(tempConfigPath)) try { fs.unlinkSync(tempConfigPath); } catch (e) {}
    if (fs.existsSync(progressPath)) try { fs.unlinkSync(progressPath); } catch (e) {}

    if (code === 0 && fs.existsSync(job.output_path)) {
      if (job.params.destination_dir && fs.existsSync(job.params.destination_dir)) {
        try {
          const customTarget = path.join(job.params.destination_dir, path.basename(job.output_path));
          fs.copyFileSync(job.output_path, customTarget);
          job.custom_export_path = customTarget;
        } catch (copyErr) {
          console.warn('[Export Copy Warning]', copyErr.message);
        }
      }
      job.status = 'completed';
      job.stage = 'done';
      job.progress = 100;
      job.completed_at = new Date().toISOString();
    } else {
      job.status = 'failed';
      job.stage = 'error';
      job.error = `Render process exited with code ${code}`;
    }
    JOBS.set(jobId, job);
    broadcastJobUpdate(job);
  });
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Stickman Studio Engine] Sovereign Canvas Host listening on http://127.0.0.1:${PORT}`);
});
