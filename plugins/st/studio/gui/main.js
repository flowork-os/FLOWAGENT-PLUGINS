/* ============================================================
   LUFS Meter — main.js (ES Module)
   Tauri v2 Frontend Logic
   ============================================================ */

window.addEventListener('error', (e) => {
  alert('JS Error: ' + e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  alert('Promise Error: ' + e.reason);
});

// ── Tauri API imports ──
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;

// ── State ──
let currentFile = null;
let analysisResult = null;
let targetLufs = -14;
let meterAnimationId = null;
let files = []; // list of loaded files { path, metadata }
let isAnalyzing = false;
let isExporting = false;
let cancelBatch = false;
let totalBatchFiles = 0;
let currentBatchIndex = 0;
let currentAction = '';
let userBrowsingHistory = false; // true jika user sedang klik-klik history untuk melihat hasil

// Load preference from localStorage (default: true)
let storedAuto = localStorage.getItem('lufs_auto_analyze');
let autoAnalyzeEnabled = storedAuto !== 'false';


const PLATFORMS = [
  { name: 'Spotify', target: -14 },
  { name: 'Apple Music', target: -16 },
  { name: 'YouTube', target: -14 },
  { name: 'Tidal', target: -14 },
  { name: 'EBU R128', target: -23 }
];

// ── DOM cache ──
const $ = (id) => document.getElementById(id);

// ============================================================
//  CUSTOM ALERT MODAL
// ============================================================
function customAlert(message) {
  const modal = $('modal-alert');
  const msgEl = $('modal-alert-message');
  msgEl.textContent = message;
  modal.classList.add('active');
}

$('btn-alert-ok').addEventListener('click', () => {
  $('modal-alert').classList.remove('active');
});

$('modal-alert').addEventListener('click', (e) => {
  if (e.target === $('modal-alert')) {
    $('modal-alert').classList.remove('active');
  }
});
const mainVal      = $('mainVal');
const badge        = $('badge');
const badgeText    = $('badgeText');
const tSlider      = $('tSlider');
const tNum         = $('tNum');
const statLra      = $('stat-lra');
const statTp       = $('stat-tp');
const statShort    = $('stat-short');
const statMom      = $('stat-mom');
const tpFill       = $('tp-fill-bar');
const tpValue      = $('tp-value');
const platformList = $('platform-list');
const historyList  = $('history-list');
const fileList     = $('file-list');
const dropZone     = $('drop-zone');
const statusLed    = $('status-led');
const statusText   = $('status-text');
const statusInfo   = $('status-info');
const lufsSvg      = $('lufs-svg');

// ============================================================
//  WINDOW CONTROLS
// ============================================================
const appWindow = getCurrentWindow();

$('btn-minimize').addEventListener('click', () => appWindow.minimize());

$('btn-close').addEventListener('click', () => appWindow.close());

// Native drag region is handled by data-tauri-drag-region in HTML

// ============================================================
//  HELPERS
// ============================================================
function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s < 10 ? '0' : ''}${s}s`;
}

function formatSampleRate(sr) {
  if (!sr) return '-- kHz';
  return (sr / 1000).toFixed(1) + ' kHz';
}

function fileName(path) {
  if (!path) return '';
  return path.replace(/\\/g, '/').split('/').pop();
}

function setStatus(type, text, info) {
  statusLed.className = 'status-led';
  if (type === 'busy') statusLed.classList.add('led-busy');
  else if (type === 'error') statusLed.classList.add('led-error');
  statusText.textContent = text || 'Ready';
  if (info !== undefined) statusInfo.textContent = info;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ============================================================
//  FILE OPENING
// ============================================================
async function uploadAndLoadFile(file) {
  if (!file) return;
  if (typeof file === 'string') {
    return await loadFile(file);
  }
  if (file.path && (file.path.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(file.path))) {
    return await loadFile(file.path);
  }
  try {
    setStatus('busy', `Uploading ${file.name}…`);
    const encodedName = encodeURIComponent(file.name);
    const apiBase = window.__FLOWORK_API_BASE__ || '';
    const res = await fetch(`${apiBase}/api/upload?name=${encodedName}`, {
      method: 'POST',
      headers: { 'x-filename': encodedName },
      body: file
    });
    const data = await res.json();
    if (data.ok && data.path) {
      await loadFile(data.path);
    } else {
      throw new Error(data.error || 'Upload failed');
    }
  } catch (err) {
    console.error('File upload error:', err);
    setStatus('error', 'Upload failed', String(err));
  }
}

async function openFileDialog() {
  if (isAnalyzing || isExporting) {
    customAlert("Proses sedang berjalan. Harap tunggu atau batalkan terlebih dahulu.");
    return;
  }
  
  let picker = document.getElementById('studio-multi-os-picker');
  if (!picker) {
    picker = document.createElement('input');
    picker.id = 'studio-multi-os-picker';
    picker.type = 'file';
    picker.multiple = true;
    picker.accept = 'audio/*,video/*,.wav,.mp3,.aac,.flac,.ogg,.mp4,.mkv,.mov,.webm,.m4a,.opus';
    picker.style.display = 'none';
    document.body.appendChild(picker);
  }

  picker.onchange = async () => {
    const selected = Array.from(picker.files || []);
    if (selected.length > 0) {
      clearAllFiles();
      for (const file of selected) {
        await uploadAndLoadFile(file);
      }
    }
    picker.value = '';
  };

  picker.click();
}

async function loadFile(filePath) {
  try {
    setStatus('busy', 'Loading…');
    const metadata = await invoke('get_file_metadata', { filePath });
    addFileToList(metadata, filePath);
    setActiveFile(filePath);
    setStatus('', 'Ready', `${fileName(filePath)} | ${formatDuration(metadata.duration)} | ${formatSampleRate(metadata.sample_rate)} | ${metadata.codec || ''}`);
  } catch (e) {
    console.error('load file error:', e);
    setStatus('error', 'Failed to load', String(e));
  }
}

// ── Drag & Drop via Tauri ──
listen('tauri://drag-drop', async (event) => {
  if (isAnalyzing || isExporting) {
    customAlert("Proses sedang berjalan. Harap tunggu atau batalkan terlebih dahulu.");
    return;
  }
  const paths = event.payload.paths || event.payload;
  if (paths && paths.length > 0) {
    clearAllFiles();
    if (Array.isArray(paths)) {
      for (const p of paths) await loadFile(p);
    } else if (typeof paths === 'string') {
      await loadFile(paths);
    }
  }
});

// ── HTML5 drag visuals and drop handling on drop zone ──
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');
  if (isAnalyzing || isExporting) {
    customAlert("Proses sedang berjalan. Harap tunggu atau batalkan terlebih dahulu.");
    return;
  }
  const droppedFiles = Array.from(e.dataTransfer ? e.dataTransfer.files : []);
  if (droppedFiles.length > 0) {
    clearAllFiles();
    for (const file of droppedFiles) {
      await uploadAndLoadFile(file);
    }
  }
});
dropZone.addEventListener('click', openFileDialog);

// Global window drop handler for multi-OS webview
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
});
window.addEventListener('drop', async (e) => {
  if (e.target.closest('#drop-zone')) return;
  e.preventDefault();
  e.stopPropagation();
  if (isAnalyzing || isExporting) return;
  const droppedFiles = Array.from(e.dataTransfer ? e.dataTransfer.files : []);
  if (droppedFiles.length > 0) {
    clearAllFiles();
    for (const file of droppedFiles) {
      await uploadAndLoadFile(file);
    }
  }
});

// ============================================================
//  FILE LIST
// ============================================================
function addFileToList(metadata, filePath) {
  // avoid duplicates
  if (files.find(f => f.path === filePath)) return;
  files.push({ path: filePath, metadata });

  const row = document.createElement('div');
  row.className = 'file-row';
  row.dataset.path = filePath;
  row.innerHTML = `
    <i class="ti ti-music"></i>
    <span class="file-row-name">${fileName(filePath)}</span>
    <span class="file-row-dur">${formatDuration(metadata.duration)}</span>
    <i class="ti ti-x btn-remove-file"></i>
  `;
  row.addEventListener('click', () => {
    if (isAnalyzing || isExporting) return;
    setActiveFile(filePath);
  });
  
  const removeBtn = row.querySelector('.btn-remove-file');
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFile(filePath);
    });
  }
  
  fileList.appendChild(row);
  updateFileCount();
}

function updateFileCount() {
  const fileCountEl = $('file-count');
  if (fileCountEl) {
    fileCountEl.textContent = files.length;
  }
}

function clearAllFiles() {
  if (isAnalyzing || isExporting) {
    customAlert("Proses sedang berjalan. Harap tunggu atau batalkan terlebih dahulu.");
    return;
  }

  files = [];
  currentFile = null;
  analysisResult = null;
  fileList.innerHTML = '';
  historyList.innerHTML = '';
  updateFileCount();
  resetDisplay();
  setStatus('', 'Ready', 'All files cleared');
}

function removeFile(filePath) {
  if (isAnalyzing || isExporting) {
    customAlert("Proses sedang berjalan. Harap tunggu atau batalkan terlebih dahulu.");
    return;
  }

  files = files.filter(f => f.path !== filePath);
  
  Array.from(fileList.children).forEach(row => {
    if (row.dataset.path === filePath) row.remove();
  });
  
  Array.from(historyList.children).forEach(item => {
    if (item.dataset.path === filePath) item.remove();
  });
  
  updateFileCount();
  
  if (currentFile === filePath) {
    if (files.length > 0) {
      setActiveFile(files[0].path);
    } else {
      currentFile = null;
      analysisResult = null;
      resetDisplay();
      setStatus('', 'Ready', 'File removed');
    }
  }
}

function setActiveFile(filePath) {
  currentFile = filePath;
  // highlight row
  let activeRow = null;
  fileList.querySelectorAll('.file-row').forEach(r => {
    const isActive = r.dataset.path === filePath;
    r.classList.toggle('active', isActive);
    if (isActive) activeRow = r;
  });
  
  const fileObj = files.find(f => f.path === filePath);
  
  if (activeRow) activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  
  if (fileObj && fileObj.result) {
    analysisResult = fileObj.result;
    renderResults(analysisResult);
    
    // Sync with right sidebar (History)
    historyList.querySelectorAll('.hist-item').forEach(item => {
      if (isAnalyzing) {
        // Jangan tampilkan warna biru di history saat proses analyze berjalan
        item.classList.remove('active');
      } else {
        if (item.dataset.path === filePath) {
          item.classList.add('active');
          item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          item.classList.remove('active');
        }
      }
    });
  } else {
    analysisResult = null;
    if (isAnalyzing || isExporting) {
      setAnalyzingDisplay(isAnalyzing ? 'ANALYZING...' : 'EXPORTING...');
      addPendingHistoryItem(filePath);
      // Ensure no history item is blue while processing
      if (isAnalyzing) {
        historyList.querySelectorAll('.hist-item').forEach(item => item.classList.remove('active'));
      }
    } else {
      resetDisplay();
      // Remove history highlights
      historyList.querySelectorAll('.hist-item').forEach(item => item.classList.remove('active'));
    }
  }

  const meta = fileObj?.metadata;
  if (meta) {
    const stateStr = (fileObj && fileObj.result) ? 'Analysis complete' : 'Ready';
    setStatus('', stateStr, `${fileName(filePath)} | ${formatDuration(meta.duration)} | ${formatSampleRate(meta.sample_rate)} | ${meta.codec || ''}`);
  }
}

// ============================================================
//  ANALYSIS
// ============================================================
async function runAnalysis() {
  if (files.length === 0) {
    setStatus('error', 'No file loaded');
    return;
  }

  const btnAnalyze = $('btn-analyze-right');

  // Cancel logic
  if (isAnalyzing) {
    cancelBatch = true;
    invoke('cancel_ffmpeg').catch(e => console.error("Cancel failed", e));
    if (btnAnalyze) {
      btnAnalyze.innerHTML = '<i class="ti ti-loader"></i> Canceling...';
      btnAnalyze.disabled = true;
    }
    return;
  }
  
  if (isExporting) {
    customAlert("Proses sedang berjalan. Harap tunggu atau batalkan terlebih dahulu.");
    return;
  }

  isAnalyzing = true;
  cancelBatch = false;
  userBrowsingHistory = false; // Reset browsing flag when starting
  tSlider.disabled = true;

  if (btnAnalyze) {
    btnAnalyze.innerHTML = '<i class="ti ti-player-stop-filled"></i> Cancel';
    btnAnalyze.style.backgroundColor = '#d32f2f';
    btnAnalyze.style.color = '#ffffff';
  }

  let successCount = 0;
  totalBatchFiles = files.length;
  currentAction = 'analyze';

  for (const f of files) {
    if (cancelBatch) break;
    currentBatchIndex = successCount;
    setActiveFile(f.path);
    
    try {
      setStatus('busy', `Analyzing ${successCount + 1}/${files.length}…`);
      setAnalyzingDisplay('ANALYZING...');
      addPendingHistoryItem(f.path);
      startMeterAnimation();

      analysisResult = await invoke('analyze_file', {
        filePath: currentFile,
        targetLufs: targetLufs,
      });

      stopMeterAnimation();
      renderResults(analysisResult);
      addHistoryItem(analysisResult, currentFile);
      
      const fileObj = files.find(f => f.path === currentFile);
      if (fileObj) fileObj.result = analysisResult;
      
      successCount++;
      // Jeda UI
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      stopMeterAnimation();
      // Remove pending item if it's stuck on processing
      historyList.querySelectorAll('.hist-item').forEach(item => {
        if (item.dataset.path === f.path && item.innerHTML.includes('Processing...')) {
          item.remove();
        }
      });
      if (e === 'Canceled' || cancelBatch) {
        // Expected cancellation, don't show as error
        break;
      }
      console.error('analysis error:', e);
      setStatus('error', `Analysis failed for ${fileName(f.path)}`, String(e));
      await new Promise(r => setTimeout(r, 200));
    }
  }

  stopMeterAnimation();
  isAnalyzing = false;
  userBrowsingHistory = false;
  tSlider.disabled = false;
  if (btnAnalyze) {
    btnAnalyze.disabled = false;
    btnAnalyze.innerHTML = '<i class="ti ti-player-play-filled"></i> Analyze';
    btnAnalyze.style.backgroundColor = '';
    btnAnalyze.style.color = '';
  }
  
  if (cancelBatch) {
    if (analysisResult) {
      badge.className = 'readout-badge badge-pass';
      badgeText.textContent = 'ON TARGET'; // renderResults would have updated this if valid, but let's just re-render
      renderResults(analysisResult);
    } else {
      resetDisplay();
    }
    setStatus('', 'Analysis canceled', `Processed ${successCount} files before canceling`);
  } else {
    setStatus('', 'Analysis complete', `Processed ${successCount} of ${files.length} files`);
  }

  // Set warna biru ke file terakhir yang diproses
  if (currentFile) {
    setActiveFile(currentFile);
  }
}

// ============================================================
//  METER ANIMATION
// ============================================================
let meterValues = {
  bL: [0, 0, 0, 0],
  bR: [0, 0, 0, 0],
  bInt: [0, 0, 0, 0],
  bST: [0, 0, 0, 0],
  bMom: [0, 0, 0, 0]
};

function startMeterAnimation() {
  const animate = () => {
    const bars = [
      // bases: [green, yellow, orange, red]
      { id: 'bL',   bases: [65, 18, 8, 4] },
      { id: 'bR',   bases: [62, 15, 6, 3] },
      { id: 'bInt', bases: [57, 4, 0, 0] },
      { id: 'bST',  bases: [68, 9, 2, 0] },
      { id: 'bMom', bases: [75, 14, 5, 0] },
    ];
    bars.forEach(b => {
      const el = $(b.id);
      if (!el) return;
      const segs = el.querySelectorAll('.v-seg');
      segs.forEach((s, i) => {
        // Generate a random dynamic target
        const target = b.bases[i] + (Math.random() * 40 - 20);
        let current = meterValues[b.id][i];
        
        // Fast attack, slow release (Pro audio meter ballistics)
        if (target > current) {
          current += (target - current) * 0.6; // Attack
        } else {
          current += (target - current) * 0.1; // Release
        }
        
        meterValues[b.id][i] = current;
        s.style.height = Math.max(0, Math.min(100, current)) + '%';
      });
    });
    meterAnimationId = requestAnimationFrame(animate);
  };
  animate();
}

function stopMeterAnimation() {
  if (meterAnimationId) cancelAnimationFrame(meterAnimationId);
  meterAnimationId = null;
}

// ============================================================
//  RENDER RESULTS
// ============================================================
function renderResults(result) {
  const lufs = parseFloat(result.input_lufs ?? result.integrated_lufs ?? -14.0);
  const tp   = parseFloat(result.true_peak ?? result.true_peak_db ?? -1.0);
  const lra  = parseFloat(result.lra ?? result.loudness_range ?? 7.0);

  // Short-term & Momentary (use backend values if available, else approximate)
  if (result._shortTerm == null) {
    const rawShort = result.short_term ?? result.short_term_max;
    result._shortTerm = rawShort != null ? parseFloat(rawShort) : lufs + 1.8;
  }
  if (result._momentary == null) {
    const rawMom = result.momentary ?? result.momentary_max;
    result._momentary = rawMom != null ? parseFloat(rawMom) : lufs + 3.2;
  }
  const shortTerm = result._shortTerm;
  const momentary = result._momentary;
  const lPeak = result.l_peak != null ? parseFloat(result.l_peak) : tp;
  const rPeak = result.r_peak != null ? parseFloat(result.r_peak) : tp;

  // ── Big readout ──
  updateBigReadout(result, shortTerm, momentary);

  // ── Stat tiles ──
  statLra.textContent   = lra.toFixed(1) + ' LU';
  statTp.textContent    = tp.toFixed(1) + ' dBTP';
  statShort.textContent = shortTerm.toFixed(1) + ' LUFS';
  statMom.textContent   = momentary.toFixed(1) + ' LUFS';

  // ── Meter bars (set to static values reflecting result) ──
  setMeterBars(lufs, tp, shortTerm, momentary, lPeak, rPeak);

  // ── True peak bar ──
  const tpPercent = clamp(((tp + 20) / 20) * 100, 0, 100); // -20..0 range
  tpFill.style.width = tpPercent + '%';
  tpFill.className = 'tp-fill' + (tp > -1 ? ' tp-over' : tp > -3 ? ' tp-warn' : '');
  tpValue.textContent = tp.toFixed(1) + ' dBTP';

  // ── Platform compliance ──
  updatePlatformCheck(lufs);

  // ── SVG graph ──
  drawLufsGraph(result);
}

function addHistoryItem(result, originalPath) {
  const rawLufs = result.input_lufs ?? result.integrated_lufs ?? -14.0;
  const rawTp = result.true_peak ?? result.true_peak_db ?? -1.0;
  const lufs = parseFloat(rawLufs).toFixed(1);
  const tp = parseFloat(rawTp).toFixed(1);
  const name = fileName(result.file_path);
  const pathToStore = originalPath || result.file_path;
  
  // Remove "No results yet" if exists
  const empty = historyList.querySelector('.history-empty');
  if (empty) empty.remove();

  // Remove existing entry for same file (dedup)
  historyList.querySelectorAll('.hist-item').forEach(item => {
    if (item.dataset.path === pathToStore) item.remove();
  });

  const item = document.createElement('div');
  item.className = 'hist-item';
  item.dataset.path = pathToStore;
  
  if (!isAnalyzing) {
    if (!userBrowsingHistory && pathToStore === currentFile) {
      // Otomatis biru hanya jika user tidak sedang browsing hasil lain
      historyList.querySelectorAll('.hist-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    }
  } else {
    // Saat proses analyze berjalan, pastikan item ini tidak biru
    item.classList.remove('active');
  }
  
  item.style.borderRadius = 'var(--radius-sm)';
  item.style.gap = '4px';
  item.style.cursor = 'pointer';
  item.style.border = '1px solid transparent';
  
  item.innerHTML = `
    <span class="hist-item-name">${name}</span>
    <div class="hist-item-stats">
      <span class="hist-val-lufs">${lufs} LUFS</span>
      <span class="hist-val-tp">${tp} dBTP</span>
    </div>
  `;
  
  item.addEventListener('click', () => {
    if (isAnalyzing || isExporting) return;
    setActiveFile(result.file_path);
  });
  
  // Insert at the top
  historyList.insertBefore(item, historyList.firstChild);
}

function updateBigReadout(result, st, mom) {
  const lufs = parseFloat(result.input_lufs);
  
  // Use stored values from renderResults, or passed parameters
  const shortTerm = st !== undefined ? st : (result._shortTerm != null ? result._shortTerm : lufs);
  const momentary = mom !== undefined ? mom : (result._momentary != null ? result._momentary : lufs);

  let displayVal = lufs;
  if (currentMode === 'shortterm') displayVal = shortTerm;
  if (currentMode === 'momentary') displayVal = momentary;

  mainVal.textContent = displayVal.toFixed(1);
  const diff = displayVal - targetLufs;
  updateReadoutColor(displayVal, diff);
}

function updateReadoutColor(lufs, diff) {
  if (diff === undefined) diff = lufs - targetLufs;

  if (Math.abs(diff) <= 2) {
    mainVal.style.color = 'var(--w-green)';
    badge.className = 'readout-badge badge-ok';
    badgeText.textContent = 'ON TARGET';
  } else if (diff > 2) {
    mainVal.style.color = 'var(--w-red)';
    badge.className = 'readout-badge badge-over';
    badgeText.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)} LU OVER`;
  } else {
    mainVal.style.color = 'var(--w-yellow)';
    badge.className = 'readout-badge badge-warn';
    badgeText.textContent = `${diff.toFixed(1)} LU UNDER`;
  }
}

