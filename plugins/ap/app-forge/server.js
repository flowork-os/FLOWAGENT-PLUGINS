// =============================================================================
// ⚒️ SOVEREIGN APP FORGE — BACKEND SERVER
// Description: Autonomous micro-app scaffolder and template generator.
// Architecture: Pure relative paths, dynamic IPC port, non-blocking execution.
// =============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.FLOWORK_APP_PORT || '18015', 10);
const APPS_ROOT = path.resolve(__dirname, '..');
const GUI_ROOT = path.join(__dirname, 'gui');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
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
  });
}

function safeStreamFile(filePath, res, contentType = 'text/html; charset=utf-8') {
  const resolvedGuiRoot = path.resolve(GUI_ROOT);
  const resolvedFilePath = path.resolve(filePath);
  if (!resolvedFilePath.startsWith(resolvedGuiRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    return res.end('403 Forbidden');
  }

  const stream = fs.createReadStream(resolvedFilePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });

  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    res.end();
  });

  res.on('close', () => {
    stream.destroy();
  });

  stream.pipe(res);
}

// Generate code templates for new micro-apps
function generateAppScaffold(opts) {
  const { id, name, description, category, category_id, icon, default_port, app_type } = opts;
  const appDir = path.join(APPS_ROOT, id);

  if (fs.existsSync(appDir)) {
    throw new Error(`App with ID '${id}' already exists!`);
  }

  // 1. Create directories
  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(path.join(appDir, 'gui'), { recursive: true });
  fs.mkdirSync(path.join(appDir, 'tests'), { recursive: true });

  // 2. plugin.manifest.json
  const manifest = {
    id: id,
    name: name,
    version: '1.0.0',
    author: 'Awenk Audico & Flowork OS',
    description: description || `Sovereign ${name} micro-application for Flowork OS Canvas.`,
    category: category || 'Developer Tools & Systems',
    category_id: category_id || 'CAT-001',
    icon: icon || '⚡',
    entry: {
      gui: 'gui/index.html',
      backend: 'server.js'
    },
    ipc: {
      port_env: 'FLOWORK_APP_PORT',
      default_port: parseInt(default_port || '18020', 10)
    }
  };
  fs.writeFileSync(path.join(appDir, 'plugin.manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  // 3. SKILL.md (Strict 20 English Keywords)
  const skillKeywords = [
    id.replace(/-/g, '_'),
    'micro_app',
    'flowork_os',
    'sovereign_runtime',
    'canvas_ui',
    'ipc_port',
    'bun_backend',
    'plug_and_play',
    'manifest_contract',
    'zero_hardcode',
    'multi_os_portable',
    'modular_tool',
    'tdd_verified',
    'smoke_test',
    'desktop_app',
    'autonomous_service',
    'dark_mode',
    'realtime_engine',
    'system_app',
    'clean_architecture'
  ];

  const skillContent = `---
name: ${id}
description: ${description || name}
keywords:
${skillKeywords.map(k => `  - "${k}"`).join('\n')}
---

# ${name}

## Overview
${description || name} operates as an autonomous, contract-compliant micro-application inside Flowork OS.
It features a decoupled Canvas UI front-end communicating with a local Bun microservice via dynamic port IPC.

## Architecture
- Manifest: \`plugin.manifest.json\` (Serde object format)
- GUI: \`gui/index.html\` (Aesthetic Canvas dark mode)
- Backend: \`server.js\` (Bun runtime)
- TDD: \`tests/smoke_test.py\` (Automated contract verification)
`;
  fs.writeFileSync(path.join(appDir, 'SKILL.md'), skillContent, 'utf-8');

  // 4. trigger.md
  const triggerContent = `# ${name} Trigger Contract

Trigger this application when:
- The user requests to use or launch ${name}.
- Relevant workflows requiring ${description || name} are invoked in the Canvas.
`;
  fs.writeFileSync(path.join(appDir, 'trigger.md'), triggerContent, 'utf-8');

  // 5. server.js (Backend Microservice)
  const serverContent = `// =============================================================================
// ⚡ ${name.toUpperCase()} — BACKEND SERVICE
// Runtime: Bun / Node.js
// =============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.FLOWORK_APP_PORT || '${default_port || 18020}', 10);
const GUI_ROOT = path.join(__dirname, 'gui');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function safeStreamFile(filePath, res, contentType = 'text/html; charset=utf-8') {
  const resolvedGuiRoot = path.resolve(GUI_ROOT);
  const resolvedFilePath = path.resolve(filePath);
  if (!resolvedFilePath.startsWith(resolvedGuiRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    return res.end('403 Forbidden');
  }

  const stream = fs.createReadStream(resolvedFilePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });

  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    res.end();
  });

  res.on('close', () => {
    stream.destroy();
  });

  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, \`http://127.0.0.1:\${PORT}\`);
  const pathname = url.pathname;

  if (pathname === '/api/status' || pathname === '/health') {
    return sendJson(res, 200, {
      status: 'ok',
      app: '${id}',
      name: '${name}',
      port: PORT,
      timestamp: Date.now()
    });
  }

  // Serve static files from gui/
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(reqPath).replace(/^(\\.\\.[\\/])+/, '');
  const filePath = path.join(GUI_ROOT, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'text/html; charset=utf-8';
    return safeStreamFile(filePath, res, contentType);
  }

  // Fallback to index.html for SPA
  const indexHtml = path.join(GUI_ROOT, 'index.html');
  if (fs.existsSync(indexHtml)) {
    return safeStreamFile(indexHtml, res, 'text/html; charset=utf-8');
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(\`[${name}] Listening on http://127.0.0.1:\${PORT}\`);
});
`;
  fs.writeFileSync(path.join(appDir, 'server.js'), serverContent, 'utf-8');

  // 6. gui/index.html (Rich Canvas Dark-Themed GUI)
  const guiContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(18, 24, 38, 0.75);
      --border: rgba(255, 255, 255, 0.08);
      --accent: #00f2fe;
      --accent-glow: rgba(0, 242, 254, 0.25);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 24px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon {
      font-size: 28px;
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(0, 242, 254, 0.1);
      border: 1px solid rgba(0, 242, 254, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .brand h1 { font-size: 20px; font-weight: 700; color: #fff; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .pulse {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
      animation: pulseAnim 1.8s infinite;
    }
    @keyframes pulseAnim {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.8); }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    .card h3 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 12px; }
    .stat-val { font-size: 32px; font-weight: 800; color: #fff; margin-bottom: 4px; }
    .btn {
      padding: 10px 18px;
      border-radius: 10px;
      background: linear-gradient(135deg, #00f2fe, #4facfe);
      color: #050b14;
      font-weight: 700;
      font-size: 13px;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn:hover {
      box-shadow: 0 0 16px var(--accent-glow);
      transform: translateY(-1px);
    }
    .terminal-box {
      background: #04070e;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: #38bdf8;
      max-height: 200px;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-icon">${icon || '⚡'}</div>
      <div>
        <h1>${name}</h1>
        <p style="font-size: 12px; color: var(--text-muted);">${description}</p>
      </div>
    </div>
    <div class="badge">
      <div class="pulse"></div>
      <span id="status-label">ONLINE :${default_port || 18020}</span>
    </div>
  </header>

  <main>
    <div class="grid">
      <div class="card">
        <h3>Service Status</h3>
        <div class="stat-val" id="val-status">READY</div>
        <p style="font-size: 12px; color: var(--text-muted);">Sovereign Microservice IPC Active</p>
      </div>
      <div class="card">
        <h3>Runtime Framework</h3>
        <div class="stat-val">BUN / RUST</div>
        <p style="font-size: 12px; color: var(--text-muted);">Decoupled Native Canvas Architecture</p>
      </div>
      <div class="card">
        <h3>Actions</h3>
        <button class="btn" onclick="pingService()">Ping Backend</button>
      </div>
    </div>

    <div class="card">
      <h3>System Output</h3>
      <div class="terminal-box" id="log-console">[SYSTEM] ${name} initialized successfully with Exit Code 0.</div>
    </div>
  </main>

  <script>
    async function pingService() {
      const consoleEl = document.getElementById('log-console');
      consoleEl.innerHTML += \`\\n[REQUEST] Pinging backend /api/status...\`;
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        consoleEl.innerHTML += \`\\n[SUCCESS] Response: \${JSON.stringify(data)}\`;
      } catch (err) {
        consoleEl.innerHTML += \`\\n[ERROR] Ping failed: \${err.message}\`;
      }
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  </script>
</body>
</html>`;
  fs.writeFileSync(path.join(appDir, 'gui', 'index.html'), guiContent, 'utf-8');

  // 7. tests/smoke_test.py (Automated TDD Gatekeeper Test)
  const testContent = `#!/usr/bin/env python3
# =============================================================================
# 🧪 ${name.toUpperCase()} — SMOKE TEST & CONTRACT VERIFICATION
# =============================================================================
import os
import sys
import json
import subprocess

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def test_contract():
    manifest_path = os.path.join(APP_DIR, "plugin.manifest.json")
    assert os.path.exists(manifest_path), "Missing plugin.manifest.json"
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert data.get("id") == "${id}", "Invalid app id in manifest"
    assert isinstance(data.get("entry"), dict), "'entry' must be a dictionary"
    assert data["entry"].get("gui"), "'entry' must define 'gui'"
    assert data["entry"].get("backend"), "'entry' must define 'backend'"

    gui_file = os.path.join(APP_DIR, data["entry"]["gui"])
    assert os.path.exists(gui_file), f"GUI file missing: {gui_file}"
    backend_file = os.path.join(APP_DIR, data["entry"]["backend"])
    assert os.path.exists(backend_file), f"Backend file missing: {backend_file}"

    # Verify backend JavaScript syntax non-destructively
    res = subprocess.run(["bun", "build", backend_file, "--no-bundle", "--target=node"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert res.returncode == 0, f"Backend syntax error: {res.stderr.decode()}"
    print("✅ ${name} manifest and backend syntax verified.")

def main():
    try:
        test_contract()
        print("✅ ${name} smoke test passed with Exit Code 0.")
        sys.exit(0)
    except AssertionError as e:
        print(f"❌ ${name} test failure: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
`;
  fs.writeFileSync(path.join(appDir, 'tests', 'smoke_test.py'), testContent, 'utf-8');

  return { id, name, appDir, port: default_port || 18020 };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (pathname === '/api/status' || pathname === '/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'app-forge',
      version: '1.0.0',
      port: PORT,
      timestamp: Date.now()
    });
  }

  if (pathname === '/api/apps' && req.method === 'GET') {
    try {
      const entries = fs.readdirSync(APPS_ROOT, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
        .map(d => {
          const appPath = path.join(APPS_ROOT, d.name);
          const manifestPath = path.join(appPath, 'plugin.manifest.json');
          let manifest = null;
          let hasTest = fs.existsSync(path.join(appPath, 'tests'));
          if (fs.existsSync(manifestPath)) {
            try {
              manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            } catch (_) {}
          }
          return {
            id: d.name,
            has_manifest: !!manifest,
            has_tests: hasTest,
            manifest: manifest
          };
        });
      return sendJson(res, 200, { status: 'success', apps: entries });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  if (pathname === '/api/forge' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.id || !body.name) {
        return sendJson(res, 400, { status: 'error', message: "Fields 'id' and 'name' are mandatory!" });
      }

      // Sanitize ID
      const sanitizedId = body.id.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      body.id = sanitizedId;

      const result = generateAppScaffold(body);

      // Run automated test on newly created app
      const testScript = path.join(result.appDir, 'tests', 'smoke_test.py');
      const testProc = spawn('python3', [testScript]);
      let testOutput = '';
      testProc.stdout.on('data', d => testOutput += d);
      testProc.stderr.on('data', d => testOutput += d);

      testProc.on('error', (err) => {
        return sendJson(res, 500, {
          status: 'error',
          message: 'Failed to spawn test runner: ' + err.message
        });
      });

      testProc.on('close', code => {
        if (code === 0) {
          return sendJson(res, 201, {
            status: 'success',
            message: `App '${result.name}' successfully forged and verified with Exit Code 0!`,
            app: result,
            test_output: testOutput
          });
        } else {
          return sendJson(res, 500, {
            status: 'error',
            message: `App was scaffolded but failed automated smoke test!`,
            test_output: testOutput
          });
        }
      });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
    return;
  }

  // Path traversal guard
  if (req.url.includes('..') || pathname.includes('..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    return res.end('403 Forbidden');
  }

  // Static files
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(GUI_ROOT, '.' + reqPath);
  if (!filePath.startsWith(path.resolve(GUI_ROOT))) {
    res.writeHead(403, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    return res.end('403 Forbidden');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'text/html; charset=utf-8';
    return safeStreamFile(filePath, res, contentType);
  }

  // SPA fallback only for extensionless navigation routes
  const ext = path.extname(reqPath);
  if (!ext) {
    const indexHtml = path.join(GUI_ROOT, 'index.html');
    if (fs.existsSync(indexHtml)) {
      return safeStreamFile(indexHtml, res, 'text/html; charset=utf-8');
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('File Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Sovereign App Forge] listening on http://127.0.0.1:${PORT}`);
});
