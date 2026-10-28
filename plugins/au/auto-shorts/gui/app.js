/**
 * AutoShorts Studio — Sovereign Frontend Controller
 * Co-authored-by: Flowork OS <agent@floworkos.com>
 */

(function () {
  'use strict';

  // Dynamic API Root Resolution
  const API_BASE = window.location.origin.includes('17899') 
    ? window.location.origin 
    : 'http://127.0.0.1:17899';

  let currentProject = null;
  let currentDetail = null;

  // DOM Elements
  const badgeFfmpeg = document.getElementById('badge-ffmpeg');
  const badgeWhisper = document.getElementById('badge-whisper');
  const badgeAi = document.getElementById('badge-ai');
  const projectList = document.getElementById('project-list');
  const projectCount = document.getElementById('project-count');
  const candidatesList = document.getElementById('candidates-list');
  const candidatesCount = document.getElementById('candidates-count');
  const mainVideo = document.getElementById('main-video');
  const currentProjectTitle = document.getElementById('current-project-title');
  const currentProjectDuration = document.getElementById('current-project-duration');
  const btnTranscribe = document.getElementById('btn-transcribe');
  const btnDetectMoments = document.getElementById('btn-detect-moments');
  const transcriptBody = document.getElementById('transcript-body');
  const transcriptStatus = document.getElementById('transcript-status');
  const viewportBox = document.getElementById('viewport-box');
  const aspectIndicator = document.getElementById('aspect-indicator');

  // Modal Elements
  const btnNewProject = document.getElementById('btn-new-project');
  const modalProject = document.getElementById('modal-project');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelProject = document.getElementById('btn-cancel-project');
  const btnSubmitProject = document.getElementById('btn-submit-project');
  const inputProjectName = document.getElementById('input-project-name');
  const inputVideoPath = document.getElementById('input-video-path');

  // Format seconds to mm:ss
  function formatTime(sec) {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // 1. Fetch Engine Status
  async function checkEngineStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      const data = await res.json();
      if (data.has_ffmpeg) {
        badgeFfmpeg.innerHTML = '<span class="status-dot green"></span><span>FFmpeg: Ready</span>';
      } else {
        badgeFfmpeg.innerHTML = '<span class="status-dot red"></span><span>FFmpeg: Missing</span>';
      }

      if (data.has_faster_whisper) {
        badgeWhisper.innerHTML = '<span class="status-dot green"></span><span>Whisper: Ready</span>';
      }

      if (data.has_ollama || data.env_keys.deepseek || data.env_keys.gemini) {
        badgeAi.innerHTML = '<span class="status-dot cyan"></span><span>AI: Online</span>';
      } else {
        badgeAi.innerHTML = '<span class="status-dot gold"></span><span>AI: Heuristic</span>';
      }
    } catch (err) {
      console.warn('Status poll failed:', err);
    }
  }

  // 2. Fetch Projects List
  async function loadProjects() {
    try {
      const res = await fetch(`${API_BASE}/api/projects`);
      const data = await res.json();
      const projects = data.projects || [];
      projectCount.textContent = projects.length;

      if (projects.length === 0) {
        projectList.innerHTML = '<div class="empty-hint">No projects yet. Import a video to begin.</div>';
        return;
      }

      projectList.innerHTML = '';
      projects.forEach((p) => {
        const card = document.createElement('div');
        card.className = `project-card ${currentProject && currentProject.id === p.id ? 'active' : ''}`;
        card.innerHTML = `
          <h4 class="project-card-title">${p.name || 'Untitled Video'}</h4>
          <div class="project-card-meta">
            <span>${p.is_landscape ? '16:9' : '9:16'} • ${formatTime(p.duration)}</span>
            <span class="status-tag">${p.status.toUpperCase()}</span>
          </div>
        `;
        card.onclick = () => selectProject(p.id);
        projectList.appendChild(card);
      });

      if (!currentProject && projects.length > 0) {
        selectProject(projects[0].id);
      }
    } catch (err) {
      console.error('Error loading projects:', err);
    }
  }

  // 3. Select Project Detail
  async function selectProject(projectId) {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}`);
      const data = await res.json();
      currentProject = data.project;
      currentDetail = data;

      // Update UI Header
      currentProjectTitle.textContent = currentProject.name;
      currentProjectDuration.textContent = formatTime(currentProject.duration);
      aspectIndicator.textContent = currentProject.is_landscape ? '16:9 Landscape' : '9:16 Portrait';

      // Load Video Stream
      const streamUrl = `${API_BASE}/api/media/stream?path=${encodeURIComponent(currentProject.source_path)}`;
      mainVideo.src = streamUrl;

      // Enable/Disable Actions
      btnTranscribe.disabled = false;
      btnDetectMoments.disabled = !data.transcript;

      // Update Transcript View
      if (data.transcript && data.transcript.segments) {
        transcriptStatus.textContent = `${data.transcript.language.toUpperCase()} (${data.transcript.segments.length} segments)`;
        transcriptBody.innerHTML = data.transcript.segments.map(s => 
          `<p><strong style="color:var(--accent-cyan); font-family:monospace;">[${formatTime(s.start)} - ${formatTime(s.end)}]</strong> ${s.text}</p>`
        ).join('');
      } else {
        transcriptStatus.textContent = 'Not Transcribed';
        transcriptBody.innerHTML = '<p class="placeholder-text">Click "Transcribe Audio" to process speech.</p>';
      }

      // Render Candidates
      renderCandidates(data.candidates || []);

      // Refresh project list highlighting
      const cards = projectList.querySelectorAll('.project-card');
      cards.forEach(c => c.classList.remove('active'));
    } catch (err) {
      console.error('Error selecting project:', err);
    }
  }

  // 4. Render Candidates Cards
  function renderCandidates(candidates) {
    candidatesCount.textContent = candidates.length;
    if (candidates.length === 0) {
      candidatesList.innerHTML = '<div class="empty-hint">Click "Detect Viral Moments" to discover high-retention clips.</div>';
      return;
    }

    candidatesList.innerHTML = '';
    candidates.forEach((c) => {
      const card = document.createElement('div');
      card.className = 'candidate-card';
      card.innerHTML = `
        <div class="candidate-header">
          <span class="candidate-rank">Rank #${c.rank}</span>
          <span class="score-badge">Viral Score: ${c.score}/100</span>
        </div>
        <div class="candidate-hook">"${c.hook}"</div>
        <div class="candidate-rationale">${c.rationale}</div>
        <div class="candidate-footer">
          <span class="candidate-time">${formatTime(c.start)} - ${formatTime(c.end)} (${formatTime(c.duration)})</span>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm btn-preview">▶ Preview</button>
            <button class="btn btn-primary btn-sm btn-render">${c.rendered ? '✓ Re-Render' : '✂️ Render 9:16'}</button>
          </div>
        </div>
        ${c.rendered ? `
          <div style="padding-top:8px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:11px; color:var(--accent-green);">✓ Rendered 1080x1920 MP4</span>
            <a href="${API_BASE}${c.rendered_url}" download="Short_Rank_${c.rank}.mp4" class="btn btn-secondary btn-sm" style="text-decoration:none;">💾 Save MP4</a>
          </div>
        ` : ''}
      `;

      card.querySelector('.btn-preview').onclick = () => {
        mainVideo.currentTime = c.start;
        mainVideo.play();
      };

      card.querySelector('.btn-render').onclick = async (e) => {
        const btn = e.target;
        btn.disabled = true;
        btn.textContent = '⏳ Rendering...';
        try {
          const res = await fetch(`${API_BASE}/api/candidates/${c.id}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: currentProject.id })
          });
          const renderData = await res.json();
          if (renderData.status === 'SUCCESS') {
            selectProject(currentProject.id);
          } else {
            alert('Render failed: ' + (renderData.error || 'Unknown error'));
            btn.disabled = false;
            btn.textContent = '✂️ Render 9:16';
          }
        } catch (err) {
          alert('Render error: ' + err.message);
          btn.disabled = false;
          btn.textContent = '✂️ Render 9:16';
        }
      };

      candidatesList.appendChild(card);
    });
  }

  // 5. Actions: Transcribe
  btnTranscribe.onclick = async () => {
    if (!currentProject) return;
    btnTranscribe.disabled = true;
    btnTranscribe.innerHTML = '<span>⏳ Transcribing Speech...</span>';

    try {
      const res = await fetch(`${API_BASE}/api/projects/${currentProject.id}/transcribe`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'SUCCESS') {
        selectProject(currentProject.id);
      } else {
        alert('Transcription failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Network error during transcription: ' + err.message);
    } finally {
      btnTranscribe.innerHTML = '<span>🎙️ 1. Transcribe Audio</span>';
      btnTranscribe.disabled = false;
    }
  };

  // 6. Actions: Detect Viral Moments
  btnDetectMoments.onclick = async () => {
    if (!currentProject) return;
    btnDetectMoments.disabled = true;
    btnDetectMoments.innerHTML = '<span>⚡ Analyzing Moments...</span>';

    try {
      const res = await fetch(`${API_BASE}/api/projects/${currentProject.id}/candidates`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'SUCCESS') {
        selectProject(currentProject.id);
      } else {
        alert('Moment detection failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Network error during moment detection: ' + err.message);
    } finally {
      btnDetectMoments.innerHTML = '<span>⚡ 2. Detect Viral Moments</span>';
      btnDetectMoments.disabled = false;
    }
  };

  // 7. Modal Handlers
  btnNewProject.onclick = () => {
    modalProject.classList.remove('hidden');
    inputProjectName.value = '';
    inputVideoPath.value = '';
    inputProjectName.focus();
  };

  btnCloseModal.onclick = () => modalProject.classList.add('hidden');
  btnCancelProject.onclick = () => modalProject.classList.add('hidden');

  btnSubmitProject.onclick = async () => {
    const name = inputProjectName.value.trim();
    const sourcePath = inputVideoPath.value.trim();

    if (!sourcePath) {
      alert('Please provide an absolute path to a video file.');
      return;
    }

    btnSubmitProject.disabled = true;
    btnSubmitProject.textContent = 'Probing...';

    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, source_path: sourcePath })
      });
      const data = await res.json();
      if (data.status === 'SUCCESS') {
        modalProject.classList.add('hidden');
        await loadProjects();
        selectProject(data.project.id);
      } else {
        alert('Error creating project: ' + (data.error || 'Check file path'));
      }
    } catch (err) {
      alert('Failed to connect to AutoShorts engine: ' + err.message);
    } finally {
      btnSubmitProject.disabled = false;
      btnSubmitProject.textContent = 'Import & Probe';
    }
  };

  // Initial Boot
  checkEngineStatus();
  loadProjects();
})();