function setMeterBars(lufs, tp, shortTerm, momentary, lPeak, rPeak) {
  // Map LUFS values to bar fill percentages
  // Scale: -60 LUFS = 0%, 0 LUFS = 100%
  const lufsToPercent = (v) => clamp(((v + 60) / 60) * 100, 0, 100);

  const mapping = [
    { id: 'bL',   val: lufsToPercent(lPeak) },
    { id: 'bR',   val: lufsToPercent(rPeak) },
    { id: 'bInt', val: lufsToPercent(lufs) },
    { id: 'bST',  val: lufsToPercent(shortTerm) },
    { id: 'bMom', val: lufsToPercent(momentary) },
  ];

  mapping.forEach(m => {
    const el = $(m.id);
    if (!el) return;
    const segs = el.querySelectorAll('.v-seg');
    const total = m.val;
    // segs[0] is green, segs[1] is yellow, segs[2] is orange, segs[3] is red
    segs[0].style.height = Math.min(total, 60) + '%';           // green
    segs[1].style.height = Math.max(0, Math.min(total - 60, 20)) + '%'; // yellow
    segs[2].style.height = Math.max(0, Math.min(total - 80, 12)) + '%'; // orange
    segs[3].style.height = Math.max(0, Math.min(total - 92, 8)) + '%';  // red
  });
}

