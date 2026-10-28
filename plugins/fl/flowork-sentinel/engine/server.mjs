import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SESSIONS_DIR = path.join(ROOT_DIR, 'sessions');

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

const PORT = parseInt(process.env.FLOWORK_APP_PORT || '17870', 10);

let activeSession = null;
let sessionEvents = [];

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Cognitive Synthesizer: Converts raw web & network events into sovereign Flowork SKILL.md
 */
function synthesizeSkill(session) {
  const events = session.events || [];
  const domain = session.domain || 'web_target';
  const name = session.name || `web_skill_${Date.now()}`;
  const cleanId = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

  // Analyze events
  const steps = [];
  const networkCalls = [];
  const formInputs = [];

  events.forEach((ev, idx) => {
    if (ev.type === 'navigation') {
      steps.push({
        type: 'NAVIGATE',
        instruction: `Navigate to ${ev.url}`,
        details: ev
      });
    } else if (ev.type === 'input') {
      formInputs.push(ev);
      steps.push({
        type: 'FILL_INPUT',
        instruction: `Enter parameter into element '${ev.selector}' (Sample value: "${ev.value || ''}")`,
        selector: ev.selector,
        value: ev.value
      });
    } else if (ev.type === 'click') {
      steps.push({
        type: 'CLICK_ACTION',
        instruction: `Trigger action by clicking element '${ev.selector}' (Text: "${ev.text || ''}")`,
        selector: ev.selector
      });
    } else if (ev.type === 'network_request') {
      networkCalls.push(ev);
    }
  });

  // Flowork OS Doctrine: Exactly 20 English Keywords!
  const keywords = [
    "flowork", "sentinel", "web_recorder", "automation", "puppeteer",
    "headless", "reverse_engineering", "api_replay", "session_synthesis", "dom_action",
    "network_interceptor", "browser_agent", "sovereign_skill", "telepresence", "zero_trust",
    "exit_code_zero", "workflow_sop", "suno_facebook", "task_execution", "autonomous_pipeline"
  ];

  const skillMdContent = `---
name: ${cleanId}
description: Autonomous browser automation and API synthesis for ${domain} (${name}).
keywords:
${keywords.map(k => `  - ${k}`).join('\n')}
created_at: "${new Date().toISOString()}"
author: "Flowork Sentinel & Chief Architect"
target_domain: "${domain}"
---

# ${name.toUpperCase()} AUTOMATION SOP

## 1. Intent & Objective
Autonomous reproduction of recorded workflow on \`${domain}\`.
Captured via Flowork Sentinel Web Recorder. Reconstructs user intent, form inputs, and backend network calls.

## 2. Reconstructed Step-by-Step Procedure
${steps.map((s, i) => `${i + 1}. **[${s.type}]** ${s.instruction}`).join('\n')}

${networkCalls.length > 0 ? `## 3. Discovered Backend Network Endpoints
The following API calls were captured in the background:
${networkCalls.slice(0, 10).map(nc => `- **${nc.method || 'POST'}** \`${nc.url}\``).join('\n')}
` : ''}

## 4. Execution Rules & Safety
1. Enforce Zero-Trust: Assert DOM selector presence before dispatching click or fill actions.
2. Verify visual mutation or response payload before concluding step.
3. Terminate with Exit Code 0 upon successful completion.
`;

  // Generate automated Puppeteer script
  const scriptContent = `// Sovereign Automation Script for ${name}
// Generated autonomously by Flowork Sentinel
import puppeteer from 'puppeteer';

(async () => {
  console.log('[FLOWORK-SENTINEL] Launching browser automation for ${name}...');
  const browser = await puppeteer.launch({
    headless: false, // Set to true for background execution
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log('[FLOWORK-SENTINEL] Navigating to ${session.target_url || `https://${domain}`}...');
    await page.goto('${session.target_url || `https://${domain}`}', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));

