// [FL_INDEX: keywords="vibe_arcade, app_js, client_engine, arcade_launcher, sandboxed_iframe, favorites_manager" | purpose="Frontend client engine for Flowork Vibe Arcade managing game discovery, dynamic filtering, offline playback, and sandboxed arcade cabinet emulation"]

(function() {
  'use strict';

  const state = {
    allGames: [],
    favorites: [],
    activeFilter: 'all',
    searchQuery: '',
    sortOrder: 'score_desc',
    activeGame: null,
    proxyEnabled: false
  };

  // DOM Elements
  const gamesGrid = document.getElementById('gamesGrid');
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const sortSelect = document.getElementById('sortSelect');
  const filterPills = document.querySelectorAll('.fl-filter-pill');

  // Stats Elements
  const statCatalogCount = document.getElementById('statCatalogCount');
  const statOfflineCount = document.getElementById('statOfflineCount');
  const statFavCount = document.getElementById('statFavCount');

  // Player Elements
  const playerModal = document.getElementById('playerModal');
  const playerGameTitle = document.getElementById('playerGameTitle');
  const playerGameMeta = document.getElementById('playerGameMeta');
  const playerGameDesc = document.getElementById('playerGameDesc');
  const gameIframe = document.getElementById('gameIframe');
  const playerLoadingNotice = document.getElementById('playerLoadingNotice');
  const playerLoadingText = document.getElementById('playerLoadingText');
  const btnClosePlayer = document.getElementById('btnClosePlayer');
  const btnToggleFullscreen = document.getElementById('btnToggleFullscreen');
  const btnOpenExternal = document.getElementById('btnOpenExternal');
  const btnToggleProxy = document.getElementById('btnToggleProxy');
  const btnDownloadInPlayer = document.getElementById('btnDownloadInPlayer');
  const playerFrameContainer = document.getElementById('playerFrameContainer');
  const playerFrameFallback = document.getElementById('playerFrameFallback');
  const btnFallbackProxy = document.getElementById('btnFallbackProxy');
  const btnFallbackDownload = document.getElementById('btnFallbackDownload');
  const btnFallbackExternal = document.getElementById('btnFallbackExternal');

  // -------------------------------------------------------------------
  // Dynamic API Base Resolution for Cockpit Supervisor & Direct Ports
  // -------------------------------------------------------------------
  let API_BASE = '';

  async function resolveApiBase(forceRefresh = false) {
    if (API_BASE && !forceRefresh) return API_BASE;

    const host = window.location.hostname || '127.0.0.1';

    // 1. Direct port probe if loaded directly from engine port (not Cockpit supervisor 19890)
    if (window.location.port && window.location.port !== '19890' && window.location.port !== '80' && window.location.port !== '443') {
      try {
        const testRes = await fetch(`${window.location.origin}/api/status`, { signal: AbortSignal.timeout(600) });
        if (testRes.ok) {
          API_BASE = window.location.origin;
          return API_BASE;
        }
      } catch (_) {}
    }

    // 2. Check URL query param ?port=xxxx (passed by Cockpit supervisor iframe)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const paramPort = urlParams.get('port');
      if (paramPort && paramPort !== '19890') {
        try {
          const testParam = await fetch(`http://${host}:${paramPort}/api/status`, { signal: AbortSignal.timeout(600) });
          if (testParam.ok) {
            API_BASE = `http://${host}:${paramPort}`;
            return API_BASE;
          }
        } catch (_) {}
        try {
          const testParamLocal = await fetch(`http://127.0.0.1:${paramPort}/api/status`, { signal: AbortSignal.timeout(600) });
          if (testParamLocal.ok) {
            API_BASE = `http://127.0.0.1:${paramPort}`;
            return API_BASE;
          }
        } catch (_) {}
      }
    } catch (_) {}

    // 3. Query Cockpit supervisor for plugin dynamic port
    const supervisorPorts = [
      (window.location.port && window.location.port !== '80' && window.location.port !== '443') ? window.location.port : '19890',
      '19890'
    ];
    for (const p of supervisorPorts) {
      try {
        const res = await fetch(`http://${host}:${p}/api/plugins/vibe-arcade/status`, { signal: AbortSignal.timeout(800) });
        if (res.ok) {
          const info = await res.json();
          if (info && info.port) {
            API_BASE = `http://${host}:${info.port}`;
            return API_BASE;
          }
        }
      } catch (_) {}
      try {
        const res = await fetch(`http://127.0.0.1:${p}/api/plugins/vibe-arcade/status`, { signal: AbortSignal.timeout(800) });
        if (res.ok) {
          const info = await res.json();
          if (info && info.port) {
            API_BASE = `http://127.0.0.1:${info.port}`;
            return API_BASE;
          }
        }
      } catch (_) {}
    }

    // 4. Probe default Vibe Arcade port 18050
    try {
      const probe18050 = await fetch(`http://${host}:18050/api/status`, { signal: AbortSignal.timeout(800) });
      if (probe18050.ok) {
        API_BASE = `http://${host}:18050`;
        return API_BASE;
      }
    } catch (_) {}
    try {
      const probe18050Local = await fetch(`http://127.0.0.1:18050/api/status`, { signal: AbortSignal.timeout(800) });
      if (probe18050Local.ok) {
        API_BASE = `http://127.0.0.1:18050`;
        return API_BASE;
      }
    } catch (_) {}

    // 5. Fallback default
    API_BASE = `http://${host}:18050`;
    return API_BASE;
  }

  // Pre-resolve immediately
  resolveApiBase().catch(() => {});

  // Fetch API Helper
  function api(endpoint) {
    const base = API_BASE || `http://${window.location.hostname || '127.0.0.1'}:18050`;
    const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${base}${clean}`;
  }

  // Load Initial Games & Favorites with resilient retry
  async function init() {
    await resolveApiBase();

    // 1. Fetch Favorites
    try {
      const favRes = await fetch(api('/api/favorites'), { signal: AbortSignal.timeout(3000) });
      if (favRes.ok) {
        const favData = await favRes.json();
        state.favorites = favData.favorites || [];
      }
    } catch (err) {
      console.warn('[Vibe Arcade] Initial favorites load notice:', err);
    }

    // 2. Fetch Games Catalog with resilient multi-attempt probe
    let loaded = false;
    let lastError = '';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (attempt > 1) {
          await resolveApiBase(true);
        }
        const gamesRes = await fetch(api('/api/games'), { signal: AbortSignal.timeout(4000) });
        if (gamesRes.ok) {
          const data = await gamesRes.json();
          if (data && Array.isArray(data.games)) {
            state.allGames = data.games;
            updateStats();
            renderGames();
            loaded = true;
            break;
          }
        } else {
          lastError = `HTTP ${gamesRes.status} from ${api('/api/games')}`;
        }
      } catch (err) {
        lastError = err.message || 'Connection failure';
      }
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    if (!loaded) {
      showError(`Failed to load games catalog from server (${lastError}). API Base: ${API_BASE || 'unresolved'}`);
    }
  }

  function updateStats() {
    if (statCatalogCount) statCatalogCount.textContent = state.allGames.length;
    const offlineCount = state.allGames.filter(g => g.offline_url || g.is_offline_bundled).length;
    if (statOfflineCount) statOfflineCount.textContent = offlineCount;
    if (statFavCount) statFavCount.textContent = state.favorites.length;
  }

  function showError(msg) {
    if (!gamesGrid) return;
    gamesGrid.innerHTML = `
      <div class="fl-loading-state" style="color: var(--accent-rose); padding: 40px 20px;">
        <div style="font-size: 36px; margin-bottom: 8px;">⚠️</div>
        <div style="font-size: 15px; font-weight: 600; color: #fff;">Catalog Connection Notice</div>
        <div style="font-size: 12px; color: var(--text-muted); max-width: 500px; margin: 8px auto 16px auto; word-break: break-all;">${msg}</div>
        <button onclick="location.reload()" class="fl-btn-pill" style="margin: 4px; padding: 6px 18px; cursor: pointer;">
          ↻ Retry Connection
        </button>
      </div>
    `;
  }

  // Filter & Sort Logic
  function getFilteredGames() {
    let list = [...state.allGames];

    // Filter by Pill
    if (state.activeFilter === 'opus-5.5') {
      list = list.filter(g => (g.made_with || '').toLowerCase().includes('opus'));
    } else if (state.activeFilter === 'astra') {
      list = list.filter(g => (g.made_with || '').toLowerCase().includes('astra'));
    } else if (state.activeFilter === 'sonnet-5.5') {
      list = list.filter(g => (g.made_with || '').toLowerCase().includes('sonnet'));
    } else if (state.activeFilter === 'offline') {
      list = list.filter(g => g.offline_url || g.is_offline_bundled);
    } else if (state.activeFilter === 'favorites') {
      list = list.filter(g => state.favorites.includes(g.id));
    }

    // Search Query
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter(g =>
        (g.title && g.title.toLowerCase().includes(q)) ||
        (g.description && g.description.toLowerCase().includes(q)) ||
        (g.made_with && g.made_with.toLowerCase().includes(q))
      );
    }

    // Sort
    if (state.sortOrder === 'score_desc') {
      list.sort((a, b) => (b.screenshot_score || 0) - (a.screenshot_score || 0));
    } else if (state.sortOrder === 'score_asc') {
      list.sort((a, b) => (a.screenshot_score || 0) - (b.screenshot_score || 0));
    } else if (state.sortOrder === 'title_asc') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    return list;
  }

  // Render Game Cards
  function renderGames() {
    if (!gamesGrid) return;
    const games = getFilteredGames();

    if (games.length === 0) {
      gamesGrid.innerHTML = `
        <div class="fl-loading-state">
          <div style="font-size: 36px;">🕹️</div>
          <div style="font-size: 15px; font-weight: bold; color: var(--text-primary);">No Games Match Your Filter</div>
          <div style="font-size: 11px; color: var(--text-muted);">Try adjusting your search terms or selecting 'All Games'.</div>
        </div>
      `;
      return;
    }

    gamesGrid.innerHTML = '';
    const frag = document.createDocumentFragment();

    games.forEach(g => {
      const card = document.createElement('div');
      card.className = 'fl-game-card';
      card.dataset.gameId = g.id;

      const isFav = state.favorites.includes(g.id);
      const isOffline = !!g.offline_url || g.is_offline_bundled;
      const modelClass = (g.made_with || '').includes('opus') ? 'opus' : ((g.made_with || '').includes('astra') ? 'astra' : 'sonnet');
      const modelLabel = g.made_with ? g.made_with.toUpperCase() : 'AI VIBE';

      // Screenshot URL (from GitHub repo or fallback)
      let thumbHtml = '';
      if (g.screenshot_path) {
        const rawThumbUrl = `https://raw.githubusercontent.com/VibeFin/awesome-opus-5.5-games/main/${g.screenshot_path.replace(/^\//, '')}`;
        thumbHtml = `<img src="${rawThumbUrl}" alt="${g.title}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'fl-thumb-placeholder\\'><span>🎮</span></div>';">`;
      } else {
        thumbHtml = `<div class="fl-thumb-placeholder"><span>🕹️</span></div>`;
      }

      card.innerHTML = `
        <div class="fl-game-thumb">
          ${thumbHtml}
          <button class="fl-btn-fav ${isFav ? 'active' : ''}" title="Bookmark favorite" data-fav-id="${g.id}">
            ${isFav ? '❤️' : '🤍'}
          </button>
          <div class="fl-thumb-badge-score">★ ${(g.screenshot_score || 9.0).toFixed(1)}</div>
          <div class="fl-thumb-badge-model ${modelClass}">${modelLabel}</div>
        </div>
        <div class="fl-game-info">
          <div class="fl-game-title">${g.title || 'Untitled Game'}</div>
          <div class="fl-game-desc">${g.description || 'Interactive AI vibe-coded browser experience.'}</div>
          <div class="fl-card-actions">
            <button class="fl-btn-play" data-play-id="${g.id}">
              <span>▶</span> Play ${isOffline ? 'Offline' : 'Now'}
            </button>
            ${isOffline ? `<div class="fl-btn-offline-badge" title="Bundled for instant offline play">⚡ Offline Ready</div>` : `
              <button class="fl-btn-dl" data-dl-id="${g.id}" title="Download to local disk for offline play">
                📥 Download
              </button>
            `}
          </div>
        </div>
      `;

      frag.appendChild(card);
    });

    gamesGrid.appendChild(frag);
  }

  // Favorite Toggle
  async function toggleFavorite(gameId) {
    const isFav = state.favorites.includes(gameId);
    const newStatus = !isFav;

    if (newStatus) {
      state.favorites.push(gameId);
    } else {
      state.favorites = state.favorites.filter(id => id !== gameId);
    }
    updateStats();
    renderGames();

    try {
      await fetch(api('/api/favorites'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, favorite: newStatus })
      });
    } catch (_) {}
  }

  // On-Demand Game Downloader
  async function downloadGame(gameId, buttonEl) {
    const game = state.allGames.find(g => g.id === gameId);
    if (!game) return;

    if (buttonEl) {
      buttonEl.textContent = '⏳ Caching...';
      buttonEl.classList.add('downloading');
    }

    try {
      const res = await fetch(api('/api/games/download'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        game.offline_url = data.offline_url;
        game.is_offline_bundled = true;
        updateStats();
        renderGames();
        if (state.activeGame && state.activeGame.id === gameId) {
          launchGame(gameId);
        }
      } else {
        alert('Download notice: ' + (data.error || 'Server could not scrape source'));
        if (buttonEl) {
          buttonEl.textContent = '📥 Download';
          buttonEl.classList.remove('downloading');
        }
      }
    } catch (err) {
      alert('Network failure during download: ' + err.message);
      if (buttonEl) {
        buttonEl.textContent = '📥 Download';
        buttonEl.classList.remove('downloading');
      }
    }
  }

  // Launch Game in In-App Player
  function launchGame(gameId, useProxy = null) {
    const game = state.allGames.find(g => g.id === gameId);
    if (!game) return;

    if (useProxy !== null) {
      state.proxyEnabled = useProxy;
    }

    state.activeGame = game;
    playerGameTitle.textContent = game.title || 'Untitled Game';
    if (playerFrameFallback) playerFrameFallback.style.display = 'none';
    
    const isOffline = !!game.offline_url || game.is_offline_bundled;
    playerGameMeta.textContent = `${(game.made_with || 'AI').toUpperCase()} • Score: ${(game.screenshot_score || 9.0).toFixed(1)} • ${isOffline ? '⚡ OFFLINE STANDALONE' : '🌐 WEB DEPLOYED'}`;
    playerGameDesc.textContent = game.description || '';

    // Header buttons
    if (btnToggleProxy) {
      if (isOffline) {
        btnToggleProxy.style.display = 'none';
      } else {
        btnToggleProxy.style.display = 'inline-flex';
        btnToggleProxy.textContent = state.proxyEnabled ? '⚡ Proxy Shield: ON' : '⚡ Proxy Shield: OFF';
        if (state.proxyEnabled) {
          btnToggleProxy.classList.add('highlight');
        } else {
          btnToggleProxy.classList.remove('highlight');
        }
      }
    }

    if (btnDownloadInPlayer) {
      btnDownloadInPlayer.style.display = isOffline ? 'none' : 'inline-flex';
      btnDownloadInPlayer.textContent = '📥 Save Offline';
      btnDownloadInPlayer.classList.remove('downloading');
    }

    // Determine launch URL
    let launchUrl = '';
    if (isOffline) {
      launchUrl = api(game.offline_url);
    } else if (state.proxyEnabled) {
      launchUrl = api(`/api/proxy?url=${encodeURIComponent(game.play_url)}`);
    } else {
      launchUrl = game.play_url;
    }

    let hostLabel = 'sandbox';
    try {
      hostLabel = new URL(launchUrl, window.location.href).hostname || 'sandbox';
    } catch (_) {}

    playerLoadingText.textContent = isOffline ? 'Loading offline standalone title...' : `Connecting to sandbox (${hostLabel})...`;
    playerLoadingNotice.style.display = 'flex';

    gameIframe.src = launchUrl;
    playerModal.style.display = 'flex';

    gameIframe.onload = () => {
      setTimeout(() => {
        playerLoadingNotice.style.display = 'none';
        try { gameIframe.focus(); } catch (_) {}
      }, 300);
    };

    // Safety timeout in case external site hides load event
    setTimeout(() => {
      if (playerLoadingNotice) playerLoadingNotice.style.display = 'none';
    }, 2800);
  }

  function closePlayer() {
    if (playerModal) playerModal.style.display = 'none';
    if (gameIframe) gameIframe.src = '';
    state.activeGame = null;
    state.proxyEnabled = false;
  }

  // Event Listeners
  if (gamesGrid) {
    gamesGrid.addEventListener('click', (e) => {
      const playBtn = e.target.closest('[data-play-id]');
      if (playBtn) {
        launchGame(playBtn.dataset.playId);
        return;
      }
      const favBtn = e.target.closest('[data-fav-id]');
      if (favBtn) {
        toggleFavorite(favBtn.dataset.favId);
        return;
      }
      const dlBtn = e.target.closest('[data-dl-id]');
      if (dlBtn) {
        downloadGame(dlBtn.dataset.dlId, dlBtn);
        return;
      }
    });
  }

  // Search Input
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      if (btnClearSearch) {
        btnClearSearch.style.display = state.searchQuery ? 'block' : 'none';
      }
      renderGames();
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      searchInput.value = '';
      state.searchQuery = '';
      btnClearSearch.style.display = 'none';
      renderGames();
    });
  }

  // Filters
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.activeFilter = pill.dataset.filter || 'all';
      renderGames();
    });
  });

  // Sort
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.sortOrder = e.target.value;
      renderGames();
    });
  }

  // Player Actions
  if (btnClosePlayer) {
    btnClosePlayer.addEventListener('click', closePlayer);
  }

  if (btnToggleFullscreen) {
    btnToggleFullscreen.addEventListener('click', () => {
      if (!playerFrameContainer) return;
      if (!document.fullscreenElement) {
        playerFrameContainer.requestFullscreen().catch(err => {
          console.warn('[Fullscreen Request Notice]', err);
        });
      } else {
        document.exitFullscreen();
      }
    });
  }

  if (btnOpenExternal) {
    btnOpenExternal.addEventListener('click', () => {
      if (state.activeGame && state.activeGame.play_url) {
        window.open(state.activeGame.play_url, '_blank');
      }
    });
  }

  if (btnToggleProxy) {
    btnToggleProxy.addEventListener('click', () => {
      if (!state.activeGame) return;
      state.proxyEnabled = !state.proxyEnabled;
      launchGame(state.activeGame.id, state.proxyEnabled);
    });
  }

  if (btnDownloadInPlayer) {
    btnDownloadInPlayer.addEventListener('click', () => {
      if (!state.activeGame) return;
      downloadGame(state.activeGame.id, btnDownloadInPlayer);
    });
  }

  if (btnFallbackProxy) {
    btnFallbackProxy.addEventListener('click', () => {
      if (!state.activeGame) return;
      state.proxyEnabled = true;
      launchGame(state.activeGame.id, true);
    });
  }

  if (btnFallbackDownload) {
    btnFallbackDownload.addEventListener('click', () => {
      if (!state.activeGame) return;
      downloadGame(state.activeGame.id, btnFallbackDownload);
    });
  }

  if (btnFallbackExternal) {
    btnFallbackExternal.addEventListener('click', () => {
      if (state.activeGame && state.activeGame.play_url) {
        window.open(state.activeGame.play_url, '_blank');
      }
    });
  }

  // Keyboards
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && playerModal && playerModal.style.display !== 'none') {
      closePlayer();
    }
  });

  // Start app
  init();

})();