// ============================================================
//  PLATFORM COMPLIANCE
// ============================================================
function updatePlatformCheck(lufs) {
  platformList.innerHTML = '';
  PLATFORMS.forEach(p => {
    let dotClass = 'neutral';
    if (lufs !== null && lufs !== undefined) {
      // Membulatkan diff ke 1 desimal untuk menghindari isu floating point
      const diff = Number((lufs - p.target).toFixed(1));
      dotClass = 'pass';
      if (diff > 1)      dotClass = 'fail';
      else if (diff > 0) dotClass = 'warn';
    }

    const item = document.createElement('div');
    item.className = 'plat-item';
    item.innerHTML = `
      <div class="plat-dot ${dotClass}"></div>
      <span class="plat-text">${p.name} (${p.target})</span>
    `;
    platformList.appendChild(item);
  });
}

// ============================================================
//  SVG GRAPH
// ============================================================
function drawLufsGraph(result) {
  // Clear previous paths
  lufsSvg.querySelectorAll('.svg-curve, .svg-fill').forEach(el => el.remove());

  // Generate data points (use loudness_data array if available, else simulate)
  const data = result.loudness_data || generateSimulatedData(parseFloat(result.input_lufs), 60);

  if (!data.length) return;

  const W = 600;
  const H = 140;
  const padL = 24;
  const padR = 10;
  const plotW = W - padL - padR;
  const minLufs = -42;
  const maxLufs = 0;

  const yScale = (v) => H - ((clamp(v, minLufs, maxLufs) - minLufs) / (maxLufs - minLufs)) * H;
  const xScale = (i) => padL + (i / (data.length - 1)) * plotW;

  // Build path
  let d = `M ${xScale(0)} ${yScale(data[0])}`;
  for (let i = 1; i < data.length; i++) {
    const x = xScale(i);
    const y = yScale(data[i]);
    // Smooth with cubic bezier control points
    const prevX = xScale(i - 1);
    const cpx = (prevX + x) / 2;
    d += ` C ${cpx} ${yScale(data[i - 1])}, ${cpx} ${y}, ${x} ${y}`;
  }

  // Fill path (closed)
  const fillD = d + ` L ${xScale(data.length - 1)} ${H} L ${padL} ${H} Z`;

  const fillPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  fillPath.setAttribute('d', fillD);
  fillPath.setAttribute('class', 'svg-fill');
  lufsSvg.appendChild(fillPath);

  const curvePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  curvePath.setAttribute('d', d);
  curvePath.setAttribute('class', 'svg-curve');
  lufsSvg.appendChild(curvePath);

  // Update target line position
  const targetY = yScale(targetLufs);
  const tLine = $('svg-target-line');
  const tText = $('svg-target-text');
  if (tLine) { tLine.setAttribute('y1', targetY); tLine.setAttribute('y2', targetY); }
  if (tText) { tText.setAttribute('y', targetY - 4); tText.textContent = targetLufs; }
}

