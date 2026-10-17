// [FLOWORK-OS:SOVEREIGN] Engineered by Flowork OS <agent@floworkos.com>

// Dynamic API Base Resolver for Flowork Canvas Host
let API_BASE = '';

async function resolveApiBase() {
  if (API_BASE) return API_BASE;

  // 1. Check URL search params for explicit port (?port=XXXX)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const explicitPort = urlParams.get('port');
    if (explicitPort) {
      const hostName = window.location.hostname || '127.0.0.1';
      API_BASE = window.location.protocol + '//' + hostName + ':' + explicitPort;
      return API_BASE;
    }
  } catch (_) {}

  // 2. Query Canvas Host plugin status API directly
  try {
    const defaultHostOrigin = window.location.protocol + '//' + (window.location.hostname || '127.0.0.1') + ':19890';
    const hostOrigin = (window.parent && window.parent.location.origin) || window.location.origin || defaultHostOrigin;
    const statusRes = await fetch(hostOrigin + '/api/plugins/whale-radar/status?t=' + Date.now());
    if (statusRes.ok) {
      const info = await statusRes.json();
      if (info && info.port) {
        const hostName = window.location.hostname || '127.0.0.1';
        API_BASE = window.location.protocol + '//' + hostName + ':' + info.port;
        return API_BASE;
      }
    }
  } catch (_) {}

  // 3. Direct same-origin if served on plugin port
  if (window.location.port && window.location.port !== '19890') {
    API_BASE = window.location.protocol + '//' + window.location.hostname + ':' + window.location.port;
    return API_BASE;
  }

  // 4. Fallback to active dynamic port registered in Canvas Host
  const fallbackHost = window.location.hostname || '127.0.0.1';
  API_BASE = window.location.protocol + '//' + fallbackHost + ':39051';
  return API_BASE;
}

// Global Application State
let state = {
  wallets: [],
  transactions: [],
  tickerPrices: {},
  lastOnChainSync: null
};

let activeChainFilter = 'ALL';
let searchQuery = '';

const metricWhalesEl = document.getElementById('metric-whales');
const metricCapitalEl = document.getElementById('metric-capital');
const metricWinrateEl = document.getElementById('metric-winrate');
const metricSwapsEl = document.getElementById('metric-swaps');
const lastSyncLabelEl = document.getElementById('last-sync-label');

const txTbodyEl = document.getElementById('tx-tbody');
const walletCardsContainerEl = document.getElementById('wallet-cards-container');
const badgeWalletCountEl = document.getElementById('badge-wallet-count');
const connectionStatusEl = document.getElementById('connection-status');

const btnRefresh = document.getElementById('btn-refresh');
const btnForceScan = document.getElementById('btn-force-scan');
const addWalletForm = document.getElementById('add-wallet-form');
const selectPreset = document.getElementById('select-preset-wallet');
const tableSearchInput = document.getElementById('table-search');
const filterPills = document.querySelectorAll('.filter-pill');

// Update Tickers Display
function renderTickers() {
  const btcEl = document.getElementById('tick-btc');
  const btcChgEl = document.getElementById('tick-btc-chg');
  const ethEl = document.getElementById('tick-eth');
  const ethChgEl = document.getElementById('tick-eth-chg');
  const solEl = document.getElementById('tick-sol');
  const solChgEl = document.getElementById('tick-sol-chg');
  const bnbEl = document.getElementById('tick-bnb');
  const bnbChgEl = document.getElementById('tick-bnb-chg');

  if (state.tickerPrices.BTC && btcEl) {
    btcEl.textContent = `$${state.tickerPrices.BTC.price}`;
    if (btcChgEl) {
      btcChgEl.textContent = state.tickerPrices.BTC.change;
      btcChgEl.className = state.tickerPrices.BTC.change.startsWith('+') ? 'ticker-delta-up' : 'ticker-delta-down';
    }
  }
  if (state.tickerPrices.ETH && ethEl) {
    ethEl.textContent = `$${state.tickerPrices.ETH.price}`;
    if (ethChgEl) {
      ethChgEl.textContent = state.tickerPrices.ETH.change;
      ethChgEl.className = state.tickerPrices.ETH.change.startsWith('+') ? 'ticker-delta-up' : 'ticker-delta-down';
    }
  }
  if (state.tickerPrices.SOL && solEl) {
    solEl.textContent = `$${state.tickerPrices.SOL.price}`;
    if (solChgEl) {
      solChgEl.textContent = state.tickerPrices.SOL.change;
      solChgEl.className = state.tickerPrices.SOL.change.startsWith('+') ? 'ticker-delta-up' : 'ticker-delta-down';
    }
  }
  if (state.tickerPrices.BNB && bnbEl) {
    bnbEl.textContent = `$${state.tickerPrices.BNB.price}`;
    if (bnbChgEl) {
      bnbChgEl.textContent = state.tickerPrices.BNB.change;
      bnbChgEl.className = state.tickerPrices.BNB.change.startsWith('+') ? 'ticker-delta-up' : 'ticker-delta-down';
    }
  }
}

