// Flow3D Studio Client Application

const API_BASE = window.location.origin;

const state = {
  modality: 'threejs',
  search: '',
  page: 1,
  limit: 20,
  totalPages: 1,
  activeAsset: null,
  aspectRatio: '16:9',
  destinationDir: '',
  stats: null
};

// DOM Elements
const statsBadge = document.getElementById('stats-badge');
const assetList = document.getElementById('asset-list');
const assetCount = document.getElementById('asset-count');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageIndicator = document.getElementById('page-indicator');
const modalityTabs = document.getElementById('modality-tabs');

const activeSceneTitle = document.getElementById('active-scene-title');
const activeSceneFormat = document.getElementById('active-scene-format');
const sceneFrame = document.getElementById('scene-frame');
const viewportOverlay = document.getElementById('viewport-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayDesc = document.getElementById('overlay-desc');

const destinationDirInput = document.getElementById('destination-dir-input');
const btnBrowseFolder = document.getElementById('btn-browse-folder');
const btnRenderTurntable = document.getElementById('btn-render-turntable');
const selectDuration = document.getElementById('select-duration');
const renderFeedback = document.getElementById('render-feedback');
const progressBarFill = document.getElementById('progress-bar-fill');
const renderStatusMsg = document.getElementById('render-status-msg');

const promptInput = document.getElementById('prompt-input');
const btnGenerate3D = document.getElementById('btn-generate-3d');
const codeEditor = document.getElementById('code-editor');
const btnApplyCode = document.getElementById('btn-apply-code');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnExportFile = document.getElementById('btn-export-file');

const metaId = document.getElementById('meta-id');
const metaDomain = document.getElementById('meta-domain');
const metaStyle = document.getElementById('meta-style');
const metaDescription = document.getElementById('meta-description');

// 1. Initialize Application
async function init() {
  setupEventListeners();
  await fetchStats();
  await loadAssets();
}

// 2. Fetch Stats
async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const data = await res.json();
    state.stats = data;
    if (statsBadge && data.total_models) {
      statsBadge.textContent = `${data.total_models.toLocaleString()} Procedural Assets`;
    }
  } catch (err) {
    console.error('Failed to fetch stats:', err);
  }
}

// 3. Load Assets List
async function loadAssets() {
  assetList.innerHTML = '<div class="loading-spinner">Loading assets...</div>';
  try {
    const params = new URLSearchParams({
      modality: state.modality,
      search: state.search,
      page: state.page,
      limit: state.limit
    });
    const res = await fetch(`${API_BASE}/api/assets?${params.toString()}`);
    const data = await res.json();

    state.totalPages = data.total_pages || 1;
    state.page = data.page || 1;

    assetCount.textContent = `${data.total.toLocaleString()} models`;
    pageIndicator.textContent = `Page ${state.page} / ${state.totalPages}`;
    prevPageBtn.disabled = state.page <= 1;
    nextPageBtn.disabled = state.page >= state.totalPages;

    renderAssetList(data.items);

    // Auto load first item if none active
    if (!state.activeAsset && data.items.length > 0) {
      selectAsset(data.items[0]);
    }
  } catch (err) {
    assetList.innerHTML = `<div class="error-msg">Error loading assets: ${err.message}</div>`;
  }
}