function generateSimulatedData(baseLufs, count) {
  const data = [];
  let v = baseLufs;
  for (let i = 0; i < count; i++) {
    v += (Math.random() - 0.5) * 3;
    v = clamp(v, baseLufs - 8, baseLufs + 5);
    data.push(v);
  }
  return data;
}

// ============================================================
//  TARGET LUFS CONTROL
// ============================================================
tSlider.addEventListener('input', () => {
  if (isAnalyzing || isExporting) {
    tSlider.value = targetLufs; // prevent sliding
    return;
  }
  targetLufs = parseFloat(tSlider.value);
  tNum.textContent = targetLufs.toFixed(1);
  updateActiveChip();
  if (analysisResult) {
    const lufs = parseFloat(analysisResult.input_lufs);
    updateReadoutColor(lufs);
    updatePlatformCheck(lufs);
    drawLufsGraph(analysisResult);
  }
});

// Preset chips
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    if (isAnalyzing || isExporting) {
      customAlert("Proses sedang berjalan. Harap tunggu atau batalkan terlebih dahulu.");
      return;
    }
    const val = parseFloat(chip.dataset.target);
    targetLufs = val;
    tSlider.value = val;
    tNum.textContent = val.toFixed(1);
    updateActiveChip();
    if (analysisResult) {
      const lufs = parseFloat(analysisResult.input_lufs);
      updateReadoutColor(lufs);
      updatePlatformCheck(lufs);
      drawLufsGraph(analysisResult);
    }
  });
});