// Render Header Metrics
function renderMetrics() {
  const mWhales = document.getElementById('metric-whales');
  const mCapital = document.getElementById('metric-capital');
  const mWinrate = document.getElementById('metric-winrate');
  const mSwaps = document.getElementById('metric-swaps');
  const bCount = document.getElementById('badge-wallet-count');
  const lSync = document.getElementById('last-sync-label');

  const totalWhales = state.wallets.length;
  if (mWhales) mWhales.textContent = totalWhales;

  const totalCapital = state.wallets.reduce((acc, w) => acc + (w.balanceUsd || 0), 0);
  if (mCapital) mCapital.textContent = `$${(totalCapital / 1000000).toFixed(1)}M`;

  if (totalWhales > 0) {
    const avgWinRate = state.wallets.reduce((acc, w) => acc + (w.winRate || 0), 0) / totalWhales;
    if (mWinrate) mWinrate.textContent = `${avgWinRate.toFixed(1)}%`;
  } else {
    if (mWinrate) mWinrate.textContent = `0%`;
  }

  if (mSwaps) mSwaps.textContent = state.transactions.length;
  if (bCount) bCount.textContent = `${totalWhales} TITANS`;

  if (lSync && state.lastOnChainSync) {
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(state.lastOnChainSync).getTime()) / 1000));
    lSync.textContent = diffSec < 60 ? `Synced ${diffSec}s ago` : `Synced ${Math.floor(diffSec / 60)}m ago`;
  }
}

// Relative time formatter
function formatTimeRelative(iso) {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Toast Notification Helper
function showToast(message) {
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00f0ff" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2200);
}

// Clipboard Copy Helper
async function copyToClipboard(text, label = 'Wallet address') {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    showToast(`Copied ${label} to clipboard!`);
  } catch (err) {
    console.error('Copy failed:', err);
    prompt('Copy address manually:', text);
  }
}

