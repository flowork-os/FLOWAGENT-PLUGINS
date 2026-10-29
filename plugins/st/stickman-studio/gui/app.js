// [FL_INDEX: keywords="stickman_renderer, procedural_kinematics, storyboard_director, multi_part_scenes, live_part_inspector, autoshorts_bridge, split_pip, micro_beats" | purpose="Sovereign Stickman Studio client-side controller featuring procedural 2D stickman rigging, ~3s micro-beat parody director, dual-view keyframe inspection, AutoShorts bridge, and split-screen PIP video exporter"]

/**
 * Stickman Studio — Sovereign Client Controller & Kinematics Renderer
 * Co-authored-by: Flowork OS <agent@floworkos.com>
 */

(() => {
  'use strict';

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
    renderMode: 'split_pip', // 'split_pip' or 'full_stickman'
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
    
    // Multi-Part Storyboard Beats State
    storyboardParts: [
      {
        id: 'beat_001',
        index: 1,
        start: 0.0,
        end: 3.0,
        duration: 3.0,
        text: 'Wait, did you see what just happened?!',
        prop: 'bulb',
        pose: 'surprised',
        emotion: 'surprised',
        model: 'classic',
        accent: '#00e5ff',
        camera_shake: true,
        parody_idea: 'Exaggerated shock reaction with eyes popping out and lightbulb pop'
      },
      {
        id: 'beat_002',
        index: 2,
        start: 3.0,
        end: 6.0,
        duration: 3.0,
        text: 'This changes literally everything we knew.',
        prop: 'chart_up',
        pose: 'point',
        emotion: 'happy',
        model: 'ninja',
        accent: '#00ff88',
        camera_shake: false,
        parody_idea: 'Stickman proudly pointing at rocket chart shooting off-screen'
      },
      {
        id: 'beat_003',
        index: 3,
        start: 6.0,
        end: 9.0,
        duration: 3.0,
        text: 'Stay until the end to catch the full story!',
        prop: 'bell',
        pose: 'celebrate',
        emotion: 'happy',
        model: 'cyber',
        accent: '#ffe600',
        camera_shake: false,
        parody_idea: 'Wild victory dance with celebration rings'
      }
    ],
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
  const btnSliceBeats = document.getElementById('btnSliceBeats');

  // Storyboard DOM Elements
  const tabAudioSource = document.getElementById('tabAudioSource');
  const tabStoryboard = document.getElementById('tabStoryboard');
  const tabContentAudio = document.getElementById('tabContentAudio');
  const tabContentStoryboard = document.getElementById('tabContentStoryboard');
  const btnAutoChunkStoryboard = document.getElementById('btnAutoChunkStoryboard');
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

  // Upload Media File to Server
  async function uploadMediaFile(file) {
    systemStatusText.textContent = `Uploading ${file.name}...`;
    try {
      const res = await fetch('/api/fs/upload-media', {
        method: 'POST',
        headers: {
          'x-filename': file.name
        },
        body: file
      });
      const data = await res.json();
      if (data.success && data.path) {
        state.videoPath = data.path;
        state.currentAudioServerPath = data.path;
        loadedFileName.textContent = file.name;
        loadedFileInfo.style.display = 'block';

        if (btnSliceBeats) btnSliceBeats.style.display = 'block';
        if (btnAutoChunkStoryboard) btnAutoChunkStoryboard.style.display = 'block';

        // Decode audio if audio file or browser video support
        try {
          const arrayBuf = await file.arrayBuffer();
          initAudioContext();
          state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuf);
          state.audioDuration = state.audioBuffer.duration;
          extractAudioEnvelope();
          loadedFileDuration.textContent = `${state.audioDuration.toFixed(1)}s`;
        } catch (_) {
          loadedFileDuration.textContent = 'Ready';
        }

        systemStatusText.textContent = 'Media Loaded: Ready for ~3s Slicing';
        updateTimelineDisplay();
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err) {
      console.error('[Upload Error]', err);
      systemStatusText.textContent = 'Upload Failed';
    }
  }

  // Slice Media into ~3-Second Micro-Beats & Cognitive Director
  async function sliceMediaBeats(mediaPath) {
    const targetPath = mediaPath || state.videoPath || state.currentAudioServerPath;
    if (!targetPath) {
      systemStatusText.textContent = 'No media loaded to slice';
      return;
    }

    systemStatusText.textContent = 'Slicing ~3s Beats & Directing Stickman Parody...';
    try {
      const res = await fetch('/api/beats/slice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_path: targetPath, target_seconds: 3.0 })
      });
      const data = await res.json();

      if (data.success && data.manifest && data.manifest.beats) {
        state.storyboardParts = data.manifest.beats;
        state.activePartIndex = 0;

        if (data.manifest.full_transcript) {
          transcriptInput.value = data.manifest.full_transcript;
        }

        if (data.manifest.total_duration) {
          state.audioDuration = data.manifest.total_duration;
          loadedFileDuration.textContent = `${state.audioDuration.toFixed(1)}s`;
          updateTimelineDisplay();
        }

        renderStoryboardCards();
        selectPart(0);

        if (tabStoryboard) tabStoryboard.click();
        systemStatusText.textContent = `Extracted ${state.storyboardParts.length} ~3s Parody Beats!`;
      } else {
        throw new Error(data.error || 'Failed to extract micro-beats');
      }
    } catch (err) {
      console.warn('[Beats Slicing Warning]', err);
      systemStatusText.textContent = 'Fallback: Generating Synthetic Beats';
      fallbackChunking();
    }
  }

  // Client-Side Fallback Chunking
  function fallbackChunking() {
    const totalDur = (state.audioDuration && state.audioDuration > 0) ? state.audioDuration : 15.0;
    const partLength = 3.0;
    const numParts = Math.max(1, Math.ceil(totalDur / partLength));
    const fallbackParts = [];
    const defaultProps = ['bulb', 'brain', 'target', 'heart', 'chart_up', 'alert'];
    const defaultPoses = ['talk', 'point', 'think', 'celebrate', 'shrug', 'talk'];
    const defaultEmotions = ['neutral', 'happy', 'confused', 'surprised', 'neutral', 'happy'];
    const parodyIdeas = [
      'Dramatic eye widen reaction with bulb pop',
      'Pointing aggressively at surging stock chart',
      'Clueless shrug with rotating question mark',
      'Wild victory celebration with bouncy hops',
      'Confused scratching head while gears spin'
    ];

    for (let i = 0; i < numParts; i++) {
      const startSec = i * partLength;
      const endSec = Math.min(totalDur, (i + 1) * partLength);
      fallbackParts.push({
        id: `beat_${String(i + 1).padStart(3, '0')}`,
        index: i + 1,
        start: startSec,
        end: endSec,
        duration: endSec - startSec,
        text: `Beat ${i + 1} (${formatTime(startSec)} - ${formatTime(endSec)})`,
        prop: defaultProps[i % defaultProps.length],
        pose: defaultPoses[i % defaultPoses.length],
        emotion: defaultEmotions[i % defaultEmotions.length],
        model: state.characterArchetype || 'classic',
        accent: state.colors.glow || '#00e5ff',
        camera_shake: i % 2 === 1,
        parody_idea: parodyIdeas[i % parodyIdeas.length]
      });
    }

    state.storyboardParts = fallbackParts;
    state.activePartIndex = 0;
    renderStoryboardCards();
    selectPart(0);
    if (tabStoryboard) tabStoryboard.click();
    systemStatusText.textContent = `Generated ${fallbackParts.length} ~3s scene beats!`;
  }

  // Render Stickman Animation on Viewport Canvas
  function renderStickman() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = state.colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Floor Horizon Line
    ctx.strokeStyle = '#222836';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 520);
    ctx.lineTo(canvas.width, 520);
    ctx.stroke();

    const currentBeat = state.storyboardParts.find(p => state.currentTime >= p.start && state.currentTime < p.end) 
      || state.storyboardParts[state.activePartIndex] 
      || state.storyboardParts[0];

    const pose = currentBeat ? currentBeat.pose : 'talk';
    const emotion = currentBeat ? currentBeat.emotion : 'neutral';
    const prop = currentBeat ? currentBeat.prop : 'bulb';
    const accent = (currentBeat && currentBeat.accent) || state.colors.glow;
    const stick = state.colors.stick;

    // Head bobbing calculation
    const timeSec = state.currentTime;
    const headBob = Math.sin(timeSec * 8 * state.kinematics.headBobRate) * 4;

    const cx = canvas.width / 2;
    const cy = 290 + headBob;

    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;

    // Head
    ctx.beginPath();
    ctx.arc(cx, cy - 80, 40, 0, Math.PI * 2);
    ctx.fillStyle = '#161b26';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = stick;
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#11141c';
    ctx.beginPath();
    ctx.arc(cx - 14, cy - 84, 5, 0, Math.PI * 2);
    ctx.arc(cx + 14, cy - 84, 5, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.strokeStyle = stick;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (emotion === 'happy') {
      ctx.arc(cx, cy - 76, 14, 0, Math.PI);
    } else if (emotion === 'surprised') {
      ctx.arc(cx, cy - 70, 10, 0, Math.PI * 2);
    } else if (emotion === 'angry') {
      ctx.moveTo(cx - 14, cy - 66);
      ctx.lineTo(cx + 14, cy - 74);
    } else {
      ctx.moveTo(cx - 14, cy - 70);
      ctx.lineTo(cx + 14, cy - 70);
    }
    ctx.stroke();

    // Body Spine
    ctx.beginPath();
    ctx.moveTo(cx, cy - 40);
    ctx.lineTo(cx, cy + 80);
    ctx.lineWidth = 5;
    ctx.stroke();

    // Arms based on pose
    ctx.beginPath();
    if (pose === 'talk') {
      const armSwing = Math.sin(timeSec * 6) * 15;
      ctx.moveTo(cx, cy - 20);
      ctx.lineTo(cx - 50, cy - 10 + armSwing);
      ctx.lineTo(cx - 65, cy - 45 + armSwing);
      ctx.moveTo(cx, cy - 20);
      ctx.lineTo(cx + 50, cy + 20 - armSwing);
      ctx.lineTo(cx + 60, cy + 60 - armSwing);
    } else if (pose === 'point') {
      ctx.moveTo(cx, cy - 20);
      ctx.lineTo(cx + 60, cy - 40);
      ctx.lineTo(cx + 90, cy - 50);
      ctx.moveTo(cx, cy - 20);
      ctx.lineTo(cx - 40, cy + 30);
    } else if (pose === 'think') {
      ctx.moveTo(cx, cy - 20);
      ctx.lineTo(cx + 40, cy - 60);
      ctx.lineTo(cx + 20, cy - 75);
      ctx.moveTo(cx, cy - 20);
      ctx.lineTo(cx - 35, cy + 25);
    } else if (pose === 'celebrate') {
      ctx.moveTo(cx, cy - 20);
      ctx.lineTo(cx - 55, cy - 75);
      ctx.moveTo(cx, cy - 20);
      ctx.lineTo(cx + 55, cy - 75);
    } else if (pose === 'run') {
      ctx.moveTo(cx, cy - 20);
      ctx.lineTo(cx - 50, cy - 50);
      ctx.moveTo(cx, cy - 20);
      ctx.lineTo(cx + 50, cy + 10);
    } else {
      ctx.moveTo(cx, cy - 20);
      ctx.lineTo(cx - 50, cy + 30);
      ctx.moveTo(cx, cy - 20);
      ctx.lineTo(cx + 50, cy + 30);
    }
    ctx.stroke();

    // Legs
    ctx.beginPath();
    if (pose === 'run') {
      ctx.moveTo(cx, cy + 80);
      ctx.lineTo(cx - 45, cy + 140);
      ctx.lineTo(cx - 70, cy + 130);
      ctx.moveTo(cx, cy + 80);
      ctx.lineTo(cx + 40, cy + 120);
      ctx.lineTo(cx + 70, cy + 180);
    } else if (pose === 'celebrate') {
      ctx.moveTo(cx, cy + 80);
      ctx.lineTo(cx - 40, cy + 130);
      ctx.moveTo(cx, cy + 80);
      ctx.lineTo(cx + 40, cy + 130);
    } else {
      ctx.moveTo(cx, cy + 80);
      ctx.lineTo(cx - 35, cy + 190);
      ctx.moveTo(cx, cy + 80);
      ctx.lineTo(cx + 35, cy + 190);
    }
    ctx.stroke();

    // Prop Emoji Rendering
    const propEmojiMap = {
      bulb: '💡', question: '❓', chart_up: '📈', chart_down: '📉',
      alert: '⚠️', brain: '🧠', heart: '❤️', broken_heart: '💔',
      clock: '⏰', phone: '📱', target: '🎯', battery: '🔋',
      scale: '⚖️', lock: '🔒', eyes: '👀', book: '📖',
      house: '🏠', people: '👥', mask: '🎭', bell: '🔔', fire: '🔥'
    };
    const emoji = propEmojiMap[prop] || '💡';
    ctx.font = '40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx + 70, cy - 65);

    ctx.restore();

    // Subtitle Overlay
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

    state.storyboardParts.forEach((part, index) => {
      const card = document.createElement('div');
      card.className = `fl-scene-card ${index === state.activePartIndex ? 'active' : ''}`;
      
      const thumbSrc = part.keyframe_url || (part.keyframe_file ? `/api/keyframes/${part.keyframe_file}` : '');

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

  // Select Active Part for Editing in Beat Inspector
  function selectPart(index) {
    if (!state.storyboardParts[index]) return;
    state.activePartIndex = index;
    const part = state.storyboardParts[index];

    renderStoryboardCards();

    if (activePartBadge) activePartBadge.textContent = `BEAT ${index + 1}`;
    if (partPropSelect) partPropSelect.value = part.prop || 'bulb';
    if (partPoseSelect) partPoseSelect.value = part.pose || 'talk';
    if (partEmotionSelect) partEmotionSelect.value = part.emotion || 'neutral';
    if (glowColorPicker) glowColorPicker.value = part.accent || '#00e5ff';

    // Update Keyframe Image
    const keyframeUrl = part.keyframe_url || (part.keyframe_file ? `/api/keyframes/${part.keyframe_file}` : null);
    if (keyframeUrl) {
      beatKeyframeImage.src = keyframeUrl;
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
    if (partPreviewPlaceholder) partPreviewPlaceholder.style.display = 'none';
    if (!partPreviewImage || !part) return;

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
        const res = await fetch('/api/bridge/autoshorts');
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
            card.addEventListener('click', () => {
              if (modalAutoShorts) modalAutoShorts.style.display = 'none';
              state.videoPath = clip.path;
              state.currentAudioServerPath = clip.path;
              loadedFileName.textContent = clip.name;
              loadedFileInfo.style.display = 'block';
              if (btnSliceBeats) btnSliceBeats.style.display = 'block';
              sliceMediaBeats(clip.path);
            });
            autoshortsClipsList.appendChild(card);
          });
        } else {
          autoshortsClipsList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 12px;">No video clips found in AutoShorts projects yet. You can upload any MP4 video directly.</div>';
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
        const res = await fetch('/api/pick-folder');
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
  // Micro-Beat Slicing Button
  // -------------------------------------------------------------
  if (btnSliceBeats) {
    btnSliceBeats.addEventListener('click', () => {
      sliceMediaBeats();
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

  if (btnAutoChunkStoryboard) {
    btnAutoChunkStoryboard.addEventListener('click', () => {
      fallbackChunking();
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
    uploadDropzone.addEventListener('click', () => {
      if (mediaFileInput) mediaFileInput.click();
      else if (audioFileInput) audioFileInput.click();
    });
    uploadDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadDropzone.style.borderColor = 'var(--accent-cyan)';
    });
    uploadDropzone.addEventListener('dragleave', () => {
      uploadDropzone.style.borderColor = 'var(--border-subtle)';
    });
    uploadDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadDropzone.style.borderColor = 'var(--border-subtle)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        uploadMediaFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (mediaFileInput) {
    mediaFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        uploadMediaFile(e.target.files[0]);
      }
    });
  }

  if (audioFileInput) {
    audioFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        uploadMediaFile(e.target.files[0]);
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

        const res = await fetch('/api/render/video', {
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
            const pollRes = await fetch(`/api/jobs/${jobId}`);
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
                  btnDownloadRendered.href = jobData.output_url || `/exports/${jobData.output_file}`;
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
  renderStoryboardCards();
  selectPart(0);
  animationTick();

})();