function updateActiveChip() {
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('chip-active', parseFloat(c.dataset.target) === targetLufs);
  });
}

// ============================================================
//  METERING MODE BUTTONS
// ============================================================
let currentMode = 'integrated';

// Metering mode buttons
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (isAnalyzing || isExporting) {
      customAlert("Proses sedang berjalan. Harap tunggu atau batalkan terlebih dahulu.");
      return;
    }
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('mode-active'));
    btn.classList.add('mode-active');
    currentMode = btn.dataset.mode;
    
    // Update the big readout if we already have an analysis result
    if (analysisResult) {
      updateBigReadout(analysisResult);
    }
  });
});

// ============================================================
//  EXPORT REPORT
// ============================================================
async function exportReport() {
  if (files.length === 0) {
    setStatus('error', 'No file loaded');
    return;
  }

  if (isExporting || isAnalyzing) {
    customAlert('Proses sedang berjalan. Harap tunggu atau batalkan terlebih dahulu.');
    return;
  }

  // Ensure all files are analyzed first
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f.result) {
      customAlert('Silahkan analisis dulu audionya (klik tombol Analyze) sebelum membuat Data Report.');
      return;
    }
  }
  stopMeterAnimation();

  try {
    let fullReport = "";
    for (const f of files) {
      const singleReport = await invoke('export_report', {
        result: f.result,
        targetLufs: targetLufs,
      });
      if (files.length > 1) {
        fullReport += singleReport + "\n\n" + "=".repeat(80) + "\n\n";
      } else {
        fullReport = singleReport;
      }
    }

    const defaultSavePath = 'Data Report LUFS Meter.txt';

    const savePath = await window.__TAURI__.dialog.save({
      defaultPath: defaultSavePath,
      filters: [{ name: 'Text Report', extensions: ['txt', 'md'] }],
    });

    if (savePath) {
      await invoke('save_text_file', { path: savePath, content: fullReport });
      setStatus('', files.length > 1 ? 'Batch report exported' : 'Report exported', savePath);
    }
  } catch (e) {
    console.error('export error:', e);
    setStatus('error', 'Export failed', String(e));
  }
}