// Quick Enrol Target to Whitelist directly from telemetry table
async function quickEnrolTarget(label, chain, address) {
  if (!address) return;
  const isAlready = state.wallets.some(w => (w.address || '').toLowerCase() === address.toLowerCase());
  if (isAlready) {
    showToast(`Target already enrolled in Whitelist!`);
    return;
  }

  try {
    const base = await resolveApiBase();
    const res = await fetch(`${base}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_wallet',
        label: label || `Whale (${address.slice(0, 6)})`,
        chain: chain || 'ETH',
        address,
        balanceUsd: 15000000,
        winRate: 88.0
      })
    });
    const resData = await res.json().catch(() => ({}));
    if (res.ok && resData.success !== false) {
      showToast(`Added ${label || address.slice(0, 8)} to Whitelist!`);
      await fetchState();
    } else {
      alert('Failed to enrol: ' + (resData.error || res.statusText));
    }
  } catch (err) {
    showToast('Enrol failed: ' + err.message);
  }
}

// Render Telemetry Table
function renderTransactions() {
  if (!txTbodyEl) return;
  txTbodyEl.innerHTML = '';

  let filtered = state.transactions;
  if (activeChainFilter !== 'ALL') {
    filtered = filtered.filter(t => (t.chain || '').toUpperCase() === activeChainFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(t => 
      (t.tokenOut || '').toLowerCase().includes(q) ||
      (t.walletLabel || '').toLowerCase().includes(q) ||
      (t.walletAddress || '').toLowerCase().includes(q) ||
      (t.txHash || '').toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    txTbodyEl.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding: 32px; color:#64748b; font-family: ui-monospace, SFMono-Regular, monospace;">
          No matching on-chain transactions found. Listening to live decentralized blocks...
        </td>
      </tr>
    `;
    return;
  }

  filtered.slice(0, 30).forEach(tx => {
    const tr = document.createElement('tr');
    const timeRel = formatTimeRelative(tx.timestamp);
    const timeExact = new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const winrateVal = tx.whaleWinRate != null ? `${Number(tx.whaleWinRate).toFixed(1)}%` : '85.0%';
    const changeDelta = tx.change24h != null ? `${tx.change24h >= 0 ? '+' : ''}${Number(tx.change24h).toFixed(2)}%` : null;
    const deltaClass = (tx.change24h || 0) >= 0 ? 'ticker-delta-up' : 'ticker-delta-down';
    const isWhitelisted = state.wallets.some(w => (w.address || '').toLowerCase() === (tx.walletAddress || '').toLowerCase());

    tr.innerHTML = `
      <td>
        <span style="color:#ffffff; font-weight:700; font-family: ui-monospace, monospace;">${timeRel}</span><br>
        <span style="font-size:9px; color:#64748b; font-family: ui-monospace, monospace;">${timeExact}</span>
      </td>
      <td>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
          <strong style="color:#f1f5f9; font-size:11px;">${tx.walletLabel}</strong>
          ${!isWhitelisted && tx.walletAddress ? `<button type="button" class="btn-action-whitelist btn-table-whitelist" title="Add this wallet to Whitelist radar">+ Whitelist</button>` : ''}
        </div>
        <div class="whale-addr-row" style="margin-top:2px;">
          <span style="font-size:9px; color:#00f0ff; font-family: ui-monospace, monospace;">
            ${tx.walletAddress ? tx.walletAddress.slice(0, 6) + '...' + tx.walletAddress.slice(-4) : ''}
          </span>
          ${tx.walletAddress ? `
            <button type="button" class="btn-action-icon btn-copy-addr" title="Copy full wallet address">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>Copy</span>
            </button>
          ` : ''}
        </div>
      </td>
      <td>
        <span class="chain-tag ${tx.chain}">${tx.chain}</span>
        <span style="font-size:10px; color:#94a3b8; margin-left:4px; font-weight:600;">${tx.dex}</span>
      </td>
      <td>
        <span class="token-sym">${tx.tokenOut}</span>
        ${tx.amountTokens ? `<br><span style="font-size:9px; color:#94a3b8; font-family: ui-monospace, monospace;">${tx.amountTokens} units</span>` : ''}
      </td>
      <td>
        <span class="price-tag">${tx.entryPrice || 'Market'}</span>
      </td>
      <td>
        <span style="color:#ffffff; font-weight:700; font-family: ui-monospace, monospace;">${tx.amountIn}</span>
      </td>
      <td>
        <span class="winrate-badge">${winrateVal}</span>
        ${changeDelta ? `<br><span class="${deltaClass}" style="font-size:9px; font-family: ui-monospace, monospace;">24h: ${changeDelta}</span>` : ''}
      </td>
      <td>
        <a href="${tx.explorerUrl}" target="_blank" rel="noopener" class="btn-explorer">
          <span>${tx.txHash ? tx.txHash.slice(0, 8) + '...' : 'Explorer'}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
        </a>
      </td>
    `;

    // Attach Copy event
    const copyBtn = tr.querySelector('.btn-copy-addr');
    if (copyBtn && tx.walletAddress) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(tx.walletAddress, `Wallet ${tx.walletLabel}`);
      });
    }

    // Attach Quick Whitelist event
    const wlBtn = tr.querySelector('.btn-table-whitelist');
    if (wlBtn && tx.walletAddress) {
      wlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        quickEnrolTarget(tx.walletLabel, tx.chain, tx.walletAddress);
      });
    }

    txTbodyEl.appendChild(tr);
  });
}

