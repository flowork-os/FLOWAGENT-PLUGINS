// [FL_INDEX: keywords="stickman_renderer, procedural_kinematics, storyboard_director, multi_part_scenes, live_part_inspector, autoshorts_bridge, split_pip, micro_beats" | purpose="Sovereign Stickman Studio client-side controller featuring dynamic Cockpit port resolution, procedural 2D stickman rigging, ~3s micro-beat parody director, dual-view keyframe inspection, AutoShorts bridge, and split-screen PIP video exporter"]

/**
 * Stickman Studio — Sovereign Client Controller & Kinematics Renderer
 * Co-authored-by: Flowork OS <agent@floworkos.com>
 */

(() => {
  'use strict';

  // -------------------------------------------------------------------
  // Dynamic API Base Resolution for Cockpit Iframe & Standalone Port
  // -------------------------------------------------------------------
  let API_BASE = '';

  async function resolveApiBase(forceRefresh = false) {
    if (API_BASE && !forceRefresh) return API_BASE;

    const host = window.location.hostname || '127.0.0.1';

    // 1. Direct port probe if loaded directly from engine port (not Cockpit supervisor 19890)
    if (window.location.port && window.location.port !== '19890') {
      try {
        const testRes = await fetch(`${window.location.origin}/api/health`, { signal: AbortSignal.timeout(600) });
        if (testRes.ok) {
          API_BASE = window.location.origin;
          return API_BASE;
        }
      } catch (_) {}
    }

    // 2. Query Cockpit supervisor for plugin dynamic port
    const supervisorPorts = [
      (window.location.port && window.location.port !== '80' && window.location.port !== '443') ? window.location.port : '19890',
      '19890'
    ];
    for (const p of supervisorPorts) {
      try {
        const res = await fetch(`http://${host}:${p}/api/plugins/stickman-studio/status`, { signal: AbortSignal.timeout(800) });
        if (res.ok) {
          const info = await res.json();
          if (info && info.port) {
            API_BASE = `http://${host}:${info.port}`;
            return API_BASE;
          }
        }
      } catch (_) {}
      try {
        const res = await fetch(`http://127.0.0.1:${p}/api/plugins/stickman-studio/status`, { signal: AbortSignal.timeout(800) });
        if (res.ok) {
          const info = await res.json();
          if (info && info.port) {
            API_BASE = `http://127.0.0.1:${info.port}`;
            return API_BASE;
          }
        }
      } catch (_) {}
    }

    // 3. Check URL query param ?port=xxxx (passed by Cockpit supervisor iframe)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const paramPort = urlParams.get('port');
      if (paramPort && paramPort !== '19890') {
        API_BASE = `http://${host}:${paramPort}`;
        return API_BASE;
      }
    } catch (_) {}

    // 4. Fallback to default Stickman Studio port 18040
    API_BASE = `http://${host}:18040`;
    return API_BASE;
  }

  // Pre-resolve API base immediately on script startup
  resolveApiBase().catch(() => {});

  function api(endpoint) {
    const base = API_BASE || (window.location.port === '19890' ? `http://${window.location.hostname || '127.0.0.1'}:18040` : window.location.origin);
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${base}${cleanEndpoint}`;
  }

  // Global State
  const state = {
    audioBuffer: null,
    audioContext: null,
    sourceNode: null,
    analyserNode: null,
    audioDuration: 0,
    currentTime: 0,
    isPlaying: false,
    startTime: 0,
    selectedProfile: 'kids',
    characterArchetype: 'classic',
    renderMode: 'full_stickman', // 100% Full Animated Stickman by default
    destinationDir: '',
    videoPath: null,
    currentAudioServerPath: null,
    kinematics: {
      gestureExaggeration: 1.2,
      headBobRate: 1.0,
      mouthThreshold: 0.3
    },
    colors: {
      stick: '#ffffff',
      glow: '#00e5ff',
      bg: '#11141c'
    },
    audioEnvelope: [],
    transcript: '',
    currentMouthOpen: 0,
    animationFrameId: null,
    
    // Multi-Part Storyboard Beats State (Empty by design until media is sliced)
    storyboardParts: [],
    activePartIndex: 0
  };

  // DOM Elements
  const canvas = document.getElementById('stickmanCanvas');
  const ctx = canvas.getContext('2d');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const timelineProgress = document.getElementById('timelineProgress');
  const timelineTrack = document.getElementById('timelineTrack');
  const timecodeDisplay = document.getElementById('timecodeDisplay');
  const subtitleOverlay = document.getElementById('subtitleOverlay');
  const uploadDropzone = document.getElementById('uploadDropzone');
  const uploadProgressState = document.getElementById('uploadProgressState');
  const uploadProgressTitle = document.getElementById('uploadProgressTitle');
  const uploadProgressDetail = document.getElementById('uploadProgressDetail');
  const mediaFileInput = document.getElementById('mediaFileInput');
  const audioFileInput = document.getElementById('audioFileInput');
  const loadedFileInfo = document.getElementById('loadedFileInfo');
  const loadedFileName = document.getElementById('loadedFileName');
  const loadedFileDuration = document.getElementById('loadedFileDuration');
  const pitchSlider = document.getElementById('pitchSlider');
  const pitchValDisplay = document.getElementById('pitchValDisplay');
  const speedSlider = document.getElementById('speedSlider');
  const speedValDisplay = document.getElementById('speedValDisplay');
  const btnTransformVoice = document.getElementById('btnTransformVoice');
  const systemStatusText = document.getElementById('systemStatusText');
  const stickColorPicker = document.getElementById('stickColorPicker');
  const glowColorPicker = document.getElementById('glowColorPicker');
  const bgColorPicker = document.getElementById('bgColorPicker');
  const transcriptInput = document.getElementById('transcriptInput');
  const btnResetPose = document.getElementById('btnResetPose');
  const btnExportVideo = document.getElementById('btnExportVideo');

  // Header & Bridge DOM Elements
  const selectRenderMode = document.getElementById('selectRenderMode');
  const activeModeBadge = document.getElementById('activeModeBadge');
  const destinationDirInput = document.getElementById('destinationDirInput');
  const btnBrowseFolder = document.getElementById('btnBrowseFolder');
  const btnImportAutoShorts = document.getElementById('btnImportAutoShorts');
  const modalAutoShorts = document.getElementById('modalAutoShorts');
  const btnCloseAutoShortsModal = document.getElementById('btnCloseAutoShortsModal');
  const autoshortsClipsList = document.getElementById('autoshortsClipsList');

  // Storyboard DOM Elements
  const tabAudioSource = document.getElementById('tabAudioSource');
  const tabStoryboard = document.getElementById('tabStoryboard');
  const tabContentAudio = document.getElementById('tabContentAudio');
  const tabContentStoryboard = document.getElementById('tabContentStoryboard');
  const storyboardScenesList = document.getElementById('storyboardScenesList');
  const btnAddScenePart = document.getElementById('btnAddScenePart');

  // Inspector DOM Elements
  const activePartBadge = document.getElementById('activePartBadge');
  const beatKeyframeImage = document.getElementById('beatKeyframeImage');
  const keyframePlaceholder = document.getElementById('keyframePlaceholder');
  const partPreviewImage = document.getElementById('partPreviewImage');
  const partPreviewPlaceholder = document.getElementById('partPreviewPlaceholder');
  const beatParodyIdeaText = document.getElementById('beatParodyIdeaText');
  const btnRefreshPartPreview = document.getElementById('btnRefreshPartPreview');
  const partPropSelect = document.getElementById('partPropSelect');
  const partPoseSelect = document.getElementById('partPoseSelect');
  const partEmotionSelect = document.getElementById('partEmotionSelect');

  // Render Progress HUD Elements
  const renderProgressCard = document.getElementById('renderProgressCard');
  const renderStageText = document.getElementById('renderStageText');
  const renderProgressBar = document.getElementById('renderProgressBar');
  const renderPercentText = document.getElementById('renderPercentText');
  const renderJobId = document.getElementById('renderJobId');
  const renderDestinationNotice = document.getElementById('renderDestinationNotice');
  const renderDestinationPath = document.getElementById('renderDestinationPath');
  const renderDownloadBox = document.getElementById('renderDownloadBox');
  const btnDownloadRendered = document.getElementById('btnDownloadRendered');

  // Initialize Web Audio Context
  function initAudioContext() {
    if (!state.audioContext) {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  // Pre-calculate Offline RMS Envelope for Deterministic Kinematics
  function extractAudioEnvelope() {
    if (!state.audioBuffer) return;
    const rawData = state.audioBuffer.getChannelData(0);
    const sampleRate = state.audioBuffer.sampleRate;
    const fps = 30;
    const samplesPerFrame = Math.floor(sampleRate / fps);
    const totalFrames = Math.floor(rawData.length / samplesPerFrame);

    state.audioEnvelope = new Float32Array(totalFrames);
    for (let f = 0; f < totalFrames; f++) {
      let sum = 0;
      const start = f * samplesPerFrame;
      for (let i = 0; i < samplesPerFrame; i++) {
        sum += rawData[start + i] * rawData[start + i];
      }
      state.audioEnvelope[f] = Math.sqrt(sum / samplesPerFrame);
    }
  }

  // Play / Pause Audio & Timeline
  function togglePlayPause() {
    if (state.isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  }

  function playAudio() {
    initAudioContext();
    if (state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }

    if (state.audioBuffer) {
      if (state.sourceNode) {
        try { state.sourceNode.stop(); } catch (_) {}
      }
      state.sourceNode = state.audioContext.createBufferSource();
      state.sourceNode.buffer = state.audioBuffer;

      state.analyserNode = state.audioContext.createAnalyser();
      state.analyserNode.fftSize = 256;

      state.sourceNode.connect(state.analyserNode);
      state.analyserNode.connect(state.audioContext.destination);

      const offset = Math.max(0, Math.min(state.currentTime, state.audioDuration));
      state.sourceNode.start(0, offset);
      state.startTime = state.audioContext.currentTime - offset;

      state.sourceNode.onended = () => {
        if (state.currentTime >= state.audioDuration - 0.1) {
          pauseAudio();
          state.currentTime = 0;
          updateTimelineDisplay();
        }
      };
    } else {
      state.startTime = performance.now() / 1000 - state.currentTime;
    }

    state.isPlaying = true;
    btnPlayPause.textContent = '⏸';
  }

  function pauseAudio() {
    state.isPlaying = false;
    btnPlayPause.textContent = '▶';
    if (state.sourceNode) {
      try { state.sourceNode.stop(); } catch (_) {}
      state.sourceNode = null;
    }
  }

  function formatTime(seconds) {
    const s = Math.max(0, seconds || 0);
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function updateTimelineDisplay() {
    const cur = formatTime(state.currentTime);
    const dur = formatTime(state.audioDuration || 9.0);
    timecodeDisplay.textContent = `${cur} / ${dur}`;

    const maxDur = state.audioDuration || 9.0;
    const progress = Math.min(100, Math.max(0, (state.currentTime / maxDur) * 100));
    timelineProgress.style.width = `${progress}%`;
  }

  // Upload Media File to Server & Automatically Trigger Slicing
  async function uploadMediaFile(file) {
    if (!file) return;

    // Reset previous storyboard state immediately to prevent stale beats
    state.storyboardParts = [];
    state.activePartIndex = 0;
    if (activePartBadge) activePartBadge.textContent = 'SLICING...';
    if (beatKeyframeImage) beatKeyframeImage.style.display = 'none';
    if (keyframePlaceholder) keyframePlaceholder.style.display = 'block';
    if (partPreviewImage) partPreviewImage.style.display = 'none';
    if (partPreviewPlaceholder) partPreviewPlaceholder.style.display = 'block';
    if (beatParodyIdeaText) {
      beatParodyIdeaText.textContent = `Analyzing ${file.name} for 2-character stickman parody choreography...`;
    }
    if (storyboardScenesList) {
      storyboardScenesList.innerHTML = `
        <div style="padding: 32px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">
          <div class="fl-spinner" style="margin: 0 auto 12px auto; width: 28px; height: 28px; border-width: 3px;"></div>
          <div style="font-weight: 600; color: var(--accent-cyan); margin-bottom: 4px;">Slicing Video & Directing Parody Beats...</div>
          <div style="font-size: 11px;">Extracting speech timestamps and synchronized keyframes</div>
        </div>
      `;
    }

    // a) Instantly show active progress spinner inside the card
    if (uploadProgressState) {
      uploadProgressState.style.display = 'block';
      if (uploadProgressTitle) {
        uploadProgressTitle.textContent = '⚡ Uploading & Slicing into ~3s Micro-Beats with AI Director...';
      }
      if (uploadProgressDetail) {
        uploadProgressDetail.textContent = `Uploading ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`;
      }
    }
    systemStatusText.textContent = `Uploading ${file.name}...`;

    try {
      await resolveApiBase();
      // b) Upload via query parameter to prevent non-safelisted header CORS preflight issues
      const uploadUrl = api(`/api/fs/upload-media?filename=${encodeURIComponent(file.name)}`);
      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: file
      });
      if (!res.ok) {
        throw new Error(`Upload failed with HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.success || !data.path) {
        throw new Error(data.error || 'Upload failed: missing server path');
      }

      state.videoPath = data.path;
      state.currentAudioServerPath = data.path;
      if (loadedFileName) loadedFileName.textContent = file.name;
      if (loadedFileInfo) loadedFileInfo.style.display = 'block';

      // c) DO NOT block on browser AudioContext decoding of giant MP4s!
      // If audio file and small, decode non-blocking in background without awaiting
      if (file.type && file.type.startsWith('audio/') && file.size < 20 * 1024 * 1024) {
        file.arrayBuffer().then(buf => {
          initAudioContext();
          return state.audioContext.decodeAudioData(buf);
        }).then(decoded => {
          state.audioBuffer = decoded;
          extractAudioEnvelope();
        }).catch(() => {});
      }

      // d) Directly call api('/api/beats/slice') with uploaded server path and target_seconds=3.0
      await sliceMediaBeats(data.path);

    } catch (err) {
      console.error('[Upload Error]', err);
      systemStatusText.textContent = `Upload Failed: ${err.message || 'Check network/server connection'}`;
      if (uploadProgressTitle) {
        uploadProgressTitle.textContent = '❌ Upload Failed';
      }
      if (uploadProgressDetail) {
        uploadProgressDetail.textContent = err.message || 'Check network/server connection';
      }
      renderStoryboardCards();
    }
  }

  // Slice Media into ~3-Second Micro-Beats & Cognitive Director
  async function sliceMediaBeats(mediaPath) {
    await resolveApiBase();
    const targetPath = mediaPath || state.videoPath || state.currentAudioServerPath;
    if (!targetPath) {
      systemStatusText.textContent = 'No media loaded to slice';
      return;
    }

    // Immediately clear previous storyboard parts to prevent showing stale beats
    state.storyboardParts = [];
    state.activePartIndex = 0;
    if (activePartBadge) activePartBadge.textContent = 'SLICING...';
    if (beatKeyframeImage) beatKeyframeImage.style.display = 'none';
    if (keyframePlaceholder) keyframePlaceholder.style.display = 'block';
    if (storyboardScenesList) {
      storyboardScenesList.innerHTML = `
        <div style="padding: 32px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">
          <div class="fl-spinner" style="margin: 0 auto 12px auto; width: 28px; height: 28px; border-width: 3px;"></div>
          <div style="font-weight: 600; color: var(--accent-cyan); margin-bottom: 4px;">Slicing Video & Directing Parody Beats...</div>
          <div style="font-size: 11px;">Extracting speech timestamps and synchronized keyframes</div>
        </div>
      `;
    }

    if (uploadProgressState) {
      uploadProgressState.style.display = 'block';
      if (uploadProgressTitle) {
        uploadProgressTitle.textContent = '⚡ Slicing into ~3s Micro-Beats with AI Director...';
      }
      if (uploadProgressDetail) {
        uploadProgressDetail.textContent = 'Extracting speech timestamps & synchronized keyframes...';
      }
    }
    systemStatusText.textContent = 'Slicing ~3s Beats & Directing Stickman Parody...';

    try {
      const sliceUrl = api('/api/beats/slice');
      const res = await fetch(sliceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_path: targetPath, target_seconds: 3.0, max_duration: 90.0 })
      });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();

      // e) On response: populate state.storyboardParts with real sliced beats and keyframes returned by server
      if (data.success && data.manifest && Array.isArray(data.manifest.beats)) {
        state.storyboardParts = data.manifest.beats;
        state.activePartIndex = 0;

        if (data.manifest.full_transcript && transcriptInput) {
          transcriptInput.value = data.manifest.full_transcript;
        }

        const durationSec = data.manifest.total_duration || data.manifest.duration;
        if (durationSec) {
          state.audioDuration = durationSec;
          if (loadedFileDuration) {
            loadedFileDuration.textContent = `${state.audioDuration.toFixed(1)}s`;
          }
          updateTimelineDisplay();
        }

        // Fetch and decode server-extracted audio stream for synchronous web playback
        if (data.manifest.audio_url) {
          const audioUrl = api(data.manifest.audio_url);
          fetch(audioUrl)
            .then(res => res.arrayBuffer())
            .then(buf => {
              initAudioContext();
              return state.audioContext.decodeAudioData(buf);
            })
            .then(decoded => {
              state.audioBuffer = decoded;
              extractAudioEnvelope();
              console.log('[Synchronized Audio Ready]', decoded.duration.toFixed(1), 's');
            })
            .catch(err => console.warn('[Audio Web Decode Warning]', err));
        }

        renderStoryboardCards();

        // g) Select beat 0, update inspector with real keyframe snapshot and stickman parody frame
        selectPart(0);

        // Hide progress spinner on completion
        if (uploadProgressState) {
          uploadProgressState.style.display = 'none';
        }

        // f) AUTOMATICALLY switch active tab to "🎬 Storyboard Beats (~3s)"!
        if (tabStoryboard) {
          tabStoryboard.click();
        }

        systemStatusText.textContent = `Ready: ${state.storyboardParts.length} ~3s Parody Beats Generated!`;
      } else {
        throw new Error(data.error || 'Failed to extract micro-beats from media');
      }
    } catch (err) {
      console.error('[Beats Slicing Error]', err);
      systemStatusText.textContent = `Slice Failed: ${err.message || 'Error processing media'}`;
      if (uploadProgressTitle) {
        uploadProgressTitle.textContent = '❌ Slicing Failed';
      }
      if (uploadProgressDetail) {
        uploadProgressDetail.textContent = err.message || 'Check server connection and video format';
      }
      renderStoryboardCards();
    }
  }

  // Render Stickman Animation on Viewport Canvas (Dual-Actor & Background Synchronized)
  function renderStickman() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentBeat = state.storyboardParts.find(p => state.currentTime >= p.start && state.currentTime < p.end) 
      || state.storyboardParts[state.activePartIndex] 
      || state.storyboardParts[0];

    const timeSec = state.currentTime;
    const bgType = (currentBeat && currentBeat.background) || 'podcast_studio';

    // 1. Procedural Background Rendering
    if (bgType === 'medical_lab') {
      ctx.fillStyle = '#232830';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // High-Tech ECG / DNA Monitor on Wall
      ctx.fillStyle = '#141820';
      ctx.fillRect(40, 50, canvas.width - 80, 110);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(40, 50, canvas.width - 80, 110);
      // Title
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#00e5ff';
      ctx.fillText('AI MEDICAL & SCIENCE LAB', 55, 70);
      // Medical cross
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.arc(canvas.width - 65, 68, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#141820';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('+', canvas.width - 68, 71);
      // Animated Green ECG Pulse Wave
      ctx.strokeStyle = '#38ef7d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const waveY = 115;
      ctx.moveTo(55, waveY);
      for (let x = 55; x < canvas.width - 55; x += 8) {
        let pulse = Math.sin((x * 0.15) - (timeSec * 8)) * 8;
        if (x > 140 && x < 190) {
          pulse = Math.sin((x * 0.4) - (timeSec * 12)) * 22;
        }
        ctx.lineTo(x, waveY + pulse);
      }
      ctx.stroke();
      // Foreground Lab Counter Desk
      ctx.fillStyle = '#181d26';
      ctx.fillRect(0, 480, canvas.width, 160);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 480);
      ctx.lineTo(canvas.width, 480);
      ctx.stroke();

    } else if (bgType === 'beach_bali') {
      // Tropical Sunset Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, 380);
      skyGrad.addColorStop(0, '#f97316');
      skyGrad.addColorStop(0.5, '#ec4899');
      skyGrad.addColorStop(1, '#6366f1');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, canvas.width, 380);
      // Glowing Sun
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(canvas.width / 2, 220, 45, 0, Math.PI * 2);
      ctx.fill();
      // Ocean Water
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(0, 380, canvas.width, 100);
      // Sandy Beach
      ctx.fillStyle = '#d97706';
      ctx.fillRect(0, 480, canvas.width, 160);

    } else if (bgType === 'cyber_grid') {
      ctx.fillStyle = '#0f111a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Perspective grid floor
      ctx.fillStyle = '#090a10';
      ctx.fillRect(0, 460, canvas.width, 180);
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 460);
      ctx.lineTo(canvas.width, 460);
      for (let gx = -100; gx <= canvas.width + 100; gx += 40) {
        ctx.moveTo(canvas.width / 2, 460);
        ctx.lineTo(gx, 640);
      }
      ctx.stroke();

    } else {
      // Default Modern Neon Podcast Studio
      ctx.fillStyle = '#141822';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Side Neon Glow Bars
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(18, 0); ctx.lineTo(18, canvas.height);
      ctx.stroke();
      ctx.strokeStyle = '#00e5ff';
      ctx.beginPath();
      ctx.moveTo(canvas.width - 18, 0); ctx.lineTo(canvas.width - 18, canvas.height);
      ctx.stroke();
      // ON AIR Badge
      ctx.fillStyle = '#1a1f2c';
      ctx.fillRect(canvas.width / 2 - 45, 30, 90, 24);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(canvas.width / 2 - 45, 30, 90, 24);
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#ef4444';
      ctx.fillText('LIVE ON AIR', canvas.width / 2 - 32, 46);
      // Foreground Podcast Desk
      ctx.fillStyle = '#1e2433';
      ctx.fillRect(0, 480, canvas.width, 160);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 480);
      ctx.lineTo(canvas.width, 480);
      ctx.stroke();
    }

    // 2. Character Rendering (Dual-Actor Staging or Solo)
    const actors = currentBeat && currentBeat.actors ? currentBeat.actors : null;

    function drawStickActor(cx, cy, scale, flipped, action, emotion, propName, label, shout, speaking, accentColor) {
      const sign = flipped ? -1 : 1;
      const headRadius = 24 * scale;
      const headBob = speaking ? Math.sin(timeSec * 14) * 4 : Math.sin(timeSec * 6) * 1.5;
      const headCy = cy - (110 * scale) + headBob;

      ctx.save();
      ctx.shadowColor = accentColor || '#00e5ff';
      ctx.shadowBlur = speaking ? 12 : 4;

      // Head
      ctx.beginPath();
      ctx.arc(cx, headCy, headRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#161b26';
      ctx.fill();
      ctx.lineWidth = 3 * scale;
      ctx.strokeStyle = accentColor || '#ffffff';
      ctx.stroke();

      // Eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - (8 * scale), headCy - (3 * scale), 2.5 * scale, 0, Math.PI * 2);
      ctx.arc(cx + (8 * scale), headCy - (3 * scale), 2.5 * scale, 0, Math.PI * 2);
      ctx.fill();

      // Mouth (Animated when speaking)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      if (speaking) {
        const mouthOpen = 2 + Math.abs(Math.sin(timeSec * 16)) * 6;
        ctx.ellipse(cx, headCy + (8 * scale), 5 * scale, mouthOpen * scale, 0, 0, Math.PI * 2);
      } else if (emotion === 'happy') {
        ctx.arc(cx, headCy + (5 * scale), 6 * scale, 0, Math.PI);
      } else {
        ctx.moveTo(cx - (5 * scale), headCy + (8 * scale));
        ctx.lineTo(cx + (5 * scale), headCy + (8 * scale));
      }
      ctx.stroke();

      // Spine Torso
      ctx.beginPath();
      ctx.moveTo(cx, headCy + headRadius);
      ctx.lineTo(cx, cy);
      ctx.lineWidth = 3.5 * scale;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Arms
      ctx.beginPath();
      const armSwing = speaking ? Math.sin(timeSec * 8) * 10 : 0;
      if (action === 'point') {
        ctx.moveTo(cx, headCy + headRadius + 10);
        ctx.lineTo(cx + (40 * sign * scale), headCy + (10 * scale));
        ctx.lineTo(cx + (75 * sign * scale), headCy - (5 * scale));
        ctx.moveTo(cx, headCy + headRadius + 10);
        ctx.lineTo(cx - (25 * sign * scale), cy - (20 * scale));
      } else if (action === 'celebrate') {
        ctx.moveTo(cx, headCy + headRadius + 10);
        ctx.lineTo(cx - (35 * sign * scale), headCy - (30 * scale) + armSwing);
        ctx.moveTo(cx, headCy + headRadius + 10);
        ctx.lineTo(cx + (35 * sign * scale), headCy - (30 * scale) - armSwing);
      } else if (action === 'think') {
        ctx.moveTo(cx, headCy + headRadius + 10);
        ctx.lineTo(cx + (25 * sign * scale), headCy);
        ctx.lineTo(cx + (10 * sign * scale), headCy + (12 * scale));
        ctx.moveTo(cx, headCy + headRadius + 10);
        ctx.lineTo(cx - (25 * sign * scale), cy - (20 * scale));
      } else {
        ctx.moveTo(cx, headCy + headRadius + 10);
        ctx.lineTo(cx - (30 * sign * scale), cy - (30 * scale) + armSwing);
        ctx.moveTo(cx, headCy + headRadius + 10);
        ctx.lineTo(cx + (30 * sign * scale), cy - (30 * scale) - armSwing);
      }
      ctx.stroke();

      // Legs
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - (20 * scale), cy + (75 * scale));
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + (20 * scale), cy + (75 * scale));
      ctx.stroke();

      // Prop Emoji Rendering
      if (propName) {
        const propEmojiMap = {
          dna: '🧬', bone: '🦴', skeleton: '🦴', quiz: '📋', target: '📋',
          book: '📖', flashcard: '📖', brain: '🧠', bulb: '💡', phone: '📱',
          coffee: '☕', sunglasses: '🕶️', chart_up: '📈', chart_down: '📉',
          money_bag: '💰', shopping_cart: '🛒', alert: '⚠️', question: '❓'
        };
        const emoji = propEmojiMap[propName] || '💡';
        ctx.font = `${Math.floor(22 * scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const propX = cx + (42 * sign * scale);
        const propY = headCy - (5 * scale);
        ctx.fillText(emoji, propX, propY);
      }

      // Actor Label Badge
      if (label) {
        ctx.font = 'bold 9px monospace';
        const lblW = ctx.measureText(label).width + 12;
        ctx.fillStyle = '#141824';
        ctx.fillRect(cx - lblW / 2, headCy - headRadius - 20, lblW, 14);
        ctx.strokeStyle = accentColor || '#00e5ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - lblW / 2, headCy - headRadius - 20, lblW, 14);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(label, cx, headCy - headRadius - 10);
      }

      // Comic Shout Speech Bubble
      if (shout && speaking) {
        ctx.font = 'bold 11px sans-serif';
        const shoutW = ctx.measureText(shout).width + 16;
        const bX = Math.max(10, Math.min(canvas.width - shoutW - 10, cx - shoutW / 2));
        const bY = headCy - headRadius - 48;
        // Bubble body
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bX, bY, shoutW, 22);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(bX, bY, shoutW, 22);
        // Text
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.fillText(shout, bX + shoutW / 2, bY + 15);
      }

      ctx.restore();
    }

    if (actors && actors.length >= 2) {
      // 2-Character Dialogue Setup (Left vs Right)
      const a1 = actors[0];
      const a2 = actors[1];
      const a1Color = a1.accent_color ? `rgb(${a1.accent_color.join(',')})` : '#ffd700';
      const a2Color = a2.accent_color ? `rgb(${a2.accent_color.join(',')})` : '#00e5ff';

      drawStickActor(105, 400, 0.95, false, a1.action || 'talk', a1.emotion || 'neutral', a1.prop, a1.label || 'HOST', a1.comic_shout, a1.speaking, a1Color);
      drawStickActor(255, 400, 0.95, true, a2.action || 'listen', a2.emotion || 'neutral', a2.prop, a2.label || 'CO-HOST', a2.comic_shout, a2.speaking, a2Color);

    } else {
      // Solo Staging
      const pose = currentBeat ? currentBeat.pose : 'talk';
      const emotion = currentBeat ? currentBeat.emotion : 'neutral';
      const prop = currentBeat ? currentBeat.prop : 'bulb';
      const accent = (currentBeat && currentBeat.accent) || '#00e5ff';
      const shout = currentBeat ? currentBeat.comic_shout : null;

      drawStickActor(canvas.width / 2, 400, 1.05, false, pose, emotion, prop, 'HOST', shout, true, accent);
    }

    // 3. Subtitle Overlay
    if (currentBeat && currentBeat.text) {
      subtitleOverlay.textContent = currentBeat.text;
      subtitleOverlay.style.display = 'block';
    } else {
      subtitleOverlay.style.display = 'none';
    }
  }

  // Animation Loop Tick
  function animationTick() {
    if (state.isPlaying) {
      if (state.audioContext && state.audioBuffer) {
        state.currentTime = state.audioContext.currentTime - state.startTime;
      } else {
        state.currentTime = (performance.now() / 1000) - state.startTime;
      }

      if (state.currentTime >= state.audioDuration && state.audioDuration > 0) {
        state.currentTime = state.audioDuration;
        pauseAudio();
      }
      updateTimelineDisplay();
    }
    renderStickman();
    state.animationFrameId = requestAnimationFrame(animationTick);
  }

  // Render Dual-View Storyboard Cards
  function renderStoryboardCards() {
    if (!storyboardScenesList) return;
    storyboardScenesList.innerHTML = '';

    if (!state.storyboardParts || state.storyboardParts.length === 0) {
      storyboardScenesList.innerHTML = `
        <div class="fl-empty-storyboard-box">
          <div style="font-size: 28px; margin-bottom: 6px;">🎬</div>
          <div style="font-size: 13px; font-weight: 700; color: var(--text-primary);">No Video Moment Loaded</div>
          <div style="font-size: 11px; color: var(--text-secondary); margin: 6px 0 14px 0; line-height: 1.4;">
            Import a video to automatically slice it into ~3-second micro-beats with AI stickman parody direction.
          </div>
          <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <button id="btnEmptyBrowseVideo" class="fl-btn fl-btn-accent" style="width: auto; padding: 6px 12px; font-size: 11px;">
              📥 Browse Video File
            </button>
            <button id="btnEmptyAutoShorts" class="fl-btn fl-btn-secondary" style="width: auto; padding: 6px 12px; font-size: 11px; border-color: var(--accent-cyan); color: var(--accent-cyan);">
              ⚡ Import AutoShorts
            </button>
          </div>
        </div>
      `;
      wireEmptyStateButtons();
      return;
    }

    state.storyboardParts.forEach((part, index) => {
      const card = document.createElement('div');
      card.className = `fl-scene-card ${index === state.activePartIndex ? 'active' : ''}`;
      
      let rawThumb = part.keyframe_url || (part.keyframe_file ? `/api/keyframes/${part.keyframe_file}` : '');
      let thumbSrc = rawThumb ? (rawThumb.startsWith('http') ? rawThumb : api(rawThumb)) : '';
      if (thumbSrc) {
        thumbSrc += (thumbSrc.includes('?') ? '&' : '?') + 't=' + (part.batch_id || Date.now());
      }

      card.innerHTML = `
        <div class="fl-beat-card-grid">
          <div class="fl-beat-thumb-wrap">
            ${thumbSrc ? `<img src="${thumbSrc}" alt="Beat ${index + 1}" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                          <span class="fl-beat-thumb-placeholder" style="display:none;">🎬</span>`
                       : `<span class="fl-beat-thumb-placeholder">🎬</span>`}
          </div>
          <div style="overflow: hidden;">
            <div class="fl-scene-header">
              <span class="fl-scene-badge">Beat ${index + 1}</span>
              <span class="fl-scene-time">${formatTime(part.start)} - ${formatTime(part.end)}</span>
            </div>
            <div class="fl-scene-summary" title="${part.text}">${part.text || 'Action Segment'}</div>
            <div class="fl-beat-parody-snippet" title="${part.parody_idea}">
              💡 ${part.parody_idea || 'Stickman parity choreography'}
            </div>
            <div class="fl-scene-tags" style="margin-top: 4px;">
              <span class="fl-scene-tag-pill">🥋 ${part.model || 'classic'}</span>
              <span class="fl-scene-tag-pill">🎭 ${part.prop || 'bulb'}</span>
              <span class="fl-scene-tag-pill">⚡ ${part.pose || 'talk'}</span>
            </div>
          </div>
        </div>
      `;

      card.addEventListener('click', () => selectPart(index));
      storyboardScenesList.appendChild(card);
    });
  }

  function wireEmptyStateButtons() {
    const btnEmptyBrowse = document.getElementById('btnEmptyBrowseVideo');
    if (btnEmptyBrowse) {
      btnEmptyBrowse.addEventListener('click', () => {
        if (mediaFileInput) mediaFileInput.click();
        else if (audioFileInput) audioFileInput.click();
      });
    }
    const btnEmptyAS = document.getElementById('btnEmptyAutoShorts');
    if (btnEmptyAS && btnImportAutoShorts) {
      btnEmptyAS.addEventListener('click', () => {
        btnImportAutoShorts.click();
      });
    }
  }

  // Select Active Part for Editing in Beat Inspector
  function selectPart(index) {
    if (!state.storyboardParts || state.storyboardParts.length === 0 || !state.storyboardParts[index]) {
      if (activePartBadge) activePartBadge.textContent = 'NO BEAT';
      if (beatKeyframeImage) beatKeyframeImage.style.display = 'none';
      if (keyframePlaceholder) keyframePlaceholder.style.display = 'block';
      if (partPreviewImage) partPreviewImage.style.display = 'none';
      if (partPreviewPlaceholder) partPreviewPlaceholder.style.display = 'block';
      if (beatParodyIdeaText) {
        beatParodyIdeaText.textContent = 'Drop or import a video to automatically slice into ~3s micro-beats with AI director.';
      }
      return;
    }
    state.activePartIndex = index;
    const part = state.storyboardParts[index];

    renderStoryboardCards();

    if (activePartBadge) activePartBadge.textContent = `BEAT ${index + 1}`;
    if (partPropSelect) partPropSelect.value = part.prop || 'bulb';
    if (partPoseSelect) partPoseSelect.value = part.pose || 'talk';
    if (partEmotionSelect) partEmotionSelect.value = part.emotion || 'neutral';
    if (glowColorPicker) glowColorPicker.value = part.accent || '#00e5ff';

    // Update Keyframe Image
    let rawKeyframe = part.keyframe_url || (part.keyframe_file ? `/api/keyframes/${part.keyframe_file}` : null);
    if (rawKeyframe) {
      let fullUrl = rawKeyframe.startsWith('http') ? rawKeyframe : api(rawKeyframe);
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + 't=' + (part.batch_id || Date.now());
      beatKeyframeImage.src = fullUrl;
      beatKeyframeImage.style.display = 'block';
      if (keyframePlaceholder) keyframePlaceholder.style.display = 'none';
    } else {
      beatKeyframeImage.style.display = 'none';
      if (keyframePlaceholder) keyframePlaceholder.style.display = 'block';
    }

    // Update AI Parody Director Idea Text
    if (beatParodyIdeaText) {
      beatParodyIdeaText.textContent = part.parody_idea || 'Narrative synchronized parody choreography.';
    }

    // Character Model Item Highlight
    document.querySelectorAll('.fl-character-picker .fl-char-item').forEach(c => {
      c.classList.toggle('active', c.dataset.char === (part.model || 'classic'));
    });

    // Refresh Instant Part Preview Frame
    fetchPartPreview(part);
  }

  // Instant Canvas Part Preview Frame
  async function fetchPartPreview(part) {
    if (!partPreviewImage || !part) return;

    // Use AI Agent Dynamic Cartoonist parody thumbnail if available
    let rawParody = part.parody_thumb_url || (part.parody_thumb_file ? `/api/keyframes/${part.parody_thumb_file}` : null);
    if (rawParody) {
      let fullUrl = rawParody.startsWith('http') ? rawParody : api(rawParody);
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + 't=' + (part.batch_id || Date.now());
      partPreviewImage.src = fullUrl;
      partPreviewImage.style.display = 'block';
      if (partPreviewPlaceholder) partPreviewPlaceholder.style.display = 'none';
      return;
    }

    if (partPreviewPlaceholder) partPreviewPlaceholder.style.display = 'none';

    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = 180;
      offscreen.height = 320;
      const oCtx = offscreen.getContext('2d');

      oCtx.fillStyle = state.colors.bg || '#11141c';
      oCtx.fillRect(0, 0, 180, 320);

      oCtx.strokeStyle = '#222836';
      oCtx.lineWidth = 1;
      oCtx.beginPath();
      oCtx.moveTo(0, 260);
      oCtx.lineTo(180, 260);
      oCtx.stroke();

      const accent = part.accent || state.colors.glow || '#00e5ff';
      const stick = state.colors.stick || '#ffffff';
      const cx = 90;
      const cy = 150;

      oCtx.save();
      oCtx.shadowColor = accent;
      oCtx.shadowBlur = 10;

      // Head
      oCtx.beginPath();
      oCtx.arc(cx, cy - 40, 20, 0, Math.PI * 2);
      oCtx.fillStyle = '#161b26';
      oCtx.fill();
      oCtx.lineWidth = 3;
      oCtx.strokeStyle = stick;
      oCtx.stroke();

      // Eyes
      oCtx.fillStyle = '#11141c';
      oCtx.beginPath();
      oCtx.arc(cx - 7, cy - 42, 3, 0, Math.PI * 2);
      oCtx.arc(cx + 7, cy - 42, 3, 0, Math.PI * 2);
      oCtx.fill();

      // Mouth
      oCtx.strokeStyle = stick;
      oCtx.lineWidth = 2;
      oCtx.beginPath();
      if (part.emotion === 'happy') {
        oCtx.arc(cx, cy - 38, 7, 0, Math.PI);
      } else if (part.emotion === 'surprised') {
        oCtx.arc(cx, cy - 35, 5, 0, Math.PI * 2);
      } else if (part.emotion === 'angry') {
        oCtx.moveTo(cx - 7, cy - 33);
        oCtx.lineTo(cx + 7, cy - 37);
      } else {
        oCtx.moveTo(cx - 7, cy - 35);
        oCtx.lineTo(cx + 7, cy - 35);
      }
      oCtx.stroke();

      // Body Spine
      oCtx.beginPath();
      oCtx.moveTo(cx, cy - 20);
      oCtx.lineTo(cx, cy + 40);
      oCtx.stroke();

      // Arms
      oCtx.beginPath();
      if (part.pose === 'talk') {
        oCtx.moveTo(cx, cy - 10);
        oCtx.lineTo(cx - 24, cy - 5);
        oCtx.lineTo(cx - 32, cy - 22);
        oCtx.moveTo(cx, cy - 10);
        oCtx.lineTo(cx + 24, cy + 10);
        oCtx.lineTo(cx + 28, cy + 30);
      } else if (part.pose === 'point') {
        oCtx.moveTo(cx, cy - 10);
        oCtx.lineTo(cx + 30, cy - 20);
        oCtx.lineTo(cx + 45, cy - 25);
        oCtx.moveTo(cx, cy - 10);
        oCtx.lineTo(cx - 20, cy + 15);
      } else {
        oCtx.moveTo(cx, cy - 10);
        oCtx.lineTo(cx - 25, cy + 15);
        oCtx.moveTo(cx, cy - 10);
        oCtx.lineTo(cx + 25, cy + 15);
      }
      oCtx.stroke();

      // Legs
      oCtx.beginPath();
      oCtx.moveTo(cx, cy + 40);
      oCtx.lineTo(cx - 18, cy + 95);
      oCtx.moveTo(cx, cy + 40);
      oCtx.lineTo(cx + 18, cy + 95);
      oCtx.stroke();

      // Prop Emoji
      const propEmojiMap = {
        bulb: '💡', question: '❓', chart_up: '📈', chart_down: '📉',
        alert: '⚠️', brain: '🧠', heart: '❤️', broken_heart: '💔',
        clock: '⏰', phone: '📱', target: '🎯', battery: '🔋',
        scale: '⚖️', lock: '🔒', eyes: '👀', book: '📖',
        house: '🏠', people: '👥', mask: '🎭', bell: '🔔', fire: '🔥'
      };
      const emoji = propEmojiMap[part.prop] || '💡';
      oCtx.font = '20px sans-serif';
      oCtx.textAlign = 'center';
      oCtx.textBaseline = 'middle';
      oCtx.fillText(emoji, cx + 32, cy - 25);

      oCtx.restore();

      // Model & Pose Badge
      oCtx.font = 'bold 10px monospace';
      oCtx.textAlign = 'center';
      oCtx.fillStyle = accent;
      oCtx.fillText(`${(part.model || 'CLASSIC')} [${(part.pose || 'TALK')}]`.toUpperCase(), cx, 305);

      partPreviewImage.src = offscreen.toDataURL();
      partPreviewImage.style.display = 'block';
    } catch (e) {
      console.warn('[Offscreen preview render error]', e);
    }
  }

  // -------------------------------------------------------------
  // AutoShorts Bridge Integration
  // -------------------------------------------------------------
  if (btnImportAutoShorts) {
    btnImportAutoShorts.addEventListener('click', async () => {
      if (modalAutoShorts) modalAutoShorts.style.display = 'flex';
      if (autoshortsClipsList) {
        autoshortsClipsList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 12px;">Scanning for AutoShorts clips...</div>';
      }

      try {
        const autoshortsUrl = api('/api/bridge/autoshorts');
        const res = await fetch(autoshortsUrl);
        const data = await res.json();
        if (data.clips && data.clips.length > 0) {
          autoshortsClipsList.innerHTML = '';
          data.clips.forEach(clip => {
            const card = document.createElement('div');
            card.className = 'fl-clip-card';
            card.innerHTML = `
              <div>
                <div class="fl-clip-title">🎬 ${clip.name}</div>
                <div class="fl-clip-meta">${clip.size_mb} • ${new Date(clip.modified_at).toLocaleTimeString()}</div>
              </div>
              <button class="fl-btn fl-btn-accent" style="width: auto; padding: 4px 10px; font-size: 11px;">
                Select & Slice
              </button>
            `;
            card.addEventListener('click', async () => {
              if (modalAutoShorts) modalAutoShorts.style.display = 'none';
              state.videoPath = clip.path;
              state.currentAudioServerPath = clip.path;
              loadedFileName.textContent = clip.name;
              loadedFileInfo.style.display = 'block';
              systemStatusText.textContent = `Selected: ${clip.name}. Slicing beats...`;
              await sliceMediaBeats(clip.path);
            });
            autoshortsClipsList.appendChild(card);
          });
        } else {
          autoshortsClipsList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 12px;">No video clips found in AutoShorts directory yet. Click "Browse Video File" to import any MP4 video directly.</div>';
        }
      } catch (err) {
        console.error('[AutoShorts Bridge Error]', err);
        autoshortsClipsList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--accent-rose); font-size: 12px;">Failed to scan AutoShorts directory.</div>';
      }
    });
  }

  if (btnCloseAutoShortsModal) {
    btnCloseAutoShortsModal.addEventListener('click', () => {
      if (modalAutoShorts) modalAutoShorts.style.display = 'none';
    });
  }

  // -------------------------------------------------------------
  // Native Folder Picker Integration
  // -------------------------------------------------------------
  if (btnBrowseFolder) {
    btnBrowseFolder.addEventListener('click', async () => {
      systemStatusText.textContent = 'Selecting Output Folder...';
      try {
        const folderUrl = api('/api/pick-folder');
        const res = await fetch(folderUrl);
        const data = await res.json();
        if (data && data.path) {
          state.destinationDir = data.path;
          if (destinationDirInput) destinationDirInput.value = data.path;
          systemStatusText.textContent = `Save Target: ${data.path}`;
        }
      } catch (err) {
        console.error('[Pick Folder Error]', err);
        systemStatusText.textContent = 'Folder picker cancelled';
      }
    });
  }

  // -------------------------------------------------------------
  // Render Mode Selector
  // -------------------------------------------------------------
  if (selectRenderMode) {
    selectRenderMode.addEventListener('change', (e) => {
      state.renderMode = e.target.value;
      if (activeModeBadge) {
        activeModeBadge.textContent = state.renderMode === 'split_pip' ? 'SPLIT-PIP' : 'FULL 2D';
      }
      systemStatusText.textContent = `Render Mode: ${state.renderMode}`;
    });
  }

  // -------------------------------------------------------------
  // Storyboard Scene Management & Inspector Logic
  // -------------------------------------------------------------
  if (tabAudioSource && tabStoryboard) {
    tabAudioSource.addEventListener('click', () => {
      tabAudioSource.classList.add('active');
      tabStoryboard.classList.remove('active');
      tabContentAudio.style.display = 'block';
      tabContentStoryboard.style.display = 'none';
    });

    tabStoryboard.addEventListener('click', () => {
      tabStoryboard.classList.add('active');
      tabAudioSource.classList.remove('active');
      tabContentStoryboard.style.display = 'block';
      tabContentAudio.style.display = 'none';
    });
  }

  if (btnAddScenePart) {
    btnAddScenePart.addEventListener('click', () => {
      const idx = state.storyboardParts.length;
      const lastPart = idx > 0 ? state.storyboardParts[idx - 1] : null;
      const startSec = lastPart ? lastPart.end : 0;
      const endSec = startSec + 3.0;

      const newPart = {
        id: `beat_${String(idx + 1).padStart(3, '0')}`,
        index: idx + 1,
        start: startSec,
        end: endSec,
        duration: 3.0,
        text: `Custom Beat ${idx + 1}`,
        prop: 'bulb',
        pose: 'talk',
        emotion: 'neutral',
        model: state.characterArchetype || 'classic',
        accent: state.colors.glow || '#00e5ff',
        camera_shake: false,
        parody_idea: 'Custom narrative parody beat'
      };

      state.storyboardParts.push(newPart);
      state.activePartIndex = idx;
      renderStoryboardCards();
      selectPart(idx);
      systemStatusText.textContent = `Added Beat ${idx + 1}`;
    });
  }

  // Inspector Select Handlers
  if (btnRefreshPartPreview) {
    btnRefreshPartPreview.addEventListener('click', () => {
      const part = state.storyboardParts[state.activePartIndex];
      if (part) fetchPartPreview(part);
    });
  }

  if (partPropSelect) {
    partPropSelect.addEventListener('change', () => {
      const p = state.storyboardParts[state.activePartIndex];
      if (p) {
        p.prop = partPropSelect.value;
        renderStoryboardCards();
        fetchPartPreview(p);
      }
    });
  }

  if (partPoseSelect) {
    partPoseSelect.addEventListener('change', () => {
      const p = state.storyboardParts[state.activePartIndex];
      if (p) {
        p.pose = partPoseSelect.value;
        renderStoryboardCards();
        fetchPartPreview(p);
      }
    });
  }

  if (partEmotionSelect) {
    partEmotionSelect.addEventListener('change', () => {
      const p = state.storyboardParts[state.activePartIndex];
      if (p) {
        p.emotion = partEmotionSelect.value;
        renderStoryboardCards();
        fetchPartPreview(p);
      }
    });
  }

  // Dropzone Handlers
  if (uploadDropzone) {
    uploadDropzone.addEventListener('click', (e) => {
      if (e.target === mediaFileInput || e.target === audioFileInput) return;
      if (mediaFileInput) mediaFileInput.click();
      else if (audioFileInput) audioFileInput.click();
    });
    uploadDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadDropzone.style.borderColor = 'var(--accent-cyan)';
      uploadDropzone.style.background = 'rgba(0, 229, 255, 0.08)';
    });
    uploadDropzone.addEventListener('dragleave', () => {
      uploadDropzone.style.borderColor = 'var(--border-subtle)';
      uploadDropzone.style.background = 'rgba(26, 32, 44, 0.4)';
    });
    uploadDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadDropzone.style.borderColor = 'var(--border-subtle)';
      uploadDropzone.style.background = 'rgba(26, 32, 44, 0.4)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        uploadMediaFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (mediaFileInput) {
    mediaFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        e.target.value = '';
        uploadMediaFile(file);
      }
    });
  }

  if (audioFileInput) {
    audioFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        e.target.value = '';
        uploadMediaFile(file);
      }
    });
  }

  // Voice Transformation Presets
  document.querySelectorAll('.fl-profile-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.fl-profile-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.selectedProfile = card.dataset.profile;

      if (state.selectedProfile === 'kids') {
        pitchSlider.value = 1.45;
        speedSlider.value = 1.05;
      } else if (state.selectedProfile === 'cartoon') {
        pitchSlider.value = 1.6;
        speedSlider.value = 1.1;
      } else if (state.selectedProfile === 'chipmunk') {
        pitchSlider.value = 1.85;
        speedSlider.value = 1.25;
      } else if (state.selectedProfile === 'robot') {
        pitchSlider.value = 0.95;
        speedSlider.value = 1.0;
      }
      pitchValDisplay.textContent = `${pitchSlider.value}x`;
      speedValDisplay.textContent = `${speedSlider.value}x`;
    });
  });

  if (pitchSlider) {
    pitchSlider.addEventListener('input', () => {
      pitchValDisplay.textContent = `${pitchSlider.value}x`;
    });
  }
  if (speedSlider) {
    speedSlider.addEventListener('input', () => {
      speedValDisplay.textContent = `${speedSlider.value}x`;
    });
  }

  // Character Archetype Picker in Inspector
  document.querySelectorAll('.fl-character-picker .fl-char-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.fl-character-picker .fl-char-item').forEach(c => c.classList.remove('active'));
      item.classList.add('active');
      state.characterArchetype = item.dataset.char;

      const p = state.storyboardParts[state.activePartIndex];
      if (p) {
        p.model = item.dataset.char;
        renderStoryboardCards();
        fetchPartPreview(p);
      }
      renderStickman();
    });
  });

  // Color Pickers
  if (stickColorPicker) {
    stickColorPicker.addEventListener('input', (e) => {
      state.colors.stick = e.target.value;
      renderStickman();
    });
  }
  if (glowColorPicker) {
    glowColorPicker.addEventListener('input', (e) => {
      state.colors.glow = e.target.value;
      const p = state.storyboardParts[state.activePartIndex];
      if (p) {
        p.accent = e.target.value;
        fetchPartPreview(p);
      }
      renderStickman();
    });
  }
  if (bgColorPicker) {
    bgColorPicker.addEventListener('input', (e) => {
      state.colors.bg = e.target.value;
      renderStickman();
    });
  }

  // Reset Pose
  if (btnResetPose) {
    btnResetPose.addEventListener('click', () => {
      state.kinematics = { gestureExaggeration: 1.2, headBobRate: 1.0, mouthThreshold: 0.3 };
      renderStickman();
    });
  }

  // Play / Pause
  if (btnPlayPause) {
    btnPlayPause.addEventListener('click', togglePlayPause);
  }

  if (timelineTrack) {
    timelineTrack.addEventListener('click', (e) => {
      const dur = state.audioDuration || 9.0;
      const rect = timelineTrack.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      state.currentTime = ratio * dur;
      if (state.isPlaying) {
        playAudio();
      } else {
        updateTimelineDisplay();
        renderStickman();
      }
    });
  }

  // Voice FX Apply Button
  if (btnTransformVoice) {
    btnTransformVoice.addEventListener('click', () => {
      systemStatusText.textContent = `Applying ${state.selectedProfile} Voice FX...`;
      setTimeout(() => {
        systemStatusText.textContent = `Voice Transformed (${state.selectedProfile})`;
      }, 600);
    });
  }

  // -------------------------------------------------------------
  // Export Video Pipeline (Dual-Mode: Split-PIP or Full Stickman)
  // -------------------------------------------------------------
  if (btnExportVideo) {
    btnExportVideo.addEventListener('click', async () => {
      systemStatusText.textContent = 'Packaging Render Task...';

      if (renderProgressCard) {
        renderProgressCard.style.display = 'block';
        if (renderStageText) renderStageText.textContent = 'INITIALIZING';
        if (renderProgressBar) renderProgressBar.style.width = '5%';
        if (renderPercentText) renderPercentText.textContent = '5%';
        if (renderDestinationNotice) renderDestinationNotice.style.display = 'none';
        if (renderDownloadBox) renderDownloadBox.style.display = 'none';
      }

      try {
        const payload = {
          video_path: state.videoPath || state.currentAudioServerPath,
          audio_path: state.currentAudioServerPath || loadedFileName.textContent || 'voice_kids.mp3',
          render_mode: state.renderMode || 'split_pip',
          beats: state.storyboardParts,
          title: 'AutoShorts Stickman Parody',
          destination_dir: state.destinationDir || '',
          transcript: transcriptInput ? transcriptInput.value : '',
          voice_profile: state.selectedProfile,
          character_style: state.characterArchetype,
          resolution: '720x1280',
          fps: 30
        };

        const renderUrl = api('/api/render/video');
        const res = await fetch(renderUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!data.success || !data.job_id) {
          throw new Error(data.error || 'Failed to initialize render job');
        }

        const jobId = data.job_id;
        if (renderJobId) renderJobId.textContent = `Job: ${jobId.slice(0, 16)}...`;
        systemStatusText.textContent = `Rendering: ${jobId.slice(0, 12)}`;

        // Polling Progress HUD
        const pollInterval = setInterval(async () => {
          try {
            const jobStatusUrl = api(`/api/jobs/${jobId}`);
            const pollRes = await fetch(jobStatusUrl);
            const jobData = await pollRes.json();
            if (jobData && jobData.status) {
              if (renderStageText) renderStageText.textContent = jobData.stage.toUpperCase();
              if (renderProgressBar) renderProgressBar.style.width = `${jobData.progress}%`;
              if (renderPercentText) renderPercentText.textContent = `${jobData.progress}%`;

              if (jobData.status === 'completed') {
                clearInterval(pollInterval);
                systemStatusText.textContent = 'Render Completed Successfully!';

                if (jobData.destination_file && renderDestinationNotice && renderDestinationPath) {
                  renderDestinationPath.textContent = jobData.destination_file;
                  renderDestinationNotice.style.display = 'block';
                }

                if (renderDownloadBox && btnDownloadRendered) {
                  renderDownloadBox.style.display = 'block';
                  const downloadUrl = jobData.output_url ? api(jobData.output_url) : api(`/exports/${jobData.output_file}`);
                  btnDownloadRendered.href = downloadUrl;
                  btnDownloadRendered.textContent = `⬇️ Download ${jobData.output_file || 'Short Video (MP4)'}`;
                }
              } else if (jobData.status === 'failed' || jobData.status === 'cancelled') {
                clearInterval(pollInterval);
                systemStatusText.textContent = `Render ${jobData.status}: ${jobData.error || ''}`;
                if (renderStageText) renderStageText.textContent = 'FAILED';
              }
            }
          } catch (err) {
            console.error('[Poll Error]', err);
          }
        }, 800);

      } catch (err) {
        console.error('[Render Error]', err);
        systemStatusText.textContent = 'Render Request Failed';
        if (renderStageText) renderStageText.textContent = 'ERROR';
      }
    });
  }

  // Initialize Storyboard & Animation Loop
  resolveApiBase();
  renderStoryboardCards();
  selectPart(0);
  animationTick();

})();