// 4. Render Asset Cards
function renderAssetList(items) {
  if (!items || items.length === 0) {
    assetList.innerHTML = '<div class="empty-msg">No matching procedural models found.</div>';
    return;
  }

  assetList.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = `asset-card ${state.activeAsset && state.activeAsset.id === item.id ? 'active' : ''}`;
    
    let pillClass = `pill-${item.modality}`;
    let modLabel = item.modality.toUpperCase();

    card.innerHTML = `
      <div class="asset-title" title="${item.name}">${item.name}</div>
      <div class="asset-meta-row">
        <span class="modality-pill ${pillClass}">${modLabel}</span>
        <span class="asset-type">${item.type.split(' ')[0]}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.asset-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectAsset(item);
    });

    assetList.appendChild(card);
  });
}

// 5. Select Asset & Load Content
async function selectAsset(item) {
  state.activeAsset = item;
  activeSceneTitle.textContent = item.name;
  activeSceneFormat.textContent = item.type;

  metaId.textContent = item.id;
  metaDomain.textContent = item.modality === 'threejs' ? 'Interactive WebGL' : 'Parametric Solid CAD';

  try {
    const res = await fetch(`${API_BASE}/api/assets/${item.modality}/${encodeURIComponent(item.id)}`);
    const data = await res.json();

    codeEditor.value = data.code || '';
    
    if (data.captions) {
      metaStyle.textContent = data.captions.style || 'Parametric';
      metaDescription.textContent = data.captions.user_instruction || data.captions.instruction || 'Procedural WebGL asset.';
    } else if (data.meta && data.meta.captions) {
      metaStyle.textContent = 'CSG Mechanical';
      metaDescription.textContent = data.meta.captions.detailed || data.meta.captions.instruction || 'Parametric solid model.';
    } else {
      metaStyle.textContent = 'Procedural';
      metaDescription.textContent = 'Procedural 3D model with native parametric generation logic.';
    }

    if (item.modality === 'threejs' && data.code) {
      viewportOverlay.classList.add('hidden');
      sceneFrame.style.display = 'block';
      sceneFrame.srcdoc = data.code;
    } else {
      sceneFrame.style.display = 'none';
      viewportOverlay.classList.remove('hidden');
      overlayTitle.textContent = item.name;
      overlayDesc.textContent = `This model is authored in ${item.type}. You can inspect and edit the source code on the right panel or export it to disk.`;
    }
  } catch (err) {
    console.error('Error fetching asset detail:', err);
  }
}

// 6. Setup Event Listeners
function setupEventListeners() {
  // Modality Tabs
  modalityTabs.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-btn')) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.modality = e.target.dataset.modality;
      state.page = 1;
      loadAssets();
    }
  });

  // Search Input with Debounce
  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.search = searchInput.value.trim();
      state.page = 1;
      loadAssets();
    }, 250);
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.search = '';
    state.page = 1;
    loadAssets();
  });

  // Pagination
  prevPageBtn.addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      loadAssets();
    }
  });

  nextPageBtn.addEventListener('click', () => {
    if (state.page < state.totalPages) {
      state.page++;
      loadAssets();
    }
  });

  // Aspect Ratio Buttons
  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.aspectRatio = btn.dataset.ratio;
    });
  });

  // Native Folder Picker
  btnBrowseFolder.addEventListener('click', async () => {
    btnBrowseFolder.disabled = true;
    btnBrowseFolder.textContent = 'Browsing...';
    try {
      const res = await fetch(`${API_BASE}/api/pick-folder`);
      const data = await res.json();
      if (data.path) {
        state.destinationDir = data.path;
        destinationDirInput.value = data.path;
      }
    } catch (err) {
      alert(`Folder browser error: ${err.message}`);
    } finally {
      btnBrowseFolder.disabled = false;
      btnBrowseFolder.textContent = '📁 Save to...';
    }
  });

  // Turntable Video Render
  btnRenderTurntable.addEventListener('click', async () => {
    renderFeedback.classList.remove('hidden');
    progressBarFill.style.width = '35%';
    renderStatusMsg.textContent = 'Synthesizing 360° turntable video sequence with normalized PTS...';
    btnRenderTurntable.disabled = true;

    try {
      const payload = {
        scene_id: state.activeAsset ? state.activeAsset.id : 'custom_scene',
        aspect_ratio: state.aspectRatio,
        duration: selectDuration.value,
        destination_dir: destinationDirInput.value.trim() || undefined,
        filename: `flow3d_${Date.now()}_${state.aspectRatio.replace(':', 'x')}.mp4`
      };

      const res = await fetch(`${API_BASE}/api/turntable/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        progressBarFill.style.width = '100%';
        renderStatusMsg.textContent = `Turntable exported successfully to: ${data.output_path}`;
      } else {
        throw new Error(data.error || 'Render failed');
      }
    } catch (err) {
      progressBarFill.style.width = '100%';
      progressBarFill.style.background = '#f43f5e';
      renderStatusMsg.textContent = `Render Error: ${err.message}`;
    } finally {
      btnRenderTurntable.disabled = false;
    }
  });

  // AI Prompt-to-3D Synthesis
  btnGenerate3D.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      alert('Please enter a 3D prompt first.');
      return;
    }

    btnGenerate3D.disabled = true;
    btnGenerate3D.innerHTML = '<span class="btn-icon">⚡</span> Synthesizing...';

    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, modality: 'threejs' })
      });
      const data = await res.json();

      if (data.success && data.result) {
        activeSceneTitle.textContent = data.result.title;
        activeSceneFormat.textContent = 'Three.js AI Generated';
        codeEditor.value = data.result.code;

        viewportOverlay.classList.add('hidden');
        sceneFrame.style.display = 'block';
        sceneFrame.srcdoc = data.result.code;

        metaId.textContent = 'ai_synthesis_' + Date.now();
        metaDomain.textContent = 'AI Procedural WebGL';
        metaStyle.textContent = 'Cyberpunk Hyper-Structure';
        metaDescription.textContent = `Generated from prompt: "${prompt}"`;
      }
    } catch (err) {
      alert(`Synthesis error: ${err.message}`);
    } finally {
      btnGenerate3D.disabled = false;
      btnGenerate3D.innerHTML = '<span class="btn-icon">✨</span> Synthesize 3D Model';
    }
  });

  // Exemplar Chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      promptInput.value = chip.dataset.prompt;
      btnGenerate3D.click();
    });
  });

  // Right Sidebar Tabs
  document.querySelectorAll('.right-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.right-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.pane).classList.add('active');
    });
  });

  // Code Hot-Reload
  btnApplyCode.addEventListener('click', () => {
    const updatedCode = codeEditor.value;
    if (updatedCode) {
      viewportOverlay.classList.add('hidden');
      sceneFrame.style.display = 'block';
      sceneFrame.srcdoc = updatedCode;
    }
  });

  // Copy Code
  btnCopyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(codeEditor.value);
    btnCopyCode.textContent = 'Copied!';
    setTimeout(() => { btnCopyCode.textContent = 'Copy'; }, 1500);
  });

  // Export File
  btnExportFile.addEventListener('click', async () => {
    const code = codeEditor.value;
    const dest = destinationDirInput.value.trim() || undefined;
    const filename = `${state.activeAsset ? state.activeAsset.id : 'export'}_${Date.now()}.html`;

    try {
      const res = await fetch(`${API_BASE}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, destination_dir: dest, filename })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Exported file saved to: ${data.file_path}`);
      }
    } catch (err) {
      alert(`Export error: ${err.message}`);
    }
  });

  // Viewport Toolbar Buttons
  document.getElementById('btn-reload-scene').addEventListener('click', () => {
    btnApplyCode.click();
  });
}

// Start Application
window.addEventListener('DOMContentLoaded', init);