// Render Tracked Whales Sidebar
function renderWallets() {
  if (!walletCardsContainerEl) return;
  walletCardsContainerEl.innerHTML = '';

  if (state.wallets.length === 0) {
    walletCardsContainerEl.innerHTML = '<div style="color:#64748b; font-size:11px; text-align:center; padding:16px;">No whales registered. Add one above!</div>';
    return;
  }

  state.wallets.forEach(w => {
    const card = document.createElement('div');
    card.className = 'whale-card';
    card.innerHTML = `
      <div class="whale-card-top">
        <span class="whale-name">${w.label}</span>
        <span class="chain-tag ${w.chain}">${w.chain}</span>
      </div>
      <div class="whale-addr-row">
        <span class="whale-addr" style="cursor:pointer;" title="Click to copy">${w.address.slice(0, 10)}...${w.address.slice(-6)}</span>
        <button type="button" class="btn-action-icon btn-card-copy" title="Copy address">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>Copy</span>
        </button>
      </div>
      <div class="whale-card-bottom">
        <span>$${(w.balanceUsd / 1000000).toFixed(1)}M | <strong>${w.winRate}% WR</strong></span>
        <button type="button" class="btn-card-del" data-id="${w.id}">Delist</button>
      </div>
    `;

    // Click on address or copy button
    const copyBtn = card.querySelector('.btn-card-copy');
    const addrSpan = card.querySelector('.whale-addr');
    const doCopy = (e) => {
      e.stopPropagation();
      copyToClipboard(w.address, `Wallet ${w.label}`);
    };
    if (copyBtn) copyBtn.addEventListener('click', doCopy);
    if (addrSpan) addrSpan.addEventListener('click', doCopy);

    card.querySelector('.btn-card-del').addEventListener('click', (e) => {
      e.stopPropagation();
      removeWallet(w.id);
    });

    walletCardsContainerEl.appendChild(card);
  });
}

// Fetch Full State from Backend
async function fetchState() {
  try {
    const base = await resolveApiBase();
    const res = await fetch(`${base}/api/state`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state = data;
    renderTickers();
    renderMetrics();
    renderTransactions();
    renderWallets();
  } catch (err) {
    console.error('Failed to fetch state:', err);
  }
}

// Preset Whales Directory
const PRESET_WHALES = {
  vitalik: {
    label: 'Vitalik Buterin (vitalik.eth)',
    chain: 'ETH',
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    balanceUsd: 650000000,
    winRate: 98.2
  },
  sun: {
    label: 'Justin Sun Fund',
    chain: 'ETH',
    address: '0x3DdfA8eC3052539b6C954981c482402891384488',
    balanceUsd: 420000000,
    winRate: 92.4
  },
  wintermute: {
    label: 'Wintermute Arbitrage Desk',
    chain: 'ETH',
    address: '0xdbf5e9c5206d0b5099b24723196660b94ac88e5d',
    balanceUsd: 112000000,
    winRate: 91.0
  },
  arthur: {
    label: 'Arthur Hayes Office',
    chain: 'ETH',
    address: '0x53461cd35d1415051b342429681842523ca507f4',
    balanceUsd: 48500000,
    winRate: 88.0
  },
  fickel: {
    label: 'James Fickel Mega Staker',
    chain: 'ETH',
    address: '0xb794f5ea0ba39494ce839613fffba74279579268',
    balanceUsd: 87500000,
    winRate: 84.5
  },
  ansem: {
    label: 'Ansem Pump High Roller',
    chain: 'SOL',
    address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    balanceUsd: 18400000,
    winRate: 82.5
  },
  raydium: {
    label: 'Raydium CLMM Top Liquidity Pool',
    chain: 'SOL',
    address: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    balanceUsd: 65200000,
    winRate: 95.1
  },
  binance: {
    label: 'Binance Hot Reserve',
    chain: 'BSC',
    address: '0x28c6c06298d514db089934071355e5743bf21d60',
    balanceUsd: 320000000,
    winRate: 99.0
  }
};

if (selectPreset) {
  selectPreset.addEventListener('change', (e) => {
    const key = e.target.value;
    if (key && PRESET_WHALES[key]) {
      const p = PRESET_WHALES[key];
      const labelInput = document.getElementById('input-label');
      const chainInput = document.getElementById('input-chain');
      const addressInput = document.getElementById('input-address');
      const balanceInput = document.getElementById('input-balance');
      const winRateInput = document.getElementById('input-winrate');

      if (labelInput) labelInput.value = p.label;
      if (chainInput) chainInput.value = p.chain;
      if (addressInput) addressInput.value = p.address;
      if (balanceInput) balanceInput.value = p.balanceUsd;
      if (winRateInput) winRateInput.value = p.winRate;
    }
  });
}

// Add Target Whitelist Action
async function handleAddWallet(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const labelInput = document.getElementById('input-label');
  const chainInput = document.getElementById('input-chain');
  const addressInput = document.getElementById('input-address');
  const balanceInput = document.getElementById('input-balance');
  const winRateInput = document.getElementById('input-winrate');

  const label = labelInput ? labelInput.value.trim() : '';
  const chain = chainInput ? chainInput.value : 'ETH';
  const address = addressInput ? addressInput.value.trim() : '';
  const balanceUsd = balanceInput ? (Number(balanceInput.value) || 1000000) : 1000000;
  const winRate = winRateInput ? (Number(winRateInput.value) || 85.0) : 85.0;

  if (!label || !address) {
    alert('Please enter both Label and Wallet Address');
    return;
  }

  const submitBtn = document.getElementById('btn-add-wallet');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enrolling target...';
  }

  try {
    const base = await resolveApiBase();
    const res = await fetch(`${base}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_wallet',
        label,
        chain,
        address,
        balanceUsd,
        winRate
      })
    });

    const resData = await res.json().catch(() => ({}));
    if (res.ok && resData.success !== false) {
      if (addWalletForm) addWalletForm.reset();
      await fetchState();
    } else {
      alert('Failed to enrol wallet: ' + (resData.error || res.statusText));
    }
  } catch (err) {
    console.error('Network error enrolling wallet:', err);
    alert('Network error: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '+ Enrol Under Radar';
    }
  }
}

if (addWalletForm) {
  addWalletForm.addEventListener('submit', handleAddWallet);
}

// Remove Wallet Action
async function removeWallet(id) {
  try {
    const base = await resolveApiBase();
    const res = await fetch(`${base}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove_wallet', id })
    });
    if (res.ok) {
      await fetchState();
    }
  } catch (err) {
    console.error('Error removing wallet:', err);
  }
}