// ============================================================
//  RESET / ANALYZING DISPLAY
// ============================================================
function setAnalyzingDisplay(actionText = 'ANALYZING...') {
  mainVal.textContent = '--.-';
  mainVal.style.color = 'var(--w-text)';
  
  badge.className = 'readout-badge badge-analyzing';
  badgeText.textContent = actionText;
  
  statLra.textContent = '--.- LU';
  statTp.textContent = '--.- dBTP';
  statShort.textContent = '--.- LUFS';
  statMom.textContent = '--.- LUFS';
  tpValue.textContent = '--.- dBTP';
  tpFill.style.width = '0%';
  
  ['bL', 'bR', 'bInt', 'bST', 'bMom'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.querySelectorAll('.v-seg').forEach(s => { s.style.height = '0%'; });
  });
  
  lufsSvg.querySelectorAll('.svg-curve, .svg-fill').forEach(el => el.remove());
  updatePlatformCheck(null);
}

function addPendingHistoryItem(filePath) {
  historyList.querySelectorAll('.hist-item').forEach(item => {
    if (item.dataset.path === filePath) item.remove();
  });
  
  const fileObj = files.find(f => f.path === filePath);
  const name = fileObj ? fileName(fileObj.path) : 'Unknown';
  
  const empty = historyList.querySelector('.history-empty');
  if (empty) empty.remove();
  
  const item = document.createElement('div');
  item.className = 'hist-item'; // TANPA active — Processing tidak boleh biru
  item.dataset.path = filePath;
  item.style.borderRadius = 'var(--radius-sm)';
  item.style.gap = '4px';
  item.style.cursor = 'pointer';
  item.style.border = '1px solid transparent';
  
  item.innerHTML = `
    <span class="hist-item-name">${name}</span>
    <div class="hist-item-stats">
      <span class="hist-val-lufs" style="color: var(--w-orange)">Processing...</span>
    </div>
  `;
  
  item.addEventListener('click', () => {
    if (isAnalyzing || isExporting) {
      customAlert("File ini masih dalam proses analisis. Harap tunggu hingga selesai.");
      return;
    }
    setActiveFile(filePath);
  });
  
  historyList.insertBefore(item, historyList.firstChild);
  // JANGAN hapus active dari item lain — biarkan yang terakhir berhasil tetap biru
}

