#!/usr/bin/env node
/**
 * AutoShorts Studio — Sovereign Backend Engine
 * Co-authored-by: Flowork OS <agent@floworkos.com>
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(APP_ROOT, 'data');
const GUI_DIR = path.join(APP_ROOT, 'gui');
const CROPPER_PY = path.join(__dirname, 'cropper.py');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
if (!fs.existsSync(PROJECTS_FILE)) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify([], null, 2));
}

function loadProjects() {
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveProjects(projects) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

const PYTHON_CMD = process.platform === 'win32'
  ? (process.env.PYTHON_BIN || 'python')
  : (process.env.PYTHON_BIN || 'python3');

function runPython(args) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON_CMD, [CROPPER_PY, ...args], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr || stdout || err.message));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseErr) {
        resolve({ raw: stdout, error: parseErr.message });
      }
    });
  });
}

function pickNativeFile() {
  if (process.env.FLOWORK_TEST_MODE === '1') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const platform = process.platform;

    if (platform === 'linux') {
      const zenity = spawn('zenity', [
        '--file-selection',
        '--timeout=120',
        '--title=Select Video File for AutoShorts',
        '--file-filter=Video Files (mp4, mkv, mov, webm, ts, avi, m4v)|*.mp4 *.mkv *.mov *.webm *.ts *.avi *.m4v *.flv *.wmv',
        '--file-filter=All Files|*'
      ]);

      let out = '';
      zenity.stdout.on('data', (d) => { out += d.toString(); });
      zenity.on('close', (code) => {
        if (code === 0 && out.trim()) {
          return resolve(out.trim());
        }
        if (code === 1) {
          // User explicitly canceled zenity dialog
          return resolve(null);
        }
        fallbackTkinter(resolve);
      });
      zenity.on('error', () => {
        fallbackTkinter(resolve);
      });
    } else if (platform === 'darwin') {
      const script = 'POSIX path of (choose file of type {"mp4", "mkv", "mov", "webm", "ts", "avi", "m4v"} with prompt "Select Video File for AutoShorts")';
      const proc = spawn('osascript', ['-e', script]);
      let out = '';
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && out.trim()) {
          resolve(out.trim());
        } else {
          fallbackTkinter(resolve);
        }
      });
      proc.on('error', () => fallbackTkinter(resolve));
    } else if (platform === 'win32') {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Title = 'Select Video File for AutoShorts'; $f.Filter = 'Video Files (*.mp4;*.mkv;*.mov;*.webm;*.ts;*.avi;*.m4v)|*.mp4;*.mkv;*.mov;*.webm;*.ts;*.avi;*.m4v|All Files (*.*)|*.*'; if($f.ShowDialog() -eq 'OK'){Write-Output $f.FileName}`;
      const proc = spawn('powershell', ['-NoProfile', '-Command', ps]);
      let out = '';
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0 && out.trim()) {
          resolve(out.trim());
        } else {
          fallbackTkinter(resolve);
        }
      });
      proc.on('error', () => fallbackTkinter(resolve));
    } else {
      fallbackTkinter(resolve);
    }
  });
}

function fallbackTkinter(resolve) {
  const pyCode = `import sys
try:
    import tkinter as tk
    from tkinter import filedialog
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    f = filedialog.askopenfilename(
        title='Select Video File for AutoShorts',
        filetypes=[('Video Files', '*.mp4 *.mkv *.mov *.webm *.ts *.avi *.m4v *.flv *.wmv'), ('All Files', '*.*')]
    )
    if f:
        print(f.strip())
except Exception:
    pass
`;
  const proc = spawn(PYTHON_CMD, ['-c', pyCode]);
  let out = '';
  proc.stdout.on('data', (d) => { out += d.toString(); });
  proc.on('close', (code) => {
    if (code === 0 && out.trim()) {
      resolve(out.trim());
    } else {
      resolve(null);
    }
  });
  proc.on('error', () => resolve(null));
}

function checkBinary(name) {
  return new Promise((resolve) => {
    execFile(name, ['-version'], (err) => resolve(!err));
  });
}

function checkOllama() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:11434', { timeout: 800 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

const PORT = parseInt(process.env.AUTOSHORTS_PORT || process.env.FLOWORK_APP_PORT || '17899', 10);

const server = http.createServer(async (req, res) => {
  // CORS & PNA Headers (Permissive for Canvas iframe, local web & cross-port IPC)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization, x-filename, X-Filename, *');
  res.setHeader('Access-Control-Expose-Headers', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization, x-filename, X-Filename, *',
      'Access-Control-Expose-Headers': '*',
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    // -------------------------------------------------------------
    // API: Status
    // -------------------------------------------------------------
    if (pathname === '/api/status' && req.method === 'GET') {
      const hasFfmpeg = await checkBinary('ffmpeg');
      const hasFfprobe = await checkBinary('ffprobe');
      const hasOllama = await checkOllama();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        status: 'SUCCESS',
        app: 'auto-shorts',
        version: '1.0.0',
        port: PORT,
        has_ffmpeg: hasFfmpeg,
        has_ffprobe: hasFfprobe,
        has_ollama: hasOllama,
        has_faster_whisper: true,
        env_keys: {
          deepgram: !!process.env.DEEPGRAM_API_KEY,
          deepseek: !!process.env.DEEPSEEK_API_KEY,
          gemini: !!process.env.GEMINI_API_KEY,
          anthropic: !!process.env.ANTHROPIC_API_KEY,
          openai: !!process.env.OPENAI_API_KEY
        }
      }));
    }

    // -------------------------------------------------------------
    // API: Native OS File Picker Dialog (Linux / Windows / macOS)
    // -------------------------------------------------------------
    if (pathname === '/api/pick-file' && (req.method === 'POST' || req.method === 'GET')) {
      try {
        const filePath = await pickNativeFile();
        if (filePath && fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            status: 'SUCCESS',
            success: true,
            filePath,
            fileName: path.basename(filePath),
            size: stats.size
          }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          status: 'CANCELED',
          success: false,
          reason: 'canceled_or_unsupported'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    // -------------------------------------------------------------
    // API: Upload Video File (Browser Drag-and-Drop / Browse Stream)
    // -------------------------------------------------------------
    if (pathname === '/api/upload' && req.method === 'POST') {
      const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
      if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      }

      const rawHeaderName = req.headers['x-filename'] || url.searchParams.get('filename') || `upload_${Date.now()}.mp4`;
      let originalName = rawHeaderName;
      try {
        originalName = decodeURIComponent(rawHeaderName);
      } catch {
        originalName = rawHeaderName;
      }

      const safeBase = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetPath = path.join(UPLOADS_DIR, `${Date.now()}_${safeBase}`);
      const writeStream = fs.createWriteStream(targetPath);

      req.pipe(writeStream);

      writeStream.on('finish', () => {
        const stats = fs.statSync(targetPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'SUCCESS',
          success: true,
          filePath: targetPath,
          fileName: originalName,
          size: stats.size
        }));
      });

      writeStream.on('error', (err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Upload stream failed: ${err.message}` }));
      });
      return;
    }

    // -------------------------------------------------------------
    // API: List Projects
    // -------------------------------------------------------------
    if (pathname === '/api/projects' && req.method === 'GET') {
      const projects = loadProjects();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'SUCCESS', projects }));
    }

    // -------------------------------------------------------------
    // API: Create Project
    // -------------------------------------------------------------
    if (pathname === '/api/projects' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body || '{}');

      let sourcePath = (data.source_path || data.path || '').trim();
      // Remove any surrounding quotes from user copy-paste (e.g., Windows "Copy as Path")
      sourcePath = sourcePath.replace(/^["']|["']$/g, '');
      if (sourcePath) {
        sourcePath = path.normalize(sourcePath);
      }

      if (!sourcePath || !fs.existsSync(sourcePath)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: `File not found: ${sourcePath}` }));
      }

      const probe = await runPython(['probe', '--source', sourcePath]);
      const projectId = `proj-${Date.now()}`;
      const projectDir = path.join(DATA_DIR, projectId);
      fs.mkdirSync(projectDir, { recursive: true });

      const newProject = {
        id: projectId,
        name: data.name || path.basename(sourcePath),
        source_path: sourcePath,
        duration: probe.duration || 0,
        width: probe.width || 0,
        height: probe.height || 0,
        is_landscape: probe.is_landscape || false,
        status: 'ready',
        transcription_mode: data.transcription_mode || 'local_whisper',
        caption_style: data.caption_style || 'modern-box',
        created_at: new Date().toISOString()
      };

      const projects = loadProjects();
      projects.unshift(newProject);
      saveProjects(projects);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'SUCCESS', project: newProject, probe }));
    }

    // -------------------------------------------------------------
    // API: Get Project Detail
    // -------------------------------------------------------------
    const getProjMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9_\-]+)$/);
    if (getProjMatch && req.method === 'GET') {
      const pId = getProjMatch[1];
      const projects = loadProjects();
      const proj = projects.find(p => p.id === pId);
      if (!proj) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Project not found' }));
      }

      const projectDir = path.join(DATA_DIR, pId);
      const transcriptFile = path.join(projectDir, 'transcript.json');
      const candidatesFile = path.join(projectDir, 'candidates.json');

      const transcript = fs.existsSync(transcriptFile) ? JSON.parse(fs.readFileSync(transcriptFile, 'utf-8')) : null;
      const candidates = fs.existsSync(candidatesFile) ? JSON.parse(fs.readFileSync(candidatesFile, 'utf-8')) : [];

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        status: 'SUCCESS',
        project: proj,
        transcript,
        candidates
      }));
    }

    // -------------------------------------------------------------
    // API: Transcribe Project
    // -------------------------------------------------------------
    const transcribeMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9_\-]+)\/transcribe$/);
    if (transcribeMatch && req.method === 'POST') {
      const pId = transcribeMatch[1];
      const projects = loadProjects();
      const proj = projects.find(p => p.id === pId);
      if (!proj) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Project not found' }));
      }

      const projectDir = path.join(DATA_DIR, pId);
      const audioPath = path.join(projectDir, 'audio.wav');
      const transcriptFile = path.join(projectDir, 'transcript.json');

      // 1. Extract audio
      await runPython(['extract_audio', '--source', proj.source_path, '--output', audioPath]);

      // 2. Transcribe
      const transcript = await runPython(['transcribe', '--source', audioPath]);
      fs.writeFileSync(transcriptFile, JSON.stringify(transcript, null, 2));

      proj.status = 'transcribed';
      proj.language = transcript.language || 'en';
      saveProjects(projects);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'SUCCESS', transcript }));
    }

    // -------------------------------------------------------------
    // API: Generate Viral Candidates
    // -------------------------------------------------------------
    const candMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9_\-]+)\/candidates$/);
    if (candMatch && req.method === 'POST') {
      const pId = candMatch[1];
      const projects = loadProjects();
      const proj = projects.find(p => p.id === pId);
      if (!proj) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Project not found' }));
      }

      const projectDir = path.join(DATA_DIR, pId);
      const transcriptFile = path.join(projectDir, 'transcript.json');
      const candidatesFile = path.join(projectDir, 'candidates.json');

      if (!fs.existsSync(transcriptFile)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Transcribe project first before detecting moments.' }));
      }

      const analysis = await runPython(['analyze', '--transcript', transcriptFile]);
      const candidates = analysis.candidates || [];
      fs.writeFileSync(candidatesFile, JSON.stringify(candidates, null, 2));

      proj.status = 'analyzed';
      proj.candidates_count = candidates.length;
      saveProjects(projects);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'SUCCESS', candidates, provider: analysis.provider }));
    }

    // -------------------------------------------------------------
    // API: Render Candidate Clip
    // -------------------------------------------------------------
    const renderMatch = pathname.match(/^\/api\/candidates\/([a-zA-Z0-9_\-]+)\/render$/);
    if (renderMatch && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body || '{}');

      const candidateId = renderMatch[1];
      const projectId = data.project_id;
      const projects = loadProjects();
      const proj = projects.find(p => p.id === projectId);
      if (!proj) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Project not found' }));
      }

      const projectDir = path.join(DATA_DIR, projectId);
      const candidatesFile = path.join(projectDir, 'candidates.json');
      const candidates = fs.existsSync(candidatesFile) ? JSON.parse(fs.readFileSync(candidatesFile, 'utf-8')) : [];
      const cand = candidates.find(c => c.id === candidateId);
      if (!cand) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Candidate moment not found' }));
      }

      const clipsDir = path.join(projectDir, 'clips');
      fs.mkdirSync(clipsDir, { recursive: true });
      const outputPath = path.join(clipsDir, `${candidateId}.mp4`);

      const renderRes = await runPython([
        'render',
        '--source', proj.source_path,
        '--output', outputPath,
        '--start', String(cand.start),
        '--end', String(cand.end),
        '--caption-style', proj.caption_style || 'modern-box'
      ]);

      cand.rendered = true;
      cand.output_path = outputPath;
      cand.rendered_url = `/api/media/stream?path=${encodeURIComponent(outputPath)}`;
      fs.writeFileSync(candidatesFile, JSON.stringify(candidates, null, 2));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'SUCCESS', render: renderRes, candidate: cand }));
    }

    // -------------------------------------------------------------
    // API: Stream Media (with Range Support for Video Players)
    // -------------------------------------------------------------
    if (pathname === '/api/media/stream' && req.method === 'GET') {
      const mediaPath = url.searchParams.get('path');
      if (!mediaPath || !fs.existsSync(mediaPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Media file not found');
      }

      const stat = fs.statSync(mediaPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(mediaPath, { start, end });
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4'
        });
        return file.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4'
        });
        return fs.createReadStream(mediaPath).pipe(res);
      }
    }

    // -------------------------------------------------------------
    // API: Delete Project
    // -------------------------------------------------------------
    const delMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9_\-]+)$/);
    if (delMatch && req.method === 'DELETE') {
      const pId = delMatch[1];
      let projects = loadProjects();
      projects = projects.filter(p => p.id !== pId);
      saveProjects(projects);

      const projectDir = path.join(DATA_DIR, pId);
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'SUCCESS', deleted: pId }));
    }

    // -------------------------------------------------------------
    // Static GUI Server
    // -------------------------------------------------------------
    let filePath = path.join(GUI_DIR, pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      return fs.createReadStream(filePath).pipe(res);
    }

    // Fallback to index.html for SPA routing
    const indexHtml = path.join(GUI_DIR, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return fs.createReadStream(indexHtml).pipe(res);
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));

  } catch (err) {
    console.error('[AutoShorts Error]', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[AutoShorts Engine] Sovereign Canvas Host listening on http://127.0.0.1:${PORT}`);
});