// Force On-Chain Scan Action
if (btnForceScan) {
  btnForceScan.addEventListener('click', async () => {
    try {
      btnForceScan.disabled = true;
      btnForceScan.textContent = '⏳ Querying Nodes...';
      const base = await resolveApiBase();
      await fetch(`${base}/api/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_manual_scan' })
      });
      await fetchState();
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setTimeout(() => {
        btnForceScan.disabled = false;
        btnForceScan.textContent = '⚡ Force On-Chain Scan';
      }, 1000);
    }
  });
}

// Refresh Button Action
if (btnRefresh) {
  btnRefresh.addEventListener('click', () => {
    fetchState();
  });
}

// Filter Pills
filterPills.forEach(pill => {
  pill.addEventListener('click', () => {
    filterPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeChainFilter = pill.getAttribute('data-filter') || 'ALL';
    renderTransactions();
  });
});

// Search input
if (tableSearchInput) {
  tableSearchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderTransactions();
  });
}

// Connect to SSE Stream
async function connectSSE() {
  try {
    const base = await resolveApiBase();
    const eventSource = new EventSource(`${base}/api/events`);

    eventSource.onopen = () => {
      if (connectionStatusEl) {
        connectionStatusEl.textContent = 'BLOCKSCOUT + DEX LIVE';
        connectionStatusEl.style.color = '#00ffaa';
      }
    };

    eventSource.addEventListener('new_transaction', (e) => {
      const tx = JSON.parse(e.data);
      if (!state.transactions.some(t => t.txHash === tx.txHash)) {
        state.transactions.unshift(tx);
        if (state.transactions.length > 50) state.transactions.pop();
        renderTransactions();
        renderMetrics();
      }
    });

    eventSource.addEventListener('ticker_update', (e) => {
      const tickers = JSON.parse(e.data);
      state.tickerPrices = tickers;
      renderTickers();
    });

    eventSource.addEventListener('wallet_added', (e) => {
      const wallet = JSON.parse(e.data);
      if (!state.wallets.some(w => w.id === wallet.id)) {
        state.wallets.push(wallet);
        renderWallets();
        renderMetrics();
      }
    });

    eventSource.addEventListener('wallet_removed', (e) => {
      const { id } = JSON.parse(e.data);
      state.wallets = state.wallets.filter(w => w.id !== id);
      renderWallets();
      renderMetrics();
    });

    eventSource.onerror = () => {
      if (connectionStatusEl) {
        connectionStatusEl.textContent = 'RECONNECTING...';
        connectionStatusEl.style.color = '#fb923c';
      }
      eventSource.close();
      setTimeout(connectSSE, 3000);
    };
  } catch (err) {
    console.error('SSE connection failed:', err);
    setTimeout(connectSSE, 3000);
  }
}

// Initialize Application
(async function init() {
  await resolveApiBase();
  await fetchState();
  connectSSE();
  
  // Continuous telemetry heartbeat
  setInterval(async () => {
    try {
      await fetchState();
    } catch (_) {}
  }, 5000);
})();
