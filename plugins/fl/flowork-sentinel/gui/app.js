// Flowork Sentinel Dashboard Controller
document.addEventListener('DOMContentLoaded', () => {
  let sessions = [];
  let selectedSessionId = null;
  let currentSynthesizedData = null;

  const sessionsContainer = document.getElementById('sessions-container');
  const sessionCountEl = document.getElementById('session-count');
  const activeTitle = document.getElementById('active-session-title');
  const activeDomain = document.getElementById('active-session-domain');
  const timelineContainer = document.getElementById('timeline-container');
  const eventStats = document.getElementById('event-stats');
  const btnSynthesize = document.getElementById('btn-synthesize');
  const btnDeploy = document.getElementById('btn-deploy');
  const btnDelete = document.getElementById('btn-delete-session');
  const btnClearAll = document.getElementById('btn-clear-all-sessions');
  const btnRefresh = document.getElementById('btn-refresh-sessions');

  const codeSkillPreview = document.getElementById('code-skill-preview');
  const codeScriptPreview = document.getElementById('code-script-preview');
  const tabSkillContent = document.getElementById('tab-skill-content');
  const tabScriptContent = document.getElementById('tab-script-content');

  // Dynamic API Base Discovery & Safe Fetch
  let API_BASE = '';
  function updateEngineBadge(port) {
    const badgeText = document.querySelector('.telemetry-badge span:last-child');
    if (badgeText) {
      badgeText.textContent = `ENGINE PORT ${port} (ACTIVE)`;
    }
  }

  async function resolveApiBase() {
    if (API_BASE) return API_BASE;
    if (window.location.port && window.location.port !== '19890') {
      API_BASE = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
      updateEngineBadge(window.location.port);
      return API_BASE;
    }
    try {
      const statusRes = await fetch('http://127.0.0.1:19890/api/plugins/flowork-sentinel/status');
      if (statusRes.ok) {
        const info = await statusRes.json();
        if (info.port) {
          API_BASE = `http://127.0.0.1:${info.port}`;
          updateEngineBadge(info.port);
          return API_BASE;
        }
      }
    } catch (_) {}

    API_BASE = 'http://127.0.0.1:17870';
    updateEngineBadge(17870);
    return API_BASE;
  }

  async function apiCall(endpoint, options = {}) {
    const base = await resolveApiBase();
    let url = endpoint.startsWith('http') ? endpoint : `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    let res;
    try {
      res = await fetch(url, options);
    } catch (fetchErr) {
      // Dynamic multi-port fallback: Try 17870, 32937, 34977, or window.location.port
      const candidatePorts = ['17870', '32937', '34977', window.location.port].filter(p => p && !url.includes(`:${p}`));
      let resolved = false;
      for (const p of candidatePorts) {
        try {
          const fallbackUrl = `http://127.0.0.1:${p}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
          const fallbackRes = await fetch(fallbackUrl, options);
          if (fallbackRes) {
            res = fallbackRes;
            API_BASE = `http://127.0.0.1:${p}`;
            updateEngineBadge(p);
            resolved = true;
            break;
          }
        } catch (_) {}
      }
      if (!resolved) {
        throw new Error(`Koneksi terputus ke Sentinel Engine (${fetchErr.message}). Silakan refresh halaman.`);
      }
    }

    const text = await res.text();
    if (!text || text.trim().length === 0) {
      if (!res.ok) throw new Error(`HTTP ${res.status} from Sentinel engine`);
      return {};
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Engine returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 100)}`);
    }
  }

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      if (tab === 'skill') {
        tabSkillContent.style.display = 'block';
        tabScriptContent.style.display = 'none';
      } else {
        tabSkillContent.style.display = 'none';
        tabScriptContent.style.display = 'block';
      }
    });
  });

  // Fetch Sessions
  async function loadSessions() {
    try {
      const data = await apiCall('/api/sessions');
      sessions = data.sessions || [];
      sessionCountEl.textContent = sessions.length;
      renderSessionList();
    } catch (err) {
      console.warn('Failed to load sessions:', err);
    }
  }

  function renderSessionList() {
    sessionsContainer.innerHTML = '';
    if (sessions.length === 0) {
      sessionsContainer.innerHTML = '<div class="empty-state">No sessions recorded yet. Start one via the browser extension or studio record button!</div>';
      return;
    }

    sessions.forEach(sess => {
      const card = document.createElement('div');
      card.className = `session-card ${sess.id === selectedSessionId ? 'active' : ''}`;
      card.innerHTML = `
        <div class="card-header">
          <div class="card-title">${sess.name}</div>
          <button class="btn-session-delete" title="Hapus Sesi Rekaman" data-id="${sess.id}">🗑️</button>
        </div>
        <div class="card-meta">
          <span class="card-domain">🌐 ${sess.domain || 'web'}</span>
          <span>⚡ ${sess.event_count || 0} events</span>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-session-delete')) return;
        selectSession(sess.id);
      });

      const delBtn = card.querySelector('.btn-session-delete');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteSession(sess.id);
        });
      }

      sessionsContainer.appendChild(card);
    });
  }

  async function selectSession(id) {
    selectedSessionId = id;
    renderSessionList();

    const sess = sessions.find(s => s.id === id);
    if (!sess) return;

    activeTitle.textContent = sess.name;
    activeDomain.textContent = `Target Domain: ${sess.domain || 'web'}`;
    btnSynthesize.disabled = false;
    btnDeploy.disabled = true;
    if (btnDelete) btnDelete.disabled = false;

    // Fetch full session details
    try {
      timelineContainer.innerHTML = '<div class="empty-timeline">Loading captured events...</div>';
      renderTimelineForSession(sess);
    } catch (err) {
      console.error(err);
    }
  }

  function resetSessionInspector() {
    selectedSessionId = null;
    currentSynthesizedData = null;
    activeTitle.textContent = 'Select a Session to Inspect';
    activeDomain.textContent = 'Domain: None';
    btnSynthesize.disabled = true;
    btnDeploy.disabled = true;
    if (btnDelete) btnDelete.disabled = true;
    eventStats.textContent = '0 actions';
    timelineContainer.innerHTML = '<div class="empty-timeline">Pilih sesi rekaman di samping untuk melihat riwayat aksi DOM dan API network.</div>';
    codeSkillPreview.textContent = '// Klik "Synthesize to SKILL.md" untuk merekonstruksi Intent dan Langkah Terurut secara otomatis...';
    codeScriptPreview.textContent = '// Skrip Puppeteer otomatis yang bisa dijalankan secara headless oleh Agen...';
  }

  async function deleteSession(id) {
    if (!id) return;
    const sess = sessions.find(s => s.id === id);
    const displayName = sess ? sess.name : id;
    if (!confirm(`Hapus sesi rekaman "${displayName}"?`)) return;

    try {
      let data;
      try {
        data = await apiCall('/api/session/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
      } catch (_) {
        data = await apiCall(`/api/session/${id}`, { method: 'DELETE' });
      }

      if (data && data.status === 'ok') {
        if (selectedSessionId === id) {
          resetSessionInspector();
        }
        await loadSessions();
      } else {
        alert(data?.message || 'Gagal menghapus sesi');
      }
    } catch (err) {
      alert('Error saat menghapus sesi: ' + err.message);
    }
  }

  async function clearAllSessions() {
    if (sessions.length === 0) {
      alert('Tidak ada sesi yang tersimpan.');
      return;
    }
    if (!confirm(`Hapus SEMUA (${sessions.length}) sesi rekaman? Tindakan ini permanen.`)) return;

    try {
      const data = await apiCall('/api/sessions/clear', { method: 'POST' });
      if (data.status === 'ok') {
        resetSessionInspector();
        await loadSessions();
      } else {
        alert(data.message || 'Gagal membersihkan sesi');
      }
    } catch (err) {
      alert('Error saat membersihkan sesi: ' + err.message);
    }
  }

  function renderTimelineForSession(sess) {
    // If the session has event list
    const events = sess.events || [];
    eventStats.textContent = `${events.length} actions captured`;
    timelineContainer.innerHTML = '';

    if (events.length === 0) {
      timelineContainer.innerHTML = '<div class="empty-timeline">Tidak ada aksi tercatat dalam sesi ini.</div>';
      return;
    }

    events.forEach((ev, idx) => {
      const item = document.createElement('div');
      const typeClass = ev.type === 'network_request' ? 'network' : (ev.type === 'input' ? 'input' : '');
      item.className = `timeline-item ${typeClass}`;
      item.innerHTML = `
        <div class="item-header">
          <span class="item-badge ${typeClass}">#${idx + 1} [${ev.type}]</span>
          <span>${new Date(ev.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="item-body">
          ${ev.selector ? `<span class="item-selector">${ev.selector}</span>` : ''}
          ${ev.value ? ` Value: <strong>"${ev.value}"</strong>` : ''}
          ${ev.text ? ` Text: <em>"${ev.text}"</em>` : ''}
          ${ev.url ? ` <br><small style="color: #64748b">${ev.url}</small>` : ''}
        </div>
      `;
      timelineContainer.appendChild(item);
    });
  }

  // Synthesize Action
  btnSynthesize.addEventListener('click', async () => {
    if (!selectedSessionId) return;
    btnSynthesize.disabled = true;
    btnSynthesize.textContent = '⚡ Synthesizing Intent & Steps...';

    try {
      const data = await apiCall(`/api/synthesize/${selectedSessionId}`, { method: 'POST' });
      if (data.status === 'ok') {
        currentSynthesizedData = data;
        codeSkillPreview.textContent = data.preview_skill;
        codeScriptPreview.textContent = data.preview_script;
        btnDeploy.disabled = false;
        alert(`Synthesis Complete! Extracted ${data.summary.steps} steps & ${data.summary.network_calls} network endpoints.`);
      } else {
        alert(data.message || 'Synthesis failed');
      }
    } catch (err) {
      alert('Synthesis request error: ' + err.message);
    } finally {
      btnSynthesize.disabled = false;
      btnSynthesize.textContent = '⚡ Synthesize to SKILL.md';
    }
  });

  // Deploy Action
  btnDeploy.addEventListener('click', async () => {
    if (!selectedSessionId || !currentSynthesizedData) return;
    btnDeploy.disabled = true;
    btnDeploy.textContent = '🚀 Deploying...';

    try {
      const sess = sessions.find(s => s.id === selectedSessionId);
      const cleanName = (sess?.name || selectedSessionId).toLowerCase().replace(/[^a-z0-9_]/g, '_');

      const data = await apiCall('/api/deploy-skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: selectedSessionId,
          skill_name: cleanName
        })
      });
      if (data.status === 'ok') {
        alert(`SUCCESS! Skill deployed to Flowork OS:\n${data.target_dir}/SKILL.md\n\nYour autonomous agents can now execute this skill!`);
      } else {
        alert(data.message || 'Deploy failed');
      }
    } catch (err) {
      alert('Deploy error: ' + err.message);
    } finally {
      btnDeploy.disabled = false;
      btnDeploy.textContent = '🚀 Deploy to Flowork Skills';
    }
  });

  btnRefresh.addEventListener('click', loadSessions);

  if (btnDelete) {
    btnDelete.addEventListener('click', () => {
      if (selectedSessionId) deleteSession(selectedSessionId);
    });
  }

  if (btnClearAll) {
    btnClearAll.addEventListener('click', clearAllSessions);
  }

  // Studio Live Record Button
  const btnStudioRec = document.getElementById('btn-studio-record');
  const txtStudioRec = document.getElementById('studio-record-text');
  let studioIsRecording = false;

  if (btnStudioRec) {
    btnStudioRec.addEventListener('click', async () => {
      if (!studioIsRecording) {
        const defaultName = `session_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}`;
        const name = prompt('Enter session name:', defaultName);
        if (name === null) return;

        try {
          const data = await apiCall('/api/session/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name || defaultName, domain: 'web_target' })
          });
          if (data.status === 'ok') {
            studioIsRecording = true;
            btnStudioRec.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            txtStudioRec.textContent = '⏹️ STOP RECORDING';
            alert('🔴 Recording session active! Actions sent via Chrome Extension or API will be recorded into this session.');
          } else {
            alert('Could not start recording session: ' + (data.message || 'Unknown response'));
          }
        } catch (e) {
          alert('Error starting session: ' + e.message);
        }
      } else {
        try {
          const data = await apiCall('/api/session/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
          studioIsRecording = false;
          btnStudioRec.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
          txtStudioRec.textContent = 'START RECORDING';
          alert(`Session saved with ${data.total_events || 0} events!`);
          await loadSessions();
          if (data.session?.id) selectSession(data.session.id);
        } catch (e) {
          alert('Error stopping session: ' + e.message);
        }
      }
    });
  }

  // Auto poll sessions
  loadSessions();
  setInterval(loadSessions, 5000);
});