function resetDisplay() {
  mainVal.textContent = '--.-';
  mainVal.style.color = 'var(--w-text)';
  badge.className = 'readout-badge';
  badgeText.textContent = 'READY';
  statLra.textContent   = '--.- LU';
  statTp.textContent    = '--.- dBTP';
  statShort.textContent = '--.- LUFS';
  statMom.textContent   = '--.- LUFS';
  tpFill.style.width = '0%';
  tpFill.className = 'tp-fill';
  tpValue.textContent = '--.- dBTP';

  // Reset meter bars
  ['bL', 'bR', 'bInt', 'bST', 'bMom'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.querySelectorAll('.v-seg').forEach(s => { s.style.height = '0%'; });
  });

  // Reset SVG graph
  lufsSvg.querySelectorAll('.svg-curve, .svg-fill').forEach(el => el.remove());

  // Reset platform list
  updatePlatformCheck(null);
}

// ============================================================
//  NORMALIZE / EXPORT
// ============================================================
async function runNormalizeBatch() {
  if (files.length === 0) {
    setStatus('error', 'No file loaded');
    return;
  }

  if (isExporting) {
    cancelBatch = true;
    invoke('cancel_ffmpeg').catch(e => console.error("Cancel failed", e));
    const btnExport = $('btn-analyze');
    if (btnExport) {
      btnExport.innerHTML = '<i class="ti ti-loader"></i> Canceling...';
      btnExport.disabled = true;
    }
    return;
  }
  
  if (isAnalyzing) {
    customAlert("Proses sedang berjalan. Harap tunggu atau batalkan terlebih dahulu.");
    return;
  }

  const unanalyzed = files.filter(f => !f.result);
  if (unanalyzed.length > 0) {
    customAlert('Silahkan analisis dulu audionya (klik tombol Analyze) sebelum melakukan Export Normalized.');
    return;
  }

  const btnExport = $('btn-analyze');

  const outDir = await window.__TAURI__.dialog.open({
    directory: true,
    multiple: false,
    title: 'Select Export Folder'
  });

  if (!outDir) return;

  isExporting = true;
  cancelBatch = false;
  userBrowsingHistory = false; // Reset browsing flag when starting
  tSlider.disabled = true;

  if (btnExport) {
    btnExport.innerHTML = '<i class="ti ti-player-stop-filled"></i> Cancel Export';
    btnExport.style.backgroundColor = '#d32f2f';
    btnExport.style.color = '#ffffff';
  }

  let successCount = 0;
  totalBatchFiles = files.length;
  currentAction = 'export';

  // Tentukan folder output unik sebelum loop agar tidak overwrite
  const safeDir = await invoke('get_unique_output_dir', {
    baseDir: outDir,
    folderName: 'LUFS METER OUTPUT',
  });
  console.log(`[EXPORT] Output folder: ${safeDir}`);

  for (const f of files) {
    if (cancelBatch) break;
    currentBatchIndex = successCount;
    setActiveFile(f.path);
    
    try {
      // Auto analyze if needed
      if (!f.result) {
        if (!autoAnalyzeEnabled) {
          throw new Error("File must be analyzed first");
        }
        setStatus('busy', `Analyzing ${successCount + 1}/${files.length}…`);
        setAnalyzingDisplay('ANALYZING...');
        addPendingHistoryItem(f.path);
        startMeterAnimation();
        
        currentAction = 'analyze';
        const res = await invoke('analyze_file', {
          filePath: f.path,
          targetLufs: targetLufs,
        });
        currentAction = 'export';
        
        stopMeterAnimation();
        f.result = res;
        renderResults(res);
        addHistoryItem(res, f.path);
      }

      setStatus('busy', `Exporting ${successCount + 1}/${files.length}…`);
      setAnalyzingDisplay('EXPORTING...');
      startMeterAnimation();

      // Force output extension to .wav since we use pcm_s24le codec
      let fileName = f.path.split(/[\\/]/).pop();
      let sep = safeDir.includes('/') ? '/' : '\\';
      let outPath = safeDir + sep + baseName + '.wav';

      // Pastikan cancel flag bersih sebelum mulai
      cancelBatch = false;
      
      console.log(`[EXPORT] Starting: ${baseName}, LUFS: ${f.result.input_lufs}, Target: ${targetLufs}, Output: ${outPath}`);
      
      await invoke('normalize_file', {
        inputPath: f.path,
        outputPath: outPath,
        targetLufs: targetLufs,
        currentLufs: f.result.input_lufs,
        duration: f.result.duration_secs,
      });

      stopMeterAnimation();
      renderResults(f.result);
      addHistoryItem(f.result, f.path);

      successCount++;
      console.log(`[EXPORT] Success: ${f.path.split(/[\\/]/).pop()} (${successCount}/${files.length})`);
      
      // Beri jeda 500ms agar ffmpeg benar-benar selesai dan OS lepas file handle
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      stopMeterAnimation();
      historyList.querySelectorAll('.hist-item').forEach(item => {
        if (item.dataset.path === f.path && item.innerHTML.includes('Processing...')) {
          item.remove();
        }
      });
      if (e === 'Canceled' || cancelBatch) {
        break;
      }
      const errMsg = typeof e === 'string' ? e : (e.message || String(e));
      console.error(`[EXPORT ERROR] File: ${f.path.split(/[\\/]/).pop()}, Error: ${errMsg}`);
      setStatus('error', `Export gagal: ${f.path.split(/[\\/]/).pop()}`, errMsg);
      // Beri jeda sebelum lanjut ke file berikutnya
      await new Promise(r => setTimeout(r, 500));
    }
  }

  stopMeterAnimation();
  isExporting = false;
  tSlider.disabled = false;
  if (btnExport) {
    btnExport.disabled = false;
    btnExport.innerHTML = '<i class="ti ti-download"></i> Export Normalized';
    btnExport.style.backgroundColor = '';
    btnExport.style.color = '';
  }

  if (cancelBatch) {
    setStatus('', 'Export canceled', `Exported ${successCount} files before canceling`);
  } else if (successCount < files.length) {
    setStatus('error', 'Export finished with errors', `Exported ${successCount} of ${files.length}. Check terminal or retry 1 by 1 to see exact error.`);
  } else {
    setStatus('', 'Export complete', `Successfully exported ${successCount} of ${files.length} files`);
  }

  // Set warna biru ke file terakhir yang diproses
  if (currentFile) {
    setActiveFile(currentFile);
  }
}




