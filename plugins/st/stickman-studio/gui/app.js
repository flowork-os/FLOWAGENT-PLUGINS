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
  // Auto-load latest beats manifest on startup if available
  async function autoLoadLatestBeats() {
    try {
      await resolveApiBase();
      const res = await fetch(api('/api/beats/latest'));
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.success && data.manifest && Array.isArray(data.manifest.beats) && data.manifest.beats.length > 0) {
        state.storyboardParts = data.manifest.beats;
        state.activePartIndex = 0;
        if (data.manifest.input_path) {
          state.videoPath = data.manifest.input_path;
          state.currentAudioServerPath = data.manifest.input_path;
          initPreviewVideo(data.manifest.input_path);
          if (loadedFileName) loadedFileName.textContent = data.manifest.input_path.split('/').pop();
          if (loadedFileInfo) loadedFileInfo.style.display = 'block';
        }
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
            })
            .catch(() => {});
        }
        if (data.manifest.total_duration) {
          state.audioDuration = data.manifest.total_duration;
          updateTimelineDisplay();
        }
        if (data.manifest.full_transcript && transcriptInput) {
          transcriptInput.value = data.manifest.full_transcript;
        }
        renderStoryboardCards();
        selectPart(0);
        if (systemStatusText) {
          systemStatusText.textContent = `Loaded ${state.storyboardParts.length} parody beats ready.`;
        }
      }
    } catch (e) {
      console.warn('[AutoLoadBeats Notice]', e.message);
    }
  }

  // Kickoff auto-load after resolveApiBase
  autoLoadLatestBeats();


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
    characterArchetype: 'auto',
    aspectRatio: '9:16', // '9:16' or '16:9'
    renderMode: 'mocap', // Video MoCap AI tracking standard
    framingMode: 'auto',
    customBackgroundPath: null,
    stagingStyle: 'stick_hub_storyteller', // Stick Hub Solo Storyteller standard
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
  const exportBtnLabel = document.getElementById('exportBtnLabel');
  const selectAspectRatio = document.getElementById('selectAspectRatio');
  const viewportRatioLabel = document.getElementById('viewportRatioLabel');

  // Header & Bridge DOM Elements
  const selectRenderMode = document.getElementById('selectRenderMode');
  const selectStagingStyle = document.getElementById('selectStagingStyle');
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

  // Sovereign Feedback & Notification Toast Bus
  function showFeedbackNotice(message, type = 'info') {
    if (systemStatusText) {
      systemStatusText.textContent = message;
    }
    let container = document.getElementById('flFeedbackContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'flFeedbackContainer';
      container.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; pointer-events: none;';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const bgColors = {
      success: 'rgba(16, 185, 129, 0.95)',
      error: 'rgba(239, 68, 68, 0.95)',
      warning: 'rgba(245, 158, 11, 0.95)',
      info: 'rgba(0, 229, 255, 0.95)'
    };
    const textColors = {
      success: '#ffffff',
      error: '#ffffff',
      warning: '#000000',
      info: '#000000'
    };
    toast.style.cssText = `background: ${bgColors[type] || bgColors.info}; color: ${textColors[type] || '#000'}; font-size: 12px; font-weight: 600; padding: 10px 16px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); opacity: 0; transform: translateY(10px); transition: all 0.25s ease; pointer-events: auto;`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Probe & Display Live 3D Vault Assets Connection
  async function loadVaultStatus() {
    const vaultText = document.getElementById('vaultAssetCountText');
    const vaultBadge = document.getElementById('vaultStatusBadge');
    if (!vaultText) return;
    try {
      const res = await fetch(api('/api/vault/3d'));
      if (res.ok) {
        const data = await res.json();
        if (data && data.status === 'connected') {
          const count = data.total_assets ? Number(data.total_assets).toLocaleString() : '34,840';
          vaultText.innerHTML = `<strong>3D Asset Vault:</strong> ${count} Models Connected (${data.vault_name || 'DNA, Skeleton & Props'})`;
          if (vaultBadge) {
            vaultBadge.style.borderColor = 'rgba(0, 229, 255, 0.4)';
            vaultBadge.style.background = 'rgba(0, 229, 255, 0.08)';
          }
        }
      }
    } catch (e) {
      console.warn('[3D Vault Probe Notice]', e.message);
    }
  }

  // Kickoff 3D Vault connection check
  loadVaultStatus();

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

  // Initialize or update synchronized video preview element
  function initPreviewVideo(src) {
    if (!src) return;
    let vid = document.getElementById('flInternalPreviewVideo');
    if (!vid) {
      vid = document.createElement('video');
      vid.id = 'flInternalPreviewVideo';
      vid.playsInline = true;
      vid.muted = true;
      vid.crossOrigin = 'anonymous';
      vid.preload = 'auto';
      vid.style.display = 'none';
      document.body.appendChild(vid);
    }
    const cleanSrc = src.startsWith('blob:') || src.startsWith('http')
      ? src
      : (src.startsWith('/uploads/') || src.startsWith('/exports/') || src.startsWith('/data/')
          ? api(src)
          : api('/uploads/' + src.split('/').pop()));
    if (vid.src !== cleanSrc) {
      vid.src = cleanSrc;
      vid.load();
    }
    vid.onloadedmetadata = () => {
      if (vid.videoWidth && vid.videoHeight) {
        if (vid.videoWidth > vid.videoHeight && state.aspectRatio !== '16:9') {
          if (typeof applyAspectRatio === 'function') {
            applyAspectRatio('16:9');
            showFeedbackNotice('Detected widescreen video (16:9). Viewport frame adjusted to landscape.', 'info');
          }
        } else if (vid.videoHeight >= vid.videoWidth && state.aspectRatio !== '9:16') {
          if (typeof applyAspectRatio === 'function') {
            applyAspectRatio('9:16');
          }
        }
      }
    };
    state.previewVideo = vid;
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

    if (state.previewVideo) {
      try {
        state.previewVideo.currentTime = state.currentTime;
        state.previewVideo.play().catch(() => {});
      } catch (_) {}
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
    if (state.previewVideo) {
      try { state.previewVideo.pause(); } catch (_) {}
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
      let uploadUrl = api(`/api/fs/upload-media?filename=${encodeURIComponent(file.name)}`);
      let res;
      try {
        res = await fetch(uploadUrl, {
          method: 'POST',
          body: file
        });
      } catch (netErr) {
        console.warn('[Upload Retry] Initial fetch failed, resolving fresh API base...', netErr.message);
        await resolveApiBase(true);
        uploadUrl = api(`/api/fs/upload-media?filename=${encodeURIComponent(file.name)}`);
        res = await fetch(uploadUrl, {
          method: 'POST',
          body: file
        });
      }
      if (!res.ok) {
        throw new Error(`Upload failed with HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.success || !data.path) {
        throw new Error(data.error || 'Upload failed: missing server path');
      }

      state.videoPath = data.path;
      state.currentAudioServerPath = data.path;
      initPreviewVideo(data.url || data.path);
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
        body: JSON.stringify({ media_path: targetPath, target_seconds: 3.0, max_duration: 300.0 })
      });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();

      // e) On response: populate state.storyboardParts with real sliced beats and keyframes returned by server
      if (data.success && data.manifest && Array.isArray(data.manifest.beats)) {
        state.storyboardParts = data.manifest.beats;
        state.activePartIndex = 0;
        if (data.manifest.input_path) {
          state.videoPath = data.manifest.input_path;
          state.currentAudioServerPath = data.manifest.input_path;
          initPreviewVideo(data.manifest.input_path);
        }

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
    const customBg = currentBeat && (currentBeat.background_image || currentBeat.background_url || currentBeat.background_path);

    // 1. Procedural Background Stages (Responsive for 16:9 Landscape & 9:16 Portrait)
    function drawBackgroundStage(type, bx, by, bw, bh) {
      const groundY = Math.round(by + bh * 0.75);

      if (type === 'medical_lab') {
        ctx.fillStyle = '#232830';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#141820';
        ctx.fillRect(bx + 20, by + 30, bw - 40, Math.min(110, bh * 0.28));
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx + 20, by + 30, bw - 40, Math.min(110, bh * 0.28));
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#00e5ff';
        ctx.fillText('AI MEDICAL & SCIENCE LAB', bx + 32, by + 48);
        ctx.fillStyle = '#38ef7d';
        ctx.beginPath();
        const waveY = by + 75;
        ctx.moveTo(bx + 32, waveY);
        for (let x = bx + 32; x < bx + bw - 32; x += 8) {
          let pulse = Math.sin((x * 0.15) - (timeSec * 8)) * 8;
          if (x > bx + 80 && x < bx + 130) {
            pulse = Math.sin((x * 0.4) - (timeSec * 12)) * 18;
          }
          ctx.lineTo(x, waveY + pulse);
        }
        ctx.stroke();
        ctx.fillStyle = '#181d26';
        ctx.fillRect(bx, groundY, bw, bh - (groundY - by));
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, groundY); ctx.lineTo(bx + bw, groundY);
        ctx.stroke();

      } else if (type === 'beach_bali') {
        const skyGrad = ctx.createLinearGradient(bx, by, bx, groundY);
        skyGrad.addColorStop(0, '#f97316');
        skyGrad.addColorStop(0.5, '#ec4899');
        skyGrad.addColorStop(1, '#6366f1');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(bx, by, bw, groundY - by);
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(bx + bw / 2, by + bh * 0.35, Math.min(45, bw * 0.12), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(bx, Math.round(by + bh * 0.58), bw, groundY - Math.round(by + bh * 0.58));
        ctx.fillStyle = '#d97706';
        ctx.fillRect(bx, groundY, bw, bh - (groundY - by));

      } else if (type === 'cyber_grid') {
        ctx.fillStyle = '#0f111a';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#090a10';
        ctx.fillRect(bx, groundY, bw, bh - (groundY - by));
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx, groundY); ctx.lineTo(bx + bw, groundY);
        for (let gx = bx - 100; gx <= bx + bw + 100; gx += 40) {
          ctx.moveTo(bx + bw / 2, groundY);
          ctx.lineTo(gx, by + bh);
        }
        ctx.stroke();

      } else if (type === 'raining_street') {
        // Dramatic Rainy Street with glowing lamppost light cone
        const rainGrad = ctx.createLinearGradient(bx, by, bx, groundY);
        rainGrad.addColorStop(0, '#080b12');
        rainGrad.addColorStop(1, '#161e2e');
        ctx.fillStyle = rainGrad;
        ctx.fillRect(bx, by, bw, groundY - by);

        // Wet pavement
        ctx.fillStyle = '#0b0f17';
        ctx.fillRect(bx, groundY, bw, bh - (groundY - by));
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, groundY); ctx.lineTo(bx + bw, groundY);
        ctx.stroke();

        // Lamppost & warm light cone
        const lampX = Math.round(bx + bw * 0.82);
        const lampY = Math.round(by + bh * 0.22);
        ctx.fillStyle = 'rgba(254, 240, 138, 0.08)';
        ctx.beginPath();
        ctx.moveTo(lampX, lampY);
        ctx.lineTo(lampX - 75, groundY);
        ctx.lineTo(lampX + 75, groundY);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(lampX, groundY);
        ctx.lineTo(lampX, lampY);
        ctx.lineTo(lampX - 14, lampY);
        ctx.stroke();
        ctx.fillStyle = '#fef08a';
        ctx.shadowColor = '#fef08a';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(lampX - 14, lampY + 4, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Animated Rain Streaks
        ctx.strokeStyle = 'rgba(147, 197, 253, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 28; i++) {
          const rx = bx + ((i * 37 + timeSec * 220) % (bw + 60)) - 30;
          const ry = by + ((i * 53 + timeSec * 340) % (groundY - by));
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 4, ry + 12);
        }
        ctx.stroke();

      } else if (type === 'bedroom_night') {
        // Melancholic Bedroom Window at Night
        ctx.fillStyle = '#0a0e17';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#141724';
        ctx.fillRect(bx, groundY, bw, bh - (groundY - by));

        // Window with Moonlight Beam
        const winX = bx + 24;
        const winY = by + 28;
        const winW = Math.min(75, bw * 0.25);
        const winH = Math.min(105, bh * 0.32);
        ctx.fillStyle = '#030712';
        ctx.fillRect(winX, winY, winW, winH);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(winX, winY, winW, winH);

        // Crescent moon in window
        ctx.fillStyle = '#e0f2fe';
        ctx.beginPath();
        ctx.arc(winX + winW * 0.65, winY + winH * 0.35, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#030712';
        ctx.beginPath();
        ctx.arc(winX + winW * 0.65 - 3, winY + winH * 0.35 - 2, 7.5, 0, Math.PI * 2);
        ctx.fill();

        // Moonlight Beam across floor
        ctx.fillStyle = 'rgba(56, 189, 248, 0.06)';
        ctx.beginPath();
        ctx.moveTo(winX + winW, winY + winH);
        ctx.lineTo(winX + winW + 110, groundY + 30);
        ctx.lineTo(winX + winW - 30, groundY + 30);
        ctx.lineTo(winX, winY + winH);
        ctx.closePath();
        ctx.fill();

      } else if (type === 'dream_void') {
        // Dream Void with luminescent rising particles
        const voidGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
        voidGrad.addColorStop(0, '#12072b');
        voidGrad.addColorStop(0.5, '#0d091e');
        voidGrad.addColorStop(1, '#050510');
        ctx.fillStyle = voidGrad;
        ctx.fillRect(bx, by, bw, bh);

        // Luminescent floating particles
        for (let i = 0; i < 20; i++) {
          const px = bx + ((i * 47 + Math.sin(timeSec + i) * 20) % bw);
          const py = by + ((i * 39 - timeSec * 35) % bh + bh) % bh;
          const pAlpha = 0.25 + Math.sin(timeSec * 2 + i) * 0.2;
          ctx.fillStyle = `rgba(192, 132, 252, ${pAlpha.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(px, py, 2 + (i % 3), 0, Math.PI * 2);
          ctx.fill();
        }

      } else if (type === 'rooftop_stars') {
        // Rooftop Starry Night with Skyline Silhouettes
        const skyGrad = ctx.createLinearGradient(bx, by, bx, groundY);
        skyGrad.addColorStop(0, '#030712');
        skyGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(bx, by, bw, groundY - by);

        // Blinking Stars
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 35; i++) {
          const sx = bx + ((i * 61) % bw);
          const sy = by + ((i * 37) % Math.round((groundY - by) * 0.8));
          const starAlpha = 0.3 + Math.sin(timeSec * 4 + i) * 0.4;
          if (starAlpha > 0.1) {
            ctx.globalAlpha = starAlpha;
            ctx.beginPath();
            ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1.0;

        // City skyline silhouettes
        ctx.fillStyle = '#090d16';
        for (let b = 0; b < 6; b++) {
          const bW = Math.round(bw * 0.18);
          const bH = 30 + ((b * 19) % 55);
          const bX = bx + Math.round(b * (bw * 0.17));
          ctx.fillRect(bX, groundY - bH, bW, bH);
        }

        // Rooftop Ledge & Railing
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(bx, groundY, bw, bh - (groundY - by));
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bx, groundY - 18); ctx.lineTo(bx + bw, groundY - 18);
        ctx.moveTo(bx, groundY - 8); ctx.lineTo(bx + bw, groundY - 8);
        for (let rx = bx + 20; rx < bx + bw; rx += 30) {
          ctx.moveTo(rx, groundY); ctx.lineTo(rx, groundY - 18);
        }
        ctx.stroke();

      } else if (type === 'sunrise_hill') {
        // Dawn Sunrise Gradient
        const dawnGrad = ctx.createLinearGradient(bx, by, bx, groundY);
        dawnGrad.addColorStop(0, '#1e1b4b');
        dawnGrad.addColorStop(0.35, '#b45309');
        dawnGrad.addColorStop(0.7, '#fb923c');
        dawnGrad.addColorStop(1, '#fde047');
        ctx.fillStyle = dawnGrad;
        ctx.fillRect(bx, by, bw, groundY - by);

        // Rising Sun Disk
        ctx.fillStyle = '#fef08a';
        ctx.shadowColor = '#fde047';
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(bx + bw / 2, groundY, Math.min(48, bw * 0.14), Math.PI, 0);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Rolling Hill Silhouette
        ctx.fillStyle = '#0f291e';
        ctx.beginPath();
        ctx.moveTo(bx, groundY + 10);
        ctx.quadraticCurveTo(bx + bw * 0.45, groundY - 22, bx + bw, groundY + 15);
        ctx.lineTo(bx + bw, by + bh);
        ctx.lineTo(bx, by + bh);
        ctx.closePath();
        ctx.fill();

      } else if (type === 'cafe_interior') {
        // Cozy Cafe Ambiance
        const cafeGrad = ctx.createLinearGradient(bx, by, bx, groundY);
        cafeGrad.addColorStop(0, '#24140d');
        cafeGrad.addColorStop(1, '#170b06');
        ctx.fillStyle = cafeGrad;
        ctx.fillRect(bx, by, bw, groundY - by);

        // Cafe floor & wooden table
        ctx.fillStyle = '#29170e';
        ctx.fillRect(bx, groundY, bw, bh - (groundY - by));
        ctx.fillStyle = '#3f2317';
        ctx.fillRect(bx + 15, groundY - 20, bw - 30, 20);
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 15, groundY - 20, bw - 30, 20);

        // Coffee cup with rising steam
        const cupX = bx + bw * 0.72;
        const cupY = groundY - 22;
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(cupX - 7, cupY - 12, 14, 12);
        ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const steamShift = Math.sin(timeSec * 4) * 3;
        ctx.moveTo(cupX, cupY - 14);
        ctx.quadraticCurveTo(cupX + steamShift, cupY - 26, cupX, cupY - 34);
        ctx.stroke();

      } else {
        // Classic Podcast / Live Studio
        ctx.fillStyle = '#141822';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx + 16, by); ctx.lineTo(bx + 16, by + bh);
        ctx.stroke();
        ctx.strokeStyle = '#00e5ff';
        ctx.beginPath();
        ctx.moveTo(bx + bw - 16, by); ctx.lineTo(bx + bw - 16, by + bh);
        ctx.stroke();
        ctx.fillStyle = '#1a1f2c';
        ctx.fillRect(bx + bw / 2 - 45, by + 25, 90, 24);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx + bw / 2 - 45, by + 25, 90, 24);
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#ef4444';
        ctx.fillText('LIVE ON AIR', bx + bw / 2 - 32, by + 41);
        ctx.fillStyle = '#1e2433';
        ctx.fillRect(bx, groundY, bw, bh - (groundY - by));
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, groundY); ctx.lineTo(bx + bw, groundY);
        ctx.stroke();
      }
    }

    // 2. Dual-Mode Viewport Handling (Split-PIP vs Full Staging)
    const isSplitPip = (state.renderMode === 'split_pip');
    const isLandscape = canvas.width > canvas.height;
    let vidX = 0, vidY = 0, vidW = canvas.width, vidH = canvas.height;
    let stickX = 0, stickY = 0, stickW = canvas.width, stickH = canvas.height;

    if (isSplitPip) {
      if (isLandscape) {
        // 16:9 Landscape: Left Half = Video, Right Half = Stickman
        vidW = Math.round(canvas.width / 2); vidH = canvas.height;
        stickX = vidW; stickY = 0; stickW = canvas.width - vidW; stickH = canvas.height;
      } else {
        // 9:16 Portrait: Top Half = Video, Bottom Half = Stickman
        vidW = canvas.width; vidH = Math.round(canvas.height / 2);
        stickX = 0; stickY = vidH; stickW = canvas.width; stickH = canvas.height - vidH;
      }

      // Synchronized Video / Keyframe Layer
      let videoRendered = false;
      if (state.previewVideo && (state.previewVideo.readyState >= 2 || state.previewVideo.currentTime > 0)) {
        try {
          const vw = state.previewVideo.videoWidth;
          const vh = state.previewVideo.videoHeight;
          if (vw && vh) {
            const targetRatio = vidW / vidH;
            const currRatio = vw / vh;
            let sx = 0, sy = 0, sw = vw, sh = vh;
            if (currRatio > targetRatio) {
              sw = vh * targetRatio;
              sx = (vw - sw) / 2;
            } else {
              sh = vw / targetRatio;
              sy = (vh - sh) / 2;
            }
            ctx.drawImage(state.previewVideo, sx, sy, sw, sh, vidX, vidY, vidW, vidH);
            videoRendered = true;
          }
        } catch (_) {}
      }

      if (!videoRendered && currentBeat) {
        const kfUrl = currentBeat.keyframe_url || (currentBeat.keyframe_file ? `/api/keyframes/${currentBeat.keyframe_file}` : null);
        if (kfUrl) {
          if (!state._kfImgCache) state._kfImgCache = {};
          let kfImg = state._kfImgCache[kfUrl];
          if (!kfImg) {
            kfImg = new Image();
            kfImg.crossOrigin = 'anonymous';
            kfImg.src = kfUrl.startsWith('http') ? kfUrl : api(kfUrl);
            state._kfImgCache[kfUrl] = kfImg;
            kfImg.onload = () => { renderStickman(); };
          }
          if (kfImg.complete && kfImg.naturalWidth > 0) {
            const kw = kfImg.naturalWidth;
            const kh = kfImg.naturalHeight;
            const targetRatio = vidW / vidH;
            const currRatio = kw / kh;
            let sx = 0, sy = 0, sw = kw, sh = kh;
            if (currRatio > targetRatio) {
              sw = kh * targetRatio;
              sx = (kw - sw) / 2;
            } else {
              sh = kw / targetRatio;
              sy = (kh - sh) / 2;
            }
            ctx.drawImage(kfImg, sx, sy, sw, sh, vidX, vidY, vidW, vidH);
            videoRendered = true;
          }
        }
      }

      if (!videoRendered) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(vidX, vidY, vidW, vidH);
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isLandscape ? '🎬 LEFT VIDEO (SPLIT-PIP)' : '🎬 TOP VIDEO (SPLIT-PIP)', vidX + vidW / 2, vidY + vidH / 2);
      }

      // Divider & Center VS STICKMAN badge
      ctx.fillStyle = '#00e5ff';
      const badgeW = 92;
      const badgeH = 20;
      if (isLandscape) {
        ctx.fillRect(stickX - 2, 0, 4, canvas.height);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(stickX - badgeW / 2, (canvas.height - badgeH) / 2, badgeW, badgeH);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(stickX - badgeW / 2, (canvas.height - badgeH) / 2, badgeW, badgeH);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('VS STICKMAN', stickX, (canvas.height / 2) + 4);
      } else {
        ctx.fillRect(0, stickY - 2, canvas.width, 4);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect((canvas.width - badgeW) / 2, stickY - badgeH / 2, badgeW, badgeH);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect((canvas.width - badgeW) / 2, stickY - badgeH / 2, badgeW, badgeH);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('VS STICKMAN', canvas.width / 2, stickY + 4);
      }

      // Stickman Half Background Layer
      let hasStickBg = false;
      if (customBg) {
        if (!state._bgImgCache) state._bgImgCache = {};
        let imgObj = state._bgImgCache[customBg];
        if (!imgObj) {
          imgObj = new Image();
          imgObj.crossOrigin = 'anonymous';
          const bgFilename = customBg.split('/').pop();
          imgObj.src = customBg.startsWith('/api/') ? api(customBg) : (customBg.startsWith('http') ? customBg : api('/api/backgrounds/' + bgFilename));
          state._bgImgCache[customBg] = imgObj;
          imgObj.onload = () => { renderStickman(); };
        }
        if (imgObj.complete && imgObj.naturalWidth > 0) {
          ctx.drawImage(imgObj, stickX, stickY, stickW, stickH);
          hasStickBg = true;
        }
      }
      if (!hasStickBg) {
        drawBackgroundStage(bgType, stickX, stickY, stickW, stickH);
      }

    } else {
      // Full Stickman Viewport (16:9 Landscape or 9:16 Portrait)
      let hasFullBg = false;
      if (customBg) {
        if (!state._bgImgCache) state._bgImgCache = {};
        let imgObj = state._bgImgCache[customBg];
        if (!imgObj) {
          imgObj = new Image();
          imgObj.crossOrigin = 'anonymous';
          const bgFilename = customBg.split('/').pop();
          imgObj.src = customBg.startsWith('/api/') ? api(customBg) : (customBg.startsWith('http') ? customBg : api('/api/backgrounds/' + bgFilename));
          state._bgImgCache[customBg] = imgObj;
          imgObj.onload = () => { renderStickman(); };
        }
        if (imgObj.complete && imgObj.naturalWidth > 0) {
          ctx.drawImage(imgObj, 0, 0, canvas.width, canvas.height);
          if (state.stagingStyle === 'podcast_desk') {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
            ctx.fillRect(10, Math.round(canvas.height * 0.74), canvas.width - 20, 42);
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 2;
            ctx.strokeRect(10, Math.round(canvas.height * 0.74), canvas.width - 20, 42);
          }
          hasFullBg = true;
        }
      }
      if (!hasFullBg) {
        drawBackgroundStage(bgType, 0, 0, canvas.width, canvas.height);
      }
    }

    // 3. Stickman Character Rendering with Lyric-Driven Narrative Engine
    const actors = currentBeat && currentBeat.actors ? currentBeat.actors : null;

    function drawStickActor(cx, cy, scale, flipped, action, emotion, propName, label, shout, speaking, accentColor) {
      const sign = flipped ? -1 : 1;
      const currentModel = (currentBeat && currentBeat.model) || state.characterArchetype || 'classic';
      const actorScale = (currentModel === 'child' ? scale * 0.8 : scale);
      const headRadius = 24 * actorScale;

      const exaggeration = state.kinematics?.gestureExaggeration || 1.2;
      const bobRate = state.kinematics?.headBobRate || 1.0;
      const headBob = speaking ? Math.sin(timeSec * 14 * bobRate) * 4 * exaggeration : Math.sin(timeSec * 6 * bobRate) * 1.5 * exaggeration;
      const headCy = cy - (110 * actorScale) + headBob;

      ctx.save();
      ctx.shadowColor = accentColor || '#00e5ff';
      ctx.shadowBlur = speaking ? 12 : 4;

      // Head
      ctx.beginPath();
      ctx.arc(cx, headCy, headRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#161b26';
      ctx.fill();
      ctx.lineWidth = 3 * actorScale;
      ctx.strokeStyle = accentColor || '#ffffff';
      ctx.stroke();

      // Eyes & Eyebrows by Emotion
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (emotion === 'surprised') {
        ctx.arc(cx - (8 * actorScale), headCy - (3 * actorScale), 3.5 * actorScale, 0, Math.PI * 2);
        ctx.arc(cx + (8 * actorScale), headCy - (3 * actorScale), 3.5 * actorScale, 0, Math.PI * 2);
      } else {
        ctx.arc(cx - (8 * actorScale), headCy - (3 * actorScale), 2.5 * actorScale, 0, Math.PI * 2);
        ctx.arc(cx + (8 * actorScale), headCy - (3 * actorScale), 2.5 * actorScale, 0, Math.PI * 2);
      }
      ctx.fill();

      // Animated Tears when weeping or heartbroken
      if (emotion === 'sad' || action === 'kneel_crying' || action === 'heartbreak_clutch') {
        const tearProgress = (timeSec * 2.8) % 1;
        ctx.fillStyle = '#60a5fa';
        ctx.beginPath();
        ctx.arc(cx - (7 * actorScale), headCy + (3 + tearProgress * 15) * actorScale, 2 * actorScale, 0, Math.PI * 2);
        ctx.arc(cx + (7 * actorScale), headCy + (3 + ((tearProgress + 0.5) % 1) * 15) * actorScale, 2 * actorScale, 0, Math.PI * 2);
        ctx.fill();
      }

      // Eyebrows
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 * actorScale;
      ctx.beginPath();
      if (emotion === 'angry') {
        ctx.moveTo(cx - (13 * actorScale), headCy - (8 * actorScale));
        ctx.lineTo(cx - (3 * actorScale), headCy - (4 * actorScale));
        ctx.moveTo(cx + (3 * actorScale), headCy - (4 * actorScale));
        ctx.lineTo(cx + (13 * actorScale), headCy - (8 * actorScale));
      } else if (emotion === 'confused') {
        ctx.moveTo(cx - (13 * actorScale), headCy - (8 * actorScale));
        ctx.lineTo(cx - (3 * actorScale), headCy - (5 * actorScale));
        ctx.moveTo(cx + (3 * actorScale), headCy - (11 * actorScale));
        ctx.lineTo(cx + (13 * actorScale), headCy - (11 * actorScale));
      } else if (emotion === 'sad' || action === 'kneel_crying' || action === 'heartbreak_clutch') {
        ctx.moveTo(cx - (13 * actorScale), headCy - (4 * actorScale));
        ctx.lineTo(cx - (3 * actorScale), headCy - (8 * actorScale));
        ctx.moveTo(cx + (3 * actorScale), headCy - (8 * actorScale));
        ctx.lineTo(cx + (13 * actorScale), headCy - (4 * actorScale));
      }
      ctx.stroke();

      // Mouth (Animated when speaking)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * actorScale;
      ctx.beginPath();
      if (speaking) {
        const mouthOpen = 2 + Math.abs(Math.sin(timeSec * 16 * bobRate)) * 6 * exaggeration;
        ctx.ellipse(cx, headCy + (8 * actorScale), 5 * actorScale, mouthOpen * actorScale, 0, 0, Math.PI * 2);
      } else if (emotion === 'happy' || action === 'peaceful_sunrise') {
        ctx.arc(cx, headCy + (5 * actorScale), 6 * actorScale, 0, Math.PI);
      } else if (emotion === 'sad' || action === 'kneel_crying') {
        ctx.arc(cx, headCy + (12 * actorScale), 6 * actorScale, Math.PI, 0);
      } else if (emotion === 'surprised') {
        ctx.arc(cx, headCy + (8 * actorScale), 4 * actorScale, 0, Math.PI * 2);
      } else {
        ctx.moveTo(cx - (5 * actorScale), headCy + (8 * actorScale));
        ctx.lineTo(cx + (5 * actorScale), headCy + (8 * actorScale));
      }
      ctx.stroke();

      // Archetype Accessories
      if (currentModel === 'glasses') {
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - (13 * actorScale), headCy - (7 * actorScale), 9 * actorScale, 7 * actorScale);
        ctx.strokeRect(cx + (4 * actorScale), headCy - (7 * actorScale), 9 * actorScale, 7 * actorScale);
        ctx.beginPath();
        ctx.moveTo(cx - (4 * actorScale), headCy - (3 * actorScale));
        ctx.lineTo(cx + (4 * actorScale), headCy - (3 * actorScale));
        ctx.stroke();
      } else if (currentModel === 'cool') {
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1.5;
        ctx.fillRect(cx - (14 * actorScale), headCy - (7 * actorScale), 10 * actorScale, 7 * actorScale);
        ctx.fillRect(cx + (4 * actorScale), headCy - (7 * actorScale), 10 * actorScale, 7 * actorScale);
        ctx.strokeRect(cx - (14 * actorScale), headCy - (7 * actorScale), 10 * actorScale, 7 * actorScale);
        ctx.strokeRect(cx + (4 * actorScale), headCy - (7 * actorScale), 10 * actorScale, 7 * actorScale);
      } else if (currentModel === 'girl') {
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 3 * actorScale;
        ctx.beginPath();
        ctx.arc(cx - (headRadius + 2), headCy + (4 * actorScale), 8 * actorScale, 0, Math.PI);
        ctx.arc(cx + (headRadius + 2), headCy + (4 * actorScale), 8 * actorScale, 0, Math.PI);
        ctx.stroke();
      } else if (currentModel === 'business') {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(cx - 3, headCy + headRadius);
        ctx.lineTo(cx + 3, headCy + headRadius);
        ctx.lineTo(cx + 4, headCy + headRadius + 22);
        ctx.lineTo(cx, headCy + headRadius + 28);
        ctx.lineTo(cx - 4, headCy + headRadius + 22);
        ctx.closePath();
        ctx.fill();
      }

      // MoCap Joint Tracking Rigging or Procedural Kinematics
      const isMocap = (state.renderMode === 'mocap');
      const joints = (isMocap && currentBeat && currentBeat.pose_data && currentBeat.pose_data.joints) ? currentBeat.pose_data.joints : null;
      let usedMocapPose = false;

      if (joints && joints.l_shoulder && joints.r_shoulder) {
        const neckX = (joints.l_shoulder.x + joints.r_shoulder.x) / 2;
        const neckY = (joints.l_shoulder.y + joints.r_shoulder.y) / 2;
        const pelvisX = (joints.l_hip && joints.r_hip) ? (joints.l_hip.x + joints.r_hip.x) / 2 : neckX;
        const pelvisY = (joints.l_hip && joints.r_hip) ? (joints.l_hip.y + joints.r_hip.y) / 2 : neckY + 0.28;

        const toX = (normX) => cx + (normX - neckX) * 220 * actorScale * sign;
        const toY = (normY) => headCy + headRadius + (normY - neckY) * 220 * actorScale;

        // Draw Real Torso from tracking
        ctx.beginPath();
        ctx.moveTo(toX(neckX), toY(neckY));
        ctx.lineTo(toX(pelvisX), toY(pelvisY));
        ctx.lineWidth = 3.5 * actorScale;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Draw Real Left Arm
        ctx.beginPath();
        ctx.moveTo(toX(joints.l_shoulder.x), toY(joints.l_shoulder.y));
        if (joints.l_elbow) ctx.lineTo(toX(joints.l_elbow.x), toY(joints.l_elbow.y));
        if (joints.l_wrist) ctx.lineTo(toX(joints.l_wrist.x), toY(joints.l_wrist.y));
        ctx.stroke();

        // Draw Real Right Arm
        ctx.beginPath();
        ctx.moveTo(toX(joints.r_shoulder.x), toY(joints.r_shoulder.y));
        if (joints.r_elbow) ctx.lineTo(toX(joints.r_elbow.x), toY(joints.r_elbow.y));
        if (joints.r_wrist) ctx.lineTo(toX(joints.r_wrist.x), toY(joints.r_wrist.y));
        ctx.stroke();

        // Draw Real Legs
        if (joints.l_hip && joints.l_knee) {
          ctx.beginPath();
          ctx.moveTo(toX(joints.l_hip.x), toY(joints.l_hip.y));
          ctx.lineTo(toX(joints.l_knee.x), toY(joints.l_knee.y));
          if (joints.l_ankle) ctx.lineTo(toX(joints.l_ankle.x), toY(joints.l_ankle.y));
          ctx.stroke();
        }
        if (joints.r_hip && joints.r_knee) {
          ctx.beginPath();
          ctx.moveTo(toX(joints.r_hip.x), toY(joints.r_hip.y));
          ctx.lineTo(toX(joints.r_knee.x), toY(joints.r_knee.y));
          if (joints.r_ankle) ctx.lineTo(toX(joints.r_ankle.x), toY(joints.r_ankle.y));
          ctx.stroke();
        }

        const trackJoints = [joints.l_shoulder, joints.r_shoulder, joints.l_elbow, joints.r_elbow, joints.l_wrist, joints.r_wrist];
        ctx.fillStyle = accentColor || '#00e5ff';
        for (const j of trackJoints) {
          if (j && j.visibility > 0.4) {
            ctx.beginPath();
            ctx.arc(toX(j.x), toY(j.y), 3.5 * actorScale, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        usedMocapPose = true;
      }

      if (!usedMocapPose) {
        // Spine Torso (Standing vs Kneeling)
        ctx.beginPath();
        if (action === 'kneel_crying') {
          ctx.moveTo(cx, headCy + headRadius);
          ctx.lineTo(cx - (12 * sign * actorScale), cy + (15 * actorScale));
        } else {
          ctx.moveTo(cx, headCy + headRadius);
          ctx.lineTo(cx, cy);
        }
        ctx.lineWidth = 3.5 * actorScale;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Arms (Dramatic Narrative Acting & Procedural Kinematics)
        ctx.beginPath();
        const armSwing = speaking ? Math.sin(timeSec * 8 * bobRate) * 10 * exaggeration : 0;

        if (action === 'kneel_crying') {
          // Hands covering face weeping on knees
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (8 * sign * actorScale), headCy + (4 * actorScale));
          ctx.lineTo(cx - (2 * sign * actorScale), headCy);
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (8 * sign * actorScale), headCy + (4 * actorScale));
          ctx.lineTo(cx - (2 * sign * actorScale), headCy);

        } else if (action === 'holding_photo') {
          // Arms clutching precious memory photo to chest
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (15 * sign * actorScale), headCy + (28 * actorScale));
          ctx.lineTo(cx + (4 * sign * actorScale), headCy + (24 * actorScale));
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (15 * sign * actorScale), headCy + (28 * actorScale));
          ctx.lineTo(cx + (4 * sign * actorScale), headCy + (24 * actorScale));

        } else if (action === 'reaching_out') {
          // Pleading arm outstretched towards silhouette partner
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (45 * sign * actorScale), headCy + (10 * actorScale));
          ctx.lineTo(cx + (80 * sign * actorScale), headCy + (4 * actorScale));
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (25 * sign * actorScale), cy - (15 * actorScale));

        } else if (action === 'walking_cold') {
          // Shivering, arms wrapped tight around chest against rain
          const shiver = Math.sin(timeSec * 24) * 2;
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (18 * sign * actorScale) + shiver, headCy + (25 * actorScale));
          ctx.lineTo(cx + (12 * sign * actorScale), headCy + (22 * actorScale));
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (18 * sign * actorScale) - shiver, headCy + (25 * actorScale));
          ctx.lineTo(cx - (12 * sign * actorScale), headCy + (22 * actorScale));

        } else if (action === 'running_chase') {
          // Sprinting arm swing
          const sprintArm = Math.sin(timeSec * 16) * 32 * actorScale;
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - sprintArm * sign, cy - (15 * actorScale));
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + sprintArm * sign, cy - (15 * actorScale));

        } else if (action === 'peeking_heartbreak') {
          // Hand shielding brow in shock / disbelief
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (22 * sign * actorScale), headCy - (5 * actorScale));
          ctx.lineTo(cx + (8 * sign * actorScale), headCy - (14 * actorScale));
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (22 * sign * actorScale), cy - (10 * actorScale));

        } else if (action === 'cafe_reflecting') {
          // Chin propped on hand reflecting over coffee
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (24 * sign * actorScale), headCy + (28 * actorScale));
          ctx.lineTo(cx + (14 * sign * actorScale), headCy + (10 * actorScale));
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (20 * sign * actorScale), headCy + (30 * actorScale));
          ctx.lineTo(cx - (5 * sign * actorScale), headCy + (30 * actorScale));

        } else if (action === 'heartbreak_clutch') {
          // Hand clutching heart in sudden grief
          const tremble = Math.sin(timeSec * 20) * 1.5;
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (16 * sign * actorScale), headCy + (24 * actorScale));
          ctx.lineTo(cx - (5 * sign * actorScale), headCy + (20 * actorScale));
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (25 * sign * actorScale) + tremble, cy - (15 * actorScale));

        } else if (action === 'stargazing_rooftop') {
          // Arms relaxed backwards as gaze looks upward
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (32 * sign * actorScale), cy - (20 * actorScale));
          ctx.lineTo(cx - (20 * sign * actorScale), cy);
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (32 * sign * actorScale), cy - (20 * actorScale));
          ctx.lineTo(cx + (20 * sign * actorScale), cy);

        } else if (action === 'peaceful_sunrise') {
          // Open arms spreading wide in gentle acceptance
          const breath = Math.sin(timeSec * 3) * 5;
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (42 * sign * actorScale), headCy + (8 * actorScale) - breath);
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (42 * sign * actorScale), headCy + (8 * actorScale) - breath);

        } else if (action === 'point') {
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (40 * sign * actorScale), headCy + (10 * actorScale));
          ctx.lineTo(cx + (75 * sign * actorScale), headCy - (5 * actorScale));
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (25 * sign * actorScale), cy - (20 * actorScale));

        } else if (action === 'celebrate') {
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (35 * sign * actorScale), headCy - (30 * actorScale) + armSwing);
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (35 * sign * actorScale), headCy - (30 * actorScale) - armSwing);

        } else if (action === 'think') {
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (25 * sign * actorScale), headCy);
          ctx.lineTo(cx + (10 * sign * actorScale), headCy + (12 * actorScale));
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (25 * sign * actorScale), cy - (20 * actorScale));

        } else if (action === 'shrug') {
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (30 * sign * actorScale), cy - (20 * actorScale));
          ctx.lineTo(cx - (45 * sign * actorScale), headCy);
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (30 * sign * actorScale), cy - (20 * actorScale));
          ctx.lineTo(cx + (45 * sign * actorScale), headCy);

        } else if (action === 'run') {
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (40 * sign * actorScale), headCy + (15 * actorScale));
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (40 * sign * actorScale), cy - (15 * actorScale));

        } else if (action === 'read') {
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (15 * sign * actorScale), headCy + (25 * actorScale));
          ctx.lineTo(cx, headCy + (15 * actorScale));
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (15 * sign * actorScale), headCy + (25 * actorScale));
          ctx.lineTo(cx, headCy + (15 * actorScale));

        } else if (action === 'angry') {
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (30 * sign * actorScale), cy - (25 * actorScale));
          ctx.lineTo(cx - (10 * sign * actorScale), cy - (15 * actorScale));
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (30 * sign * actorScale), cy - (25 * actorScale));
          ctx.lineTo(cx + (10 * sign * actorScale), cy - (15 * actorScale));

        } else {
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx - (30 * sign * actorScale), cy - (30 * actorScale) + armSwing);
          ctx.moveTo(cx, headCy + headRadius + 10);
          ctx.lineTo(cx + (30 * sign * actorScale), cy - (30 * actorScale) - armSwing);
        }
        ctx.stroke();

        // Legs (Standing vs Kneeling vs Running)
        ctx.beginPath();
        if (action === 'kneel_crying') {
          ctx.moveTo(cx - (12 * sign * actorScale), cy + (15 * actorScale));
          ctx.lineTo(cx + (14 * sign * actorScale), cy + (35 * actorScale));
          ctx.lineTo(cx - (20 * sign * actorScale), cy + (38 * actorScale));
        } else if (action === 'run' || action === 'running_chase') {
          const sprintLeg = Math.sin(timeSec * 16) * 35 * actorScale;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx - sprintLeg, cy + (65 * actorScale));
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + sprintLeg, cy + (75 * actorScale));
        } else if (action === 'walking_cold') {
          const walkLeg = Math.sin(timeSec * 4) * 16 * actorScale;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx - (15 * actorScale) + walkLeg, cy + (75 * actorScale));
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + (15 * actorScale) - walkLeg, cy + (75 * actorScale));
        } else {
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx - (20 * actorScale), cy + (75 * actorScale));
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + (20 * actorScale), cy + (75 * actorScale));
        }
        ctx.stroke();
      }

      // Prop Emoji Rendering (Standard & Narrative MV Props)
      if (propName) {
        const propEmojiMap = {
          dna: '🧬', bone: '🦴', skeleton: '🦴', quiz: '📋', target: '🎯',
          book: '📖', flashcard: '📖', brain: '🧠', bulb: '💡', phone: '📱',
          coffee: '☕', sunglasses: '🕶️', chart_up: '📈', chart_down: '📉',
          money_bag: '💰', shopping_cart: '🛒', alert: '⚠️', question: '❓',
          heart: '❤️', broken_heart: '💔', clock: '⏰', battery: '🔋',
          scale: '⚖️', lock: '🔒', eyes: '👀', house: '🏠', people: '👥',
          mask: '🎭', photo_frame: '🖼️', umbrella: '☂️', fading_silhouette: '👤',
          speedlines: '💨', couple_silhouette: '👥', coffee_steam: '☕',
          shooting_star: '🌠', sunrise_rays: '🌅'
        };
        const emoji = propEmojiMap[propName] || '💡';
        ctx.font = `${Math.floor(22 * actorScale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const propX = cx + (42 * sign * actorScale);
        const propY = headCy - (5 * actorScale);
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
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bX, bY, shoutW, 22);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(bX, bY, shoutW, 22);
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.fillText(shout, bX + shoutW / 2, bY + 15);
      }

      ctx.restore();
    }

    // Glowing Memory Silhouette Renderer
    function drawCanvasSilhouette(sx, sy, scale, flipped) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = '#c084fc';
      ctx.fillStyle = '#1e1b4b';

      const actorScale = scale * 0.95;
      const headRadius = 24 * actorScale;
      const headBob = Math.sin(timeSec * 4) * 2;
      const headCy = sy - (110 * actorScale) + headBob;

      // Ethereal glowing head
      ctx.beginPath();
      ctx.arc(sx, headCy, headRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.5 * actorScale;
      ctx.stroke();

      // Soft eyes
      ctx.fillStyle = '#e9d5ff';
      ctx.beginPath();
      ctx.arc(sx - (7 * actorScale), headCy - (2 * actorScale), 2 * actorScale, 0, Math.PI * 2);
      ctx.arc(sx + (7 * actorScale), headCy - (2 * actorScale), 2 * actorScale, 0, Math.PI * 2);
      ctx.fill();

      // Spine
      ctx.beginPath();
      ctx.moveTo(sx, headCy + headRadius);
      ctx.lineTo(sx, sy);
      ctx.lineWidth = 3 * actorScale;
      ctx.stroke();

      // Arms in drifting gesture
      const drift = Math.sin(timeSec * 3) * 8;
      ctx.beginPath();
      ctx.moveTo(sx, headCy + headRadius + 10);
      ctx.lineTo(sx - (25 * actorScale), sy - (25 * actorScale) + drift);
      ctx.moveTo(sx, headCy + headRadius + 10);
      ctx.lineTo(sx + (25 * actorScale), sy - (25 * actorScale) - drift);
      ctx.stroke();

      // Legs
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - (16 * actorScale), sy + (70 * actorScale));
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (16 * actorScale), sy + (70 * actorScale));
      ctx.stroke();

      // Rising memory dust particles
      ctx.fillStyle = '#a855f7';
      for (let i = 0; i < 6; i++) {
        const pOffset = ((timeSec * 40 + i * 35) % 120);
        const pX = sx + Math.sin(timeSec * 2 + i) * 30;
        const pY = sy + (60 * actorScale) - pOffset;
        const pAlpha = Math.max(0, 1 - (pOffset / 120)) * 0.5;
        ctx.globalAlpha = pAlpha;
        ctx.beginPath();
        ctx.arc(pX, pY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Memory Badge
      ctx.globalAlpha = 0.75;
      ctx.font = 'bold 8px monospace';
      const badge = 'FADING MEMORY';
      const bw = ctx.measureText(badge).width + 10;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(sx - bw / 2, headCy - headRadius - 18, bw, 12);
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - bw / 2, headCy - headRadius - 18, bw, 12);
      ctx.fillStyle = '#c084fc';
      ctx.textAlign = 'center';
      ctx.fillText(badge, sx, headCy - headRadius - 9);

      ctx.restore();
    }

    // Dynamic Staging Coordinate Layout
    let baseCy, baseScale, deskScale;

    if (isLandscape) {
      if (isSplitPip) {
        baseCy = Math.round(canvas.height * 0.76);
        baseScale = 0.72;
        deskScale = 0.68;
      } else {
        baseCy = Math.round(canvas.height * 0.75);
        baseScale = 0.88;
        deskScale = 0.82;
      }
    } else {
      if (isSplitPip) {
        baseCy = 505;
        baseScale = 0.72;
        deskScale = 0.68;
      } else {
        baseCy = 400;
        baseScale = 1.05;
        deskScale = 0.95;
      }
    }

    // Determine Staging Mode (Music MV Narrative vs Dialogue vs Solo)
    const isMusicNarrative = (state.stagingStyle === 'music_narrative_story') || (currentBeat && currentBeat.domain === 'music_narrative_story');
    const hasSilhouetteActor = currentBeat && (
      currentBeat.prop === 'fading_silhouette' ||
      (currentBeat.actors && currentBeat.actors.some(a => a.label?.includes('MEMORY') || a.is_silhouette)) ||
      ['holding_photo', 'reaching_out', 'stargazing_rooftop', 'heartbreak_clutch', 'kneel_crying'].includes(currentBeat.pose)
    );

    if (isMusicNarrative && hasSilhouetteActor) {
      // Narrative Flashback: Sticky (Protagonist) + Ethereal Glowing Memory Silhouette
      const pose = currentBeat ? currentBeat.pose : 'kneel_crying';
      const emotion = currentBeat ? currentBeat.emotion : 'sad';
      const prop = currentBeat ? currentBeat.prop : 'fading_silhouette';
      const accent = (currentBeat && currentBeat.accent) || '#00e5ff';
      const shout = currentBeat ? currentBeat.comic_shout : null;

      let stickyX, silhX;
      if (isLandscape) {
        if (isSplitPip) {
          stickyX = stickX + Math.round(stickW * 0.32);
          silhX = stickX + Math.round(stickW * 0.75);
        } else {
          stickyX = Math.round(canvas.width * 0.30);
          silhX = Math.round(canvas.width * 0.72);
        }
      } else {
        if (isSplitPip) {
          stickyX = 110;
          silhX = 250;
        } else {
          stickyX = 110;
          silhX = 250;
        }
      }

      drawStickActor(stickyX, baseCy, baseScale, false, pose, emotion, prop, 'STICKY', shout, true, accent);
      drawCanvasSilhouette(silhX, baseCy, baseScale * 0.95, true);

    } else if ((actors && actors.length >= 2) || state.stagingStyle === 'podcast_desk') {
      // 2-Character Dialogue Setup (Left vs Right)
      const a1 = actors && actors[0] ? actors[0] : { action: 'talk', emotion: 'neutral', prop: null, label: 'HOST', speaking: true, accent_color: [255, 215, 0] };
      const a2 = actors && actors[1] ? actors[1] : { action: 'listen', emotion: 'neutral', prop: null, label: 'CO-HOST', speaking: false, accent_color: [0, 229, 255] };
      const a1Color = a1.accent_color ? (Array.isArray(a1.accent_color) ? `rgb(${a1.accent_color.join(',')})` : a1.accent_color) : '#ffd700';
      const a2Color = a2.accent_color ? (Array.isArray(a2.accent_color) ? `rgb(${a2.accent_color.join(',')})` : a2.accent_color) : '#00e5ff';

      let leftX, rightX;
      if (isLandscape) {
        if (isSplitPip) {
          leftX = stickX + Math.round(stickW * 0.30);
          rightX = stickX + Math.round(stickW * 0.75);
        } else {
          leftX = Math.round(canvas.width * 0.30);
          rightX = Math.round(canvas.width * 0.72);
        }
      } else {
        leftX = 105;
        rightX = 255;
      }

      drawStickActor(leftX, baseCy, deskScale, false, a1.action || 'talk', a1.emotion || 'neutral', a1.prop, a1.label || 'HOST', a1.comic_shout, a1.speaking, a1Color);
      if (a2.is_silhouette || (a2.label && a2.label.includes('MEMORY'))) {
        drawCanvasSilhouette(rightX, baseCy, deskScale, true);
      } else {
        drawStickActor(rightX, baseCy, deskScale, true, a2.action || 'listen', a2.emotion || 'neutral', a2.prop, a2.label || 'CO-HOST', a2.comic_shout, a2.speaking, a2Color);
      }

    } else {
      // Solo Staging
      const pose = currentBeat ? currentBeat.pose : 'talk';
      const emotion = currentBeat ? currentBeat.emotion : 'neutral';
      const prop = currentBeat ? currentBeat.prop : 'bulb';
      const accent = (currentBeat && currentBeat.accent) || '#00e5ff';
      const shout = currentBeat ? currentBeat.comic_shout : null;

      let actorX = canvas.width / 2;
      if (isSplitPip) {
        actorX = stickX + stickW / 2;
      }
      drawStickActor(actorX, baseCy, baseScale, false, pose, emotion, prop, 'STICKY', shout, true, accent);
    }

    // 3. Subtitle Overlay
    if (currentBeat && currentBeat.text) {
      subtitleOverlay.textContent = currentBeat.text;
      subtitleOverlay.style.display = 'block';
      subtitleOverlay.style.bottom = isSplitPip ? '12px' : '20px';
    } else {
      subtitleOverlay.style.display = 'none';
    }
  }

  // Dynamic Real-Time FPS Measurement
  let frameCount = 0;
  let lastFpsTime = performance.now();
  const fpsBadge = document.getElementById('fpsBadge');

  // Animation Loop Tick
  function animationTick() {
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 500) {
      const liveFps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      if (fpsBadge) fpsBadge.textContent = `${liveFps} FPS`;
      frameCount = 0;
      lastFpsTime = now;
    }

    if (state.isPlaying) {
      if (state.audioContext && state.audioBuffer) {
        state.currentTime = state.audioContext.currentTime - state.startTime;
      } else {
        state.currentTime = (performance.now() / 1000) - state.startTime;
      }

      if (state.previewVideo && Math.abs(state.previewVideo.currentTime - state.currentTime) > 0.3) {
        try { state.previewVideo.currentTime = state.currentTime; } catch (_) {}
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

    // Synchronously hydrate from window.__INITIAL_BEATS__ if present
    if ((!state.storyboardParts || state.storyboardParts.length === 0) && typeof window !== 'undefined' && window.__INITIAL_BEATS__ && Array.isArray(window.__INITIAL_BEATS__) && window.__INITIAL_BEATS__.length > 0) {
      state.storyboardParts = window.__INITIAL_BEATS__;
      state.activePartIndex = 0;
    }

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

    if (typeof part.start === 'number') {
      state.currentTime = part.start;
      if (state.previewVideo) {
        try { state.previewVideo.currentTime = part.start; } catch (_) {}
      }
      updateTimelineDisplay();
    }

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

    // Update Background Inspector UI
    updateBackgroundUI(part);

    // Refresh Instant Part Preview Frame
    fetchPartPreview(part);
    renderStickman();
  }

  // Update Background Inspector UI Elements
  function updateBackgroundUI(part) {
    if (!part) return;
    const activeBgThumb = document.getElementById('activeBgThumb');
    const activeBgPlaceholder = document.getElementById('activeBgPlaceholder');
    const activeBgTitle = document.getElementById('activeBgTitle');
    const activeBgSubtitle = document.getElementById('activeBgSubtitle');
    const bgStatusBadge = document.getElementById('bgStatusBadge');

    const customBg = part.background_image || part.background_url || part.background_path;
    if (customBg) {
      const bgFilename = customBg.split('/').pop();
      const thumbUrl = customBg.startsWith('/api/') ? api(customBg) : (customBg.startsWith('http') ? customBg : api('/api/backgrounds/' + bgFilename));
      if (activeBgThumb) {
        activeBgThumb.src = thumbUrl;
        activeBgThumb.style.display = 'block';
      }
      if (activeBgPlaceholder) activeBgPlaceholder.style.display = 'none';
      if (activeBgTitle) activeBgTitle.textContent = part.background_prompt || bgFilename;
      if (activeBgSubtitle) activeBgSubtitle.textContent = part.background_method || 'AI Generated Scene';
      if (bgStatusBadge) bgStatusBadge.textContent = 'AI SCENE';
    } else {
      if (activeBgThumb) activeBgThumb.style.display = 'none';
      if (activeBgPlaceholder) activeBgPlaceholder.style.display = 'block';
      if (activeBgTitle) activeBgTitle.textContent = 'Default Podcast Studio';
      if (activeBgSubtitle) activeBgSubtitle.textContent = 'Procedural Acoustic Neon';
      if (bgStatusBadge) bgStatusBadge.textContent = 'STICK HUB 2D';
    }
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
      const isLandscape = (state.aspectRatio === '16:9');
      const offW = isLandscape ? 320 : 180;
      const offH = isLandscape ? 180 : 320;
      const offscreen = document.createElement('canvas');
      offscreen.width = offW;
      offscreen.height = offH;
      const oCtx = offscreen.getContext('2d');

      oCtx.fillStyle = state.colors.bg || '#11141c';
      oCtx.fillRect(0, 0, offW, offH);

      const floorY = isLandscape ? 138 : 260;

      // Draw Custom Background if present
      const customBg = part.background_image || part.background_url || part.background_path;
      if (customBg && state._bgImgCache && state._bgImgCache[customBg] && state._bgImgCache[customBg].complete) {
        oCtx.drawImage(state._bgImgCache[customBg], 0, 0, offW, floorY);
        oCtx.fillStyle = 'rgba(10, 15, 25, 0.4)';
        oCtx.fillRect(0, 0, offW, floorY);
      }

      oCtx.strokeStyle = '#222836';
      oCtx.lineWidth = 1;
      oCtx.beginPath();
      oCtx.moveTo(0, floorY);
      oCtx.lineTo(offW, floorY);
      oCtx.stroke();

      const accent = part.accent || state.colors.glow || '#00e5ff';
      const stick = state.colors.stick || '#ffffff';
      const cx = isLandscape ? Math.round(offW * 0.48) : 90;
      const cy = isLandscape ? 90 : 150;
      const scale = isLandscape ? 0.72 : 1.0;

      oCtx.save();
      oCtx.shadowColor = accent;
      oCtx.shadowBlur = 10;

      // Head
      oCtx.beginPath();
      oCtx.arc(cx, cy - (40 * scale), 20 * scale, 0, Math.PI * 2);
      oCtx.fillStyle = '#161b26';
      oCtx.fill();
      oCtx.lineWidth = 3 * scale;
      oCtx.strokeStyle = stick;
      oCtx.stroke();

      // Eyes
      oCtx.fillStyle = '#11141c';
      oCtx.beginPath();
      oCtx.arc(cx - (7 * scale), cy - (42 * scale), 3 * scale, 0, Math.PI * 2);
      oCtx.arc(cx + (7 * scale), cy - (42 * scale), 3 * scale, 0, Math.PI * 2);
      oCtx.fill();

      // Mouth
      oCtx.strokeStyle = stick;
      oCtx.lineWidth = 2 * scale;
      oCtx.beginPath();
      if (part.emotion === 'happy' || part.pose === 'peaceful_sunrise') {
        oCtx.arc(cx, cy - (38 * scale), 7 * scale, 0, Math.PI);
      } else if (part.emotion === 'surprised') {
        oCtx.arc(cx, cy - (35 * scale), 5 * scale, 0, Math.PI * 2);
      } else if (part.emotion === 'angry') {
        oCtx.moveTo(cx - (7 * scale), cy - (33 * scale));
        oCtx.lineTo(cx + (7 * scale), cy - (37 * scale));
      } else if (part.emotion === 'sad' || part.pose === 'kneel_crying') {
        oCtx.arc(cx, cy - (32 * scale), 6 * scale, Math.PI, 0);
      } else {
        oCtx.moveTo(cx - (7 * scale), cy - (35 * scale));
        oCtx.lineTo(cx + (7 * scale), cy - (35 * scale));
      }
      oCtx.stroke();

      // Body Spine
      oCtx.beginPath();
      oCtx.moveTo(cx, cy - (20 * scale));
      oCtx.lineTo(cx, cy + (40 * scale));
      oCtx.stroke();

      // Arms
      oCtx.beginPath();
      if (part.pose === 'talk') {
        oCtx.moveTo(cx, cy - (10 * scale));
        oCtx.lineTo(cx - (24 * scale), cy - (5 * scale));
        oCtx.lineTo(cx - (32 * scale), cy - (22 * scale));
        oCtx.moveTo(cx, cy - (10 * scale));
        oCtx.lineTo(cx + (24 * scale), cy + (10 * scale));
        oCtx.lineTo(cx + (28 * scale), cy + (30 * scale));
      } else if (part.pose === 'point') {
        oCtx.moveTo(cx, cy - (10 * scale));
        oCtx.lineTo(cx + (30 * scale), cy - (20 * scale));
        oCtx.lineTo(cx + (45 * scale), cy - (25 * scale));
        oCtx.moveTo(cx, cy - (10 * scale));
        oCtx.lineTo(cx - (20 * scale), cy + (15 * scale));
      } else if (part.pose === 'kneel_crying') {
        oCtx.moveTo(cx, cy - (10 * scale));
        oCtx.lineTo(cx - (8 * scale), cy - (35 * scale));
        oCtx.moveTo(cx, cy - (10 * scale));
        oCtx.lineTo(cx + (8 * scale), cy - (35 * scale));
      } else if (part.pose === 'holding_photo' || part.pose === 'heartbreak_clutch') {
        oCtx.moveTo(cx, cy - (10 * scale));
        oCtx.lineTo(cx - (15 * scale), cy + (10 * scale));
        oCtx.lineTo(cx + (4 * scale), cy + (8 * scale));
        oCtx.moveTo(cx, cy - (10 * scale));
        oCtx.lineTo(cx + (15 * scale), cy + (10 * scale));
        oCtx.lineTo(cx + (4 * scale), cy + (8 * scale));
      } else if (part.pose === 'reaching_out') {
        oCtx.moveTo(cx, cy - (10 * scale));
        oCtx.lineTo(cx + (40 * scale), cy - (15 * scale));
        oCtx.lineTo(cx + (60 * scale), cy - (18 * scale));
        oCtx.moveTo(cx, cy - (10 * scale));
        oCtx.lineTo(cx - (20 * scale), cy + (15 * scale));
      } else {
        oCtx.moveTo(cx, cy - (10 * scale));
        oCtx.lineTo(cx - (25 * scale), cy + (15 * scale));
        oCtx.moveTo(cx, cy - (10 * scale));
        oCtx.lineTo(cx + (25 * scale), cy + (15 * scale));
      }
      oCtx.stroke();

      // Legs
      oCtx.beginPath();
      if (part.pose === 'kneel_crying') {
        oCtx.moveTo(cx, cy + (40 * scale));
        oCtx.lineTo(cx + (16 * scale), cy + (50 * scale));
        oCtx.lineTo(cx - (16 * scale), cy + (52 * scale));
      } else {
        oCtx.moveTo(cx, cy + (40 * scale));
        oCtx.lineTo(cx - (18 * scale), cy + (95 * scale));
        oCtx.moveTo(cx, cy + (40 * scale));
        oCtx.lineTo(cx + (18 * scale), cy + (95 * scale));
      }
      oCtx.stroke();

      // Prop Emoji
      const propEmojiMap = {
        bulb: '💡', question: '❓', chart_up: '📈', chart_down: '📉',
        alert: '⚠️', brain: '🧠', heart: '❤️', broken_heart: '💔',
        clock: '⏰', phone: '📱', target: '🎯', battery: '🔋',
        scale: '⚖️', lock: '🔒', eyes: '👀', book: '📖',
        house: '🏠', people: '👥', mask: '🎭', bell: '🔔', fire: '🔥',
        photo_frame: '🖼️', umbrella: '☂️', fading_silhouette: '👤',
        speedlines: '💨', couple_silhouette: '👥', coffee_steam: '☕',
        shooting_star: '🌠', sunrise_rays: '🌅'
      };
      const emoji = propEmojiMap[part.prop] || '💡';
      oCtx.font = `${Math.floor(20 * scale)}px sans-serif`;
      oCtx.textAlign = 'center';
      oCtx.textBaseline = 'middle';
      oCtx.fillText(emoji, cx + (32 * scale), cy - (25 * scale));

      oCtx.restore();

      // Model & Pose Badge
      oCtx.font = 'bold 10px monospace';
      oCtx.textAlign = 'center';
      oCtx.fillStyle = accent;
      oCtx.fillText(`${(part.model || 'CLASSIC')} [${(part.pose || 'TALK')}]`.toUpperCase(), cx, isLandscape ? (offH - 8) : 305);

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
        const modeMap = {
          mocap: 'MOCAP',
          split_pip: 'SPLIT-PIP',
          full_stickman: 'FULL 2D'
        };
        activeModeBadge.textContent = modeMap[state.renderMode] || state.renderMode.toUpperCase();
      }
      systemStatusText.textContent = `Render Mode: ${state.renderMode}`;
      renderStickman();
    });
  }

  const canvasFrame = document.querySelector('.fl-canvas-frame');

  function applyAspectRatio(ratio) {
    state.aspectRatio = ratio || '9:16';
    const isLandscape = (state.aspectRatio === '16:9');

    if (canvasFrame) {
      if (isLandscape) {
        canvasFrame.classList.remove('ratio-9-16');
        canvasFrame.classList.add('ratio-16-9');
        canvasFrame.style.width = '640px';
        canvasFrame.style.height = '360px';
      } else {
        canvasFrame.classList.remove('ratio-16-9');
        canvasFrame.classList.add('ratio-9-16');
        canvasFrame.style.width = '360px';
        canvasFrame.style.height = '640px';
      }
    }

    if (canvas) {
      canvas.width = isLandscape ? 640 : 360;
      canvas.height = isLandscape ? 360 : 640;
    }

    if (viewportRatioLabel) {
      viewportRatioLabel.textContent = isLandscape ? 'VIEWPORT: 16:9 (1280x720)' : 'VIEWPORT: 9:16 (720x1280)';
    }
    if (exportBtnLabel) {
      exportBtnLabel.textContent = isLandscape ? '⚡ Export Video (16:9)' : '⚡ Export Short (9:16)';
    }
    if (selectAspectRatio && selectAspectRatio.value !== state.aspectRatio) {
      selectAspectRatio.value = state.aspectRatio;
    }

    if (systemStatusText) {
      systemStatusText.textContent = `Viewport: ${state.aspectRatio}`;
    }

    renderStickman();
    if (state.storyboardParts && state.storyboardParts[state.activePartIndex]) {
      fetchPartPreview(state.storyboardParts[state.activePartIndex]);
    }
  }

  if (selectAspectRatio) {
    selectAspectRatio.addEventListener('change', (e) => {
      applyAspectRatio(e.target.value);
    });
  }

  if (selectStagingStyle) {
    selectStagingStyle.addEventListener('change', (e) => {
      state.stagingStyle = e.target.value;
      const stagingNames = {
        music_narrative_story: '🎵 Music MV Narrative (Lyric Acting & Glowing Silhouette)',
        stick_hub_storyteller: '🎭 Stick Hub Storyteller (Solo Full Body)',
        podcast_desk: '🎙️ Dual-Host Podcast Desk'
      };
      systemStatusText.textContent = `Staging: ${stagingNames[state.stagingStyle] || state.stagingStyle}`;
      renderStickman();
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

  // Inject Prompt into Flowork OS Chat (Standard Dual-Wing Architecture)
  function injectAgentPrompt(promptText) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'FLOWORK_PROMPT_DISPATCH',
        prompt: promptText,
        autoSend: true
      }, '*');
    } else {
      console.log('[Stickman Studio] Local prompt dispatch:', promptText);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(promptText).catch(() => {});
      }
      showFeedbackNotice('Copied director prompt to clipboard for Agent Chat!', 'success');
    }
  }

  const btnGenerateStickyBeat = document.getElementById('btnGenerateStickyBeat');
  if (btnGenerateStickyBeat) {
    btnGenerateStickyBeat.addEventListener('click', () => {
      const part = state.storyboardParts[state.activePartIndex];
      if (!part) {
        showFeedbackNotice('No beat selected to generate.', 'warning');
        return;
      }
      const idx = state.activePartIndex + 1;
      const poseDesc = part.pose_data?.has_pose ? 'Tracked Pose (33 skeletal landmarks detected)' : (part.pose_data?.screen_type || 'Graphic Slide / Screen');
      const prompt = `[STICKMAN STUDIO DIRECTOR] 🎬🎨 Complete Stickman choreography for Beat #${idx} (${part.start}s - ${part.end}s)!
Dialogue: "${part.text || '[Music / Ambience]'}"
Visual Modality: ${poseDesc}
3D Vault Reference: Utilize 3D models (system/library) where relevant.
Dr. Flow, please redraw and choreograph this character scene with life-like precision and expressive kinematics!`;
      injectAgentPrompt(prompt);
      showFeedbackNotice(`Dispatched Beat #${idx} to Agent Chat!`, 'success');
      if (systemStatusText) systemStatusText.textContent = `Prompt for Beat #${idx} injected to Chat`;
    });
  }

  const btnGenerateAllSticky = document.getElementById('btnGenerateAllSticky');
  if (btnGenerateAllSticky) {
    btnGenerateAllSticky.addEventListener('click', () => {
      if (!state.storyboardParts || state.storyboardParts.length === 0) {
        showFeedbackNotice('No storyboard beats loaded. Drop or import a video first.', 'warning');
        return;
      }
      const count = state.storyboardParts.length;
      const prompt = `[STICKMAN STUDIO DIRECTOR] 🎬🚀 BATCH GENERATE ALL STICKY BEATS (${count} Beats)!
Total Duration: ${state.audioDuration ? state.audioDuration.toFixed(1) + 's' : 'Video'}.
Instructions: Redraw all ${count} storyboard beats dynamically without static templates. Adapt every 3-second segment to dialogue nuances, tracked poses, and 3D vault assets. Render 100% dynamic stickman choreography!`;
      injectAgentPrompt(prompt);
      showFeedbackNotice(`Dispatched all ${count} beats to Agent Chat!`, 'success');
      if (systemStatusText) systemStatusText.textContent = `Batch prompt (${count} beats) injected to Chat`;
    });
  }

  // -------------------------------------------------------------
  // AI Cartoon Scene Background Generator Integration
  // -------------------------------------------------------------
  const btnGenerateAiBg = document.getElementById('btnGenerateAiBg');
  const btnAiBgText = document.getElementById('btnAiBgText');
  const btnAiBgIcon = document.getElementById('btnAiBgIcon');
  const aiBgPromptInput = document.getElementById('aiBgPromptInput');
  const checkApplyBgToAll = document.getElementById('checkApplyBgToAll');
  const btnResetBackground = document.getElementById('btnResetBackground');

  if (btnGenerateAiBg) {
    btnGenerateAiBg.addEventListener('click', async () => {
      const part = state.storyboardParts[state.activePartIndex];
      if (!part) {
        showFeedbackNotice('Select a beat first before generating background.', 'warning');
        return;
      }

      const promptText = (aiBgPromptInput && aiBgPromptInput.value.trim()) || 'modern cartoon recording studio interior';
      const theme = aiBgPromptInput ? (aiBgPromptInput.dataset.theme || '') : '';

      if (btnAiBgText) btnAiBgText.textContent = 'Generating Scene...';
      if (btnAiBgIcon) btnAiBgIcon.textContent = '⏳';
      btnGenerateAiBg.disabled = true;

      try {
        const res = await fetch(api('/api/backgrounds/generate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: promptText, theme })
        });
        const data = await res.json();
        if (data.success && data.background_path) {
          part.background_image = data.background_path;
          part.background_url = data.background_url;
          part.background_prompt = promptText;
          part.background_method = data.method === 'pollinations_neural' ? 'Neural AI (Flux)' : 'Procedural Vector';

          if (checkApplyBgToAll && checkApplyBgToAll.checked) {
            state.storyboardParts.forEach(p => {
              p.background_image = data.background_path;
              p.background_url = data.background_url;
              p.background_prompt = promptText;
              p.background_method = part.background_method;
            });
            showFeedbackNotice(`AI Background applied to all ${state.storyboardParts.length} beats!`, 'success');
          } else {
            showFeedbackNotice(`Generated AI Background for Beat #${state.activePartIndex + 1}!`, 'success');
          }

          updateBackgroundUI(part);
          renderStoryboardCards();
          fetchPartPreview(part);
          renderStickman();
        } else {
          showFeedbackNotice(`Failed to generate background: ${data.error || 'Unknown error'}`, 'warning');
        }
      } catch (err) {
        console.error('[Generate AI Background Error]', err);
        showFeedbackNotice('Background generation failed. Check server connection.', 'warning');
      } finally {
        if (btnAiBgText) btnAiBgText.textContent = 'Generate AI Background';
        if (btnAiBgIcon) btnAiBgIcon.textContent = '🎨';
        btnGenerateAiBg.disabled = false;
      }
    });
  }

  // Quick Scene Presets Buttons
  document.querySelectorAll('.fl-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-prompt') || '';
      const th = btn.getAttribute('data-theme') || '';
      if (aiBgPromptInput) {
        aiBgPromptInput.value = p;
        aiBgPromptInput.dataset.theme = th;
      }
      if (btnGenerateAiBg) {
        btnGenerateAiBg.click();
      }
    });
  });

  if (btnResetBackground) {
    btnResetBackground.addEventListener('click', () => {
      const part = state.storyboardParts[state.activePartIndex];
      if (part) {
        delete part.background_image;
        delete part.background_url;
        delete part.background_prompt;
        delete part.background_method;
        if (checkApplyBgToAll && checkApplyBgToAll.checked) {
          state.storyboardParts.forEach(p => {
            delete p.background_image;
            delete p.background_url;
            delete p.background_prompt;
            delete p.background_method;
          });
          showFeedbackNotice('Reset all beats to default studio.', 'info');
        } else {
          showFeedbackNotice(`Reset Beat #${state.activePartIndex + 1} to default studio.`, 'info');
        }
        updateBackgroundUI(part);
        renderStoryboardCards();
        fetchPartPreview(part);
        renderStickman();
      }
    });
  }

  // Custom Background Direct Upload
  const btnUploadCustomBg = document.getElementById('btnUploadCustomBg');
  const bgFileInput = document.getElementById('bgFileInput');
  if (btnUploadCustomBg && bgFileInput) {
    btnUploadCustomBg.addEventListener('click', () => bgFileInput.click());
    bgFileInput.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        showFeedbackNotice('Uploading custom background...', 'info');
        try {
          const res = await fetch(api(`/api/backgrounds/upload?filename=${encodeURIComponent(file.name)}`), {
            method: 'POST',
            headers: { 'Content-Type': file.type || 'image/jpeg' },
            body: file
          });
          const data = await res.json();
          if (data.success) {
            state.customBackgroundPath = data.background_path;
            state.customBackgroundUrl = data.background_url;
            const activePart = state.storyboardParts[state.activePartIndex] || {};
            activePart.background_image = data.background_path;
            activePart.background_url = data.background_url;
            activePart.background_prompt = `Uploaded: ${file.name}`;

            if (state.storyboardParts && state.storyboardParts.length > 0) {
              state.storyboardParts.forEach(p => {
                p.background_image = data.background_path;
                p.background_url = data.background_url;
                p.background_prompt = `Uploaded: ${file.name}`;
              });
            } else {
              state.storyboardParts = [activePart];
            }

            updateBackgroundUI(activePart);
            showFeedbackNotice('Custom background uploaded & applied to all scenes!', 'success');
            renderStickman();
          }
        } catch (err) {
          showFeedbackNotice('Failed to upload background: ' + err.message, 'error');
        }
      }
    });
  }

  // MoCap Framing Mode
  const selectFramingMode = document.getElementById('selectFramingMode');
  if (selectFramingMode) {
    selectFramingMode.addEventListener('change', (e) => {
      state.framingMode = e.target.value;
      if (systemStatusText) systemStatusText.textContent = `Framing: ${state.framingMode}`;
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

  // Reset Pose Kinematics
  if (btnResetPose) {
    btnResetPose.addEventListener('click', () => {
      state.kinematics = { gestureExaggeration: 1.2, headBobRate: 1.0, mouthThreshold: 0.3 };
      renderStickman();
      showFeedbackNotice('Kinematics pose & bobbing reset to defaults', 'info');
    });
  }

  // Live Transcript Input Synchronization
  if (transcriptInput) {
    transcriptInput.addEventListener('input', () => {
      state.transcript = transcriptInput.value;
      const part = state.storyboardParts[state.activePartIndex];
      if (part) {
        part.text = transcriptInput.value;
        renderStoryboardCards();
      }
      if (subtitleOverlay) {
        subtitleOverlay.textContent = transcriptInput.value;
        subtitleOverlay.style.display = transcriptInput.value.trim() ? 'block' : 'none';
      }
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
      if (state.previewVideo) {
        try { state.previewVideo.currentTime = state.currentTime; } catch (_) {}
      }
      if (state.isPlaying) {
        playAudio();
      } else {
        updateTimelineDisplay();
        renderStickman();
      }
    });
  }

  // Voice FX Apply Button (Fully Connected to /api/voice/transform)
  if (btnTransformVoice) {
    btnTransformVoice.addEventListener('click', async () => {
      const inputMedia = state.currentAudioServerPath || state.videoPath;
      if (!inputMedia) {
        showFeedbackNotice('No video or audio file loaded to transform voice.', 'warning');
        return;
      }
      const originalHtml = btnTransformVoice.innerHTML;
      btnTransformVoice.innerHTML = '<span>⏳ Applying Voice FX...</span>';
      btnTransformVoice.disabled = true;
      systemStatusText.textContent = `Applying ${state.selectedProfile} Voice FX via FFmpeg DSP...`;

      try {
        const res = await fetch(api('/api/voice/transform'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_path: inputMedia,
            profile: state.selectedProfile,
            custom_pitch: pitchSlider ? parseFloat(pitchSlider.value) : 1.45,
            custom_speed: speedSlider ? parseFloat(speedSlider.value) : 1.05
          })
        });
        const data = await res.json();
        if (data.success && (data.output || data.output_path)) {
          const outPath = data.output || data.output_path;
          state.currentAudioServerPath = outPath;
          const audioUrl = data.output_url || `/exports/${outPath.split('/').pop()}`;

          // Immediately reload and decode transformed audio into Web Audio API
          try {
            const audioRes = await fetch(api(audioUrl));
            if (audioRes.ok) {
              const arrayBuffer = await audioRes.arrayBuffer();
              initAudioContext();
              state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
              state.audioDuration = state.audioBuffer.duration;
              extractAudioEnvelope();
              updateTimelineDisplay();
            }
          } catch (audioErr) {
            console.warn('[Voice FX Audio Reload Notice]', audioErr);
          }

          showFeedbackNotice(`Voice successfully transformed with ${state.selectedProfile} FX!`, 'success');
          systemStatusText.textContent = `Voice Transformed (${state.selectedProfile}). Ready to preview.`;
        } else {
          showFeedbackNotice(`Voice FX failed: ${data.error || 'Unknown error'}`, 'error');
          systemStatusText.textContent = `Voice FX failed: ${data.error || 'Server error'}`;
        }
      } catch (err) {
        console.error('[Voice FX Network Error]', err);
        showFeedbackNotice('Voice FX request failed. Check server connection.', 'error');
        systemStatusText.textContent = 'Voice FX connection error.';
      } finally {
        btnTransformVoice.disabled = false;
        btnTransformVoice.innerHTML = originalHtml;
      }
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
        const activeBg = state.customBackgroundPath || (state.storyboardParts[0] && (state.storyboardParts[0].background_image || state.storyboardParts[0].background_path)) || null;
        if (activeBg && state.storyboardParts && state.storyboardParts.length > 0) {
          state.storyboardParts.forEach(p => {
            if (!p.background_image) p.background_image = activeBg;
            if (!p.background_path) p.background_path = activeBg;
          });
        }

        const payload = {
          video_path: state.videoPath || state.currentAudioServerPath || null,
          audio_path: state.currentAudioServerPath || state.videoPath || null,
          render_mode: state.renderMode || 'mocap',
          staging_style: state.stagingStyle || 'stick_hub_storyteller',
          beats: state.storyboardParts,
          title: 'AutoShorts Stickman Parody',
          destination_dir: state.destinationDir || '',
          transcript: transcriptInput ? transcriptInput.value : '',
          voice_profile: state.selectedProfile,
          custom_pitch: pitchSlider ? parseFloat(pitchSlider.value) : 1.45,
          custom_speed: speedSlider ? parseFloat(speedSlider.value) : 1.05,
          character_style: state.characterArchetype || 'classic',
          framing_mode: state.framingMode || (document.getElementById('selectFramingMode')?.value || 'auto'),
          background_path: activeBg,
          aspect_ratio: state.aspectRatio || '9:16',
          resolution: (state.aspectRatio === '16:9') ? '1280x720' : '720x1280',
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

        let sse = null;
        let pollInterval = null;

        function updateProgressUI(jobData) {
          if (!jobData || !jobData.status) return;
          if (renderStageText) renderStageText.textContent = (jobData.stage || 'PROCESSING').toUpperCase();
          if (renderProgressBar) renderProgressBar.style.width = `${jobData.progress || 0}%`;
          if (renderPercentText) renderPercentText.textContent = `${jobData.progress || 0}%`;

          if (jobData.status === 'completed') {
            if (pollInterval) clearInterval(pollInterval);
            if (sse) sse.close();
            systemStatusText.textContent = 'Render Completed Successfully!';
            showFeedbackNotice('Render Short completed successfully!', 'success');

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
            if (pollInterval) clearInterval(pollInterval);
            if (sse) sse.close();
            systemStatusText.textContent = `Render ${jobData.status}: ${jobData.error || ''}`;
            if (renderStageText) renderStageText.textContent = 'FAILED';
            showFeedbackNotice(`Render ${jobData.status}: ${jobData.error || 'Server error'}`, 'error');
          }
        }

        // 1. Real-time Server-Sent Events (SSE) Stream
        try {
          sse = new EventSource(api('/api/jobs/stream'));
          sse.onmessage = (event) => {
            try {
              const streamData = JSON.parse(event.data);
              if (streamData && streamData.id === jobId) {
                updateProgressUI(streamData);
              }
            } catch (_) {}
          };
        } catch (e) {
          console.warn('[SSE Stream Notice]', e);
        }

        // 2. Continuous Polling Fallback HUD
        pollInterval = setInterval(async () => {
          try {
            const jobStatusUrl = api(`/api/jobs/${jobId}`);
            const pollRes = await fetch(jobStatusUrl);
            const jobData = await pollRes.json();
            updateProgressUI(jobData);
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
  if (typeof applyAspectRatio === 'function') {
    applyAspectRatio(selectAspectRatio ? selectAspectRatio.value : (state.aspectRatio || '9:16'));
  }
  renderStoryboardCards();
  selectPart(0);
  animationTick();

})();
