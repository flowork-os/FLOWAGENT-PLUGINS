// Flowork Sentinel - Background Service Worker
let activeApiBase = 'http://127.0.0.1:17870';

async function getApiBase() {
  try {
    const res = await fetch('http://127.0.0.1:19890/api/plugins/flowork-sentinel/status');
    if (res.ok) {
      const d = await res.json();
      if (d && d.port) {
        activeApiBase = `http://127.0.0.1:${d.port}`;
        return activeApiBase;
      }
    }
  } catch (_) {}
  return activeApiBase;
}

let isRecording = false;
let currentSession = null;

// Listen to messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    sendResponse({ isRecording, currentSession });
    return true;
  }

  if (message.type === 'START_RECORDING') {
    startRecording(message.sessionName, message.targetUrl)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ status: 'error', message: err.message }));
    return true;
  }

  if (message.type === 'STOP_RECORDING') {
    stopRecording()
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ status: 'error', message: err.message }));
    return true;
  }

  if (message.type === 'DOM_EVENT' && isRecording) {
    sendEventToEngine(message.event);
    sendResponse({ status: 'ok' });
    return true;
  }
});

async function startRecording(name, targetUrl) {
  try {
    const api = await getApiBase();
    const domain = targetUrl ? new URL(targetUrl).hostname : 'web';
    const res = await fetch(`${api}/api/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, domain, target_url: targetUrl })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      isRecording = true;
      currentSession = data.session;
      chrome.action.setBadgeText({ text: 'REC' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      return { status: 'ok', session: currentSession };
    }
    return data;
  } catch (err) {
    console.error('[Sentinel] Failed to connect to Flowork Engine:', err);
    throw new Error('Flowork Engine not running on http://127.0.0.1:17870 or active app port');
  }
}

async function stopRecording() {
  try {
    const api = await getApiBase();
    const res = await fetch(`${api}/api/session/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: currentSession?.id })
    });
    const data = await res.json();
    isRecording = false;
    const finishedSession = currentSession;
    currentSession = null;
    chrome.action.setBadgeText({ text: '' });
    return { status: 'ok', result: data, session: finishedSession };
  } catch (err) {
    isRecording = false;
    currentSession = null;
    chrome.action.setBadgeText({ text: '' });
    throw err;
  }
}

async function sendEventToEngine(event) {
  try {
    const api = await getApiBase();
    await fetch(`${api}/api/session/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
  } catch (err) {
    console.warn('[Sentinel] Failed to send event to engine:', err);
  }
}

// Network API Interception (e.g. Suno generate API, Facebook post API)
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isRecording) return;
    // Filter out static assets
    const url = details.url;
    if (url.match(/\.(png|jpg|jpeg|gif|css|woff2|woff|ttf|svg|ico)$/i)) return;
    if (url.includes('127.0.0.1:') && (url.includes(':17870') || url.includes(':19890') || url.includes(activeApiBase))) return; // Ignore own telemetry

    // Detect internal API calls
    if (details.method === 'POST' || details.method === 'PUT' || url.includes('/api/')) {
      const netEvent = {
        type: 'network_request',
        url: details.url,
        method: details.method,
        initiator: details.initiator,
        timestamp: Date.now()
      };
      sendEventToEngine(netEvent);
    }
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);