${steps.map(s => {
  if (s.type === 'FILL_INPUT' && s.selector) {
    return `    // Fill Input
    await page.waitForSelector('${s.selector}', { timeout: 10000 });
    await page.type('${s.selector}', '${s.value || ''}', { delay: 50 });
    await new Promise(r => setTimeout(r, 500));`;
  } else if (s.type === 'CLICK_ACTION' && s.selector) {
    return `    // Click Action
    await page.waitForSelector('${s.selector}', { timeout: 10000 });
    await page.click('${s.selector}');
    await new Promise(r => setTimeout(r, 1500));`;
  }
  return '';
}).filter(Boolean).join('\n\n')}

    console.log('[FLOWORK-SENTINEL] Workflow completed successfully. Capturing verification snapshot...');
    await page.screenshot({ path: 'verification_snapshot.png' });
    console.log('[FLOWORK-SENTINEL] All actions verified (Exit Code 0).');
    process.exit(0);

  } catch (err) {
    console.error('[FLOWORK-SENTINEL] Automation error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
`;

  return {
    skillMd: skillMdContent,
    scriptMjs: scriptContent,
    stepCount: steps.length,
    networkCount: networkCalls.length
  };
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // Static GUI serving
  if (!pathname.startsWith('/api')) {
    let relPath = (pathname === '/' || pathname === '/gui' || pathname === '/gui/')
      ? 'index.html'
      : pathname.replace(/^\/gui\//, '').replace(/^\//, '');
    let filePath = path.join(ROOT_DIR, 'gui', relPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
      };
      setCorsHeaders(res);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // API Endpoints
  if (pathname === '/api/status' && req.method === 'GET') {
    return sendJson(res, 200, {
      status: 'ok',
      active_session: activeSession ? activeSession.id : null,
      active_session_name: activeSession ? activeSession.name : null,
      recorded_events_count: sessionEvents.length
    });
  }

  if (pathname === '/api/session/start' && req.method === 'POST') {
    const body = await parseBody(req);
    const id = `session_${Date.now()}`;
    activeSession = {
      id,
      name: body.name || `Session_${new Date().toISOString().slice(0, 10)}`,
      domain: body.domain || 'general_web',
      target_url: body.target_url || body.url || '',
      started_at: new Date().toISOString()
    };
    sessionEvents = [];
    return sendJson(res, 200, {
      status: 'ok',
      message: 'Session recording started',
      session: activeSession
    });
  }

  if (pathname === '/api/session/event' && req.method === 'POST') {
    if (!activeSession) {
      return sendJson(res, 400, { status: 'error', message: 'No active recording session' });
    }
    const body = await parseBody(req);
    const event = {
      ...body,
      timestamp: Date.now()
    };
    sessionEvents.push(event);
    return sendJson(res, 200, { status: 'ok', total_events: sessionEvents.length });
  }

  if (pathname === '/api/session/stop' && req.method === 'POST') {
    if (!activeSession) {
      return sendJson(res, 400, { status: 'error', message: 'No active recording session' });
    }

    const savedSession = {
      ...activeSession,
      ended_at: new Date().toISOString(),
      events: sessionEvents
    };

    const sessionFile = path.join(SESSIONS_DIR, `${savedSession.id}.json`);
    fs.writeFileSync(sessionFile, JSON.stringify(savedSession, null, 2), 'utf-8');

    const result = {
      status: 'ok',
      message: 'Session saved successfully',
      session: savedSession,
      total_events: sessionEvents.length
    };

    activeSession = null;
    sessionEvents = [];

    return sendJson(res, 200, result);
  }

  if (pathname === '/api/sessions' && req.method === 'GET') {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    const list = files.map(f => {
      try {
        const raw = fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8');
        const data = JSON.parse(raw);
        return {
          id: data.id,
          name: data.name,
          domain: data.domain,
          target_url: data.target_url,
          started_at: data.started_at,
          event_count: (data.events || []).length
        };
      } catch (_) {
        return null;
      }
    }).filter(Boolean);

    return sendJson(res, 200, { status: 'ok', sessions: list });
  }

  // Delete specific session
  if ((pathname.startsWith('/api/session/') && req.method === 'DELETE') || (pathname === '/api/session/delete' && req.method === 'POST')) {
    let sessionId = pathname.startsWith('/api/session/') && req.method === 'DELETE'
      ? pathname.replace('/api/session/', '')
      : '';
    if (!sessionId && req.method === 'POST') {
      const body = await parseBody(req);
      sessionId = body.id || body.session_id || '';
    }

    if (!sessionId) {
      return sendJson(res, 400, { status: 'error', message: 'Session ID is required' });
    }

    const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
    const sessionDir = path.join(SESSIONS_DIR, sessionId);

    let deleted = false;
    if (fs.existsSync(sessionFile)) {
      try { fs.unlinkSync(sessionFile); deleted = true; } catch (_) {}
    }
    if (fs.existsSync(sessionDir)) {
      try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (_) {}
    }

    if (activeSession && activeSession.id === sessionId) {
      activeSession = null;
      sessionEvents = [];
    }

    if (deleted) {
      return sendJson(res, 200, { status: 'ok', message: 'Session deleted successfully', id: sessionId });
    } else {
      return sendJson(res, 404, { status: 'error', message: 'Session file not found' });
    }
  }

  // Clear all recorded sessions
  if (pathname === '/api/sessions/clear' && (req.method === 'POST' || req.method === 'DELETE')) {
    const files = fs.readdirSync(SESSIONS_DIR);
    let count = 0;
    for (const file of files) {
      const fullPath = path.join(SESSIONS_DIR, file);
      try {
        if (fs.statSync(fullPath).isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
          count++;
        }
      } catch (_) {}
    }
    activeSession = null;
    sessionEvents = [];
    return sendJson(res, 200, { status: 'ok', message: `All ${count} sessions deleted`, count });
  }

  if (pathname.startsWith('/api/synthesize/') && req.method === 'POST') {
    const sessionId = pathname.replace('/api/synthesize/', '');
    const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
    if (!fs.existsSync(sessionFile)) {
      return sendJson(res, 404, { status: 'error', message: 'Session not found' });
    }

    const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    const synthesized = synthesizeSkill(sessionData);

    // Save artifacts into session folder
    const outDir = path.join(SESSIONS_DIR, sessionId);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(path.join(outDir, 'SKILL.md'), synthesized.skillMd, 'utf-8');
    fs.writeFileSync(path.join(outDir, 'automation.mjs'), synthesized.scriptMjs, 'utf-8');

    return sendJson(res, 200, {
      status: 'ok',
      session_id: sessionId,
      artifacts: {
        skill_path: path.join(outDir, 'SKILL.md'),
        script_path: path.join(outDir, 'automation.mjs')
      },
      summary: {
        steps: synthesized.stepCount,
        network_calls: synthesized.networkCount
      },
      preview_skill: synthesized.skillMd,
      preview_script: synthesized.scriptMjs
    });
  }

  if (pathname === '/api/deploy-skill' && req.method === 'POST') {
    const body = await parseBody(req);
    const { session_id, skill_name } = body;
    const sessionOutDir = path.join(SESSIONS_DIR, session_id);
    const skillSource = path.join(sessionOutDir, 'SKILL.md');

    if (!fs.existsSync(skillSource)) {
      return sendJson(res, 404, { status: 'error', message: 'Synthesized SKILL.md not found' });
    }

    const targetSkillName = skill_name || `sentinel_${session_id}`;
    const targetDir = path.resolve(__dirname, '../../../skills', targetSkillName);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.copyFileSync(skillSource, path.join(targetDir, 'SKILL.md'));

    const automationSource = path.join(sessionOutDir, 'automation.mjs');
    if (fs.existsSync(automationSource)) {
      const scriptsDir = path.join(targetDir, 'scripts');
      if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
      fs.copyFileSync(automationSource, path.join(scriptsDir, 'automation.mjs'));
    }

    return sendJson(res, 200, {
      status: 'ok',
      message: `Skill successfully deployed to skills/${targetSkillName}`,
      target_dir: targetDir
    });
  }

  sendJson(res, 404, { status: 'error', message: 'Endpoint not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Flowork-Sentinel] 🛰️ Sentinel & Synthesizer Server running on http://127.0.0.1:${PORT}`);
});

const extraBridgePorts = [17870, 32937].filter(p => p !== PORT);
for (const p of extraBridgePorts) {
  try {
    const bridge = http.createServer((req, res) => server.emit('request', req, res));
    bridge.on('error', (e) => {
      console.log(`[Flowork-Sentinel] Notice: Bridge port ${p}: ${e.message}`);
    });
    bridge.listen(p, '127.0.0.1', () => {
      console.log(`[Flowork-Sentinel] 🛰️ Bridge also listening on http://127.0.0.1:${p}`);
    });
  } catch (_) {}
}