// ============================================================
//  BUTTON EVENT BINDINGS
// ============================================================
$('btn-open').addEventListener('click', openFileDialog);
$('btn-analyze').addEventListener('click', () => {
  if (isAnalyzing || isExporting) {
    customAlert("Proses sedang berjalan. Harap tunggu atau batalkan terlebih dahulu.");
    return;
  }
  if (files.length === 0) {
    customAlert("Tidak ada file untuk diexport. Buka file terlebih dahulu.");
    return;
  }
  runNormalizeBatch();
});

$('btn-analyze-right').addEventListener('click', runAnalysis);
$('btn-export').addEventListener('click', exportReport);
$('btn-clear-files').addEventListener('click', clearAllFiles);

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  resetDisplay();
  setStatus('', 'Ready', 'No file loaded');
  tNum.textContent = targetLufs.toFixed(1);

  // Listen for progress events from backend
  /* DISABLED PROGRESS:
  listen('ffmpeg-progress', (e) => {
    // ...
  });
  */
});

// ============================================================
//  UI LOCKDOWN DURING PROCESSING
// ============================================================
document.addEventListener('click', (e) => {
  if (!isAnalyzing && !isExporting) return;
  
  const target = e.target;
  
  // BLOKIR elemen yang bisa mengganggu proses
  const isListClick = target.closest('.hist-item, .file-row');
  const isDangerousBtn = target.closest('#btn-open, #btn-export, #btn-clear-files, #tSlider, .chip, .mode-btn, .btn-remove-file');
  
  if (isListClick) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const actionName = isAnalyzing ? "analisis" : "export";
    customAlert(`Proses ${actionName} sedang berlangsung, mohon tunggu sampai semua daftar antrean audio berhasil diproses.`);
  } else if (isDangerousBtn) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    customAlert("Proses sedang berjalan. Harap tunggu atau batalkan terlebih dahulu.");
  }
}, true); // Use capture phase
