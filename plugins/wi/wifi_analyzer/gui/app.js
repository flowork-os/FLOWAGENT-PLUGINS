const urlParams = new URLSearchParams(window.location.search);
const state = {
  rawAccessPoints: [],
  filteredAccessPoints: [],
  port: urlParams.get('port') || window.location.port || '43455',
  currentBand: '2.4', // '2.4', '5', 'all'
  searchQuery: '',
  securityFilter: 'all', // 'all', 'wpa3', 'wpa2', 'open'
  minSignal: 0,
  sortKey: 'signal',
  sortAsc: false
};

const dom = {
  btnScan: document.getElementById('fl-btn-scan'),
  tableBody: document.getElementById('fl-networks-body'),
  canvas: document.getElementById('fl-spectrum-chart'),
  spectrumTitle: document.getElementById('fl-spectrum-title'),
  filterSsid: document.getElementById('fl-filter-ssid'),
  filterSec: document.getElementById('fl-filter-sec'),
  filterSignal: document.getElementById('fl-filter-signal'),
  signalVal: document.getElementById('fl-signal-val'),
  bandButtons: document.querySelectorAll('.fl-tab-btn'),
  statTotal: document.getElementById('fl-stat-total'),
  stat24: document.getElementById('fl-stat-24'),
  stat5: document.getElementById('fl-stat-5'),
  statBest: document.getElementById('fl-stat-best'),
  filterCount: document.getElementById('fl-filter-count'),
  tableHeaders: document.querySelectorAll('.fl-table th'),
  hwAlert: document.getElementById('fl-hw-alert'),
  hwMsg: document.getElementById('fl-hw-msg')
};

async function fetchScanResults() {
  try {
    dom.btnScan.disabled = true;
    dom.btnScan.textContent = 'Scanning...';
    const res = await fetch(`http://127.0.0.1:${state.port}/api/scan`);
    const data = await res.json();
    
    if (data.hardware_present === false) {
      if (dom.hwAlert) dom.hwAlert.style.display = 'flex';
      if (dom.hwMsg) dom.hwMsg.textContent = data.error || 'No wireless adapter detected on host (wlan0 / wlp). Please connect a Wi-Fi dongle.';
      state.rawAccessPoints = [];
    } else {
      if (dom.hwAlert) dom.hwAlert.style.display = 'none';
      state.rawAccessPoints = data.access_points || [];
    }

    updateMetrics();
    applyFilters();
  } catch (err) {
    console.error('Scan failed:', err);
    dom.tableBody.innerHTML = `<tr><td colspan="6" class="fl-text-center" style="color: #f87171;">Failed to connect to backend microservice (Port ${state.port}). Click "Scan Channels" to retry.</td></tr>`;
  } finally {
    dom.btnScan.disabled = false;
    dom.btnScan.textContent = 'Scan Channels';
  }
}

function updateMetrics() {
  const total = state.rawAccessPoints.length;
  const count24 = state.rawAccessPoints.filter(ap => is24GHz(ap)).length;
  const count5 = state.rawAccessPoints.filter(ap => is5GHz(ap)).length;

  dom.statTotal.textContent = total;
  dom.stat24.textContent = count24;
  dom.stat5.textContent = count5;

  // Best channel analysis (least crowded among 1, 6, 11)
  const chUsage = { 1: 0, 6: 0, 11: 0 };
  state.rawAccessPoints.forEach(ap => {
    if (ap.channel >= 1 && ap.channel <= 3) chUsage[1]++;
    else if (ap.channel >= 4 && ap.channel <= 8) chUsage[6]++;
    else if (ap.channel >= 9 && ap.channel <= 13) chUsage[11]++;
  });

  const best = Object.keys(chUsage).reduce((a, b) => chUsage[a] <= chUsage[b] ? a : b);
  dom.statBest.textContent = `Ch ${best} (Lowest Interference)`;
}

function is24GHz(ap) {
  return ap.channel >= 1 && ap.channel <= 14;
}

function is5GHz(ap) {
  return ap.channel >= 32;
}

function applyFilters() {
  state.filteredAccessPoints = state.rawAccessPoints.filter(ap => {
    // 1. Band filter
    if (state.currentBand === '2.4' && !is24GHz(ap)) return false;
    if (state.currentBand === '5' && !is5GHz(ap)) return false;

    // 2. Search query (SSID or BSSID)
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const matchSsid = ap.ssid.toLowerCase().includes(q);
      const matchBssid = ap.bssid.toLowerCase().includes(q);
      if (!matchSsid && !matchBssid) return false;
    }

    // 3. Security protocol
    if (state.securityFilter !== 'all') {
      const sec = (ap.security || '').toLowerCase();
      if (state.securityFilter === 'wpa3' && !sec.includes('wpa3')) return false;
      if (state.securityFilter === 'wpa2' && !sec.includes('wpa2')) return false;
      if (state.securityFilter === 'open' && (!sec.includes('open') && !sec.includes('wep'))) return false;
    }

    // 4. Min Signal
    if (ap.signal < state.minSignal) return false;

    return true;
  });

  // Sort
  state.filteredAccessPoints.sort((a, b) => {
    let valA = a[state.sortKey];
    let valB = b[state.sortKey];
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return state.sortAsc ? -1 : 1;
    if (valA > valB) return state.sortAsc ? 1 : -1;
    return 0;
  });

  dom.filterCount.textContent = `Showing ${state.filteredAccessPoints.length} of ${state.rawAccessPoints.length} APs`;
  renderTable();
  renderSpectrum();
}

function renderTable() {
  if (state.filteredAccessPoints.length === 0) {
    dom.tableBody.innerHTML = '<tr><td colspan="6" class="fl-text-center">No matching access points found. Adjust filters or scan again.</td></tr>';
    return;
  }

  dom.tableBody.innerHTML = state.filteredAccessPoints.map(ap => {
    let badgeClass = 'wpa2';
    const secLower = (ap.security || '').toLowerCase();
    if (secLower.includes('wpa3')) badgeClass = 'wpa3';
    else if (secLower.includes('wep') || secLower.includes('open')) badgeClass = 'warning';

    const bandTag = is24GHz(ap) ? '2.4 GHz' : '5 GHz';

    return `
      <tr>
        <td><strong>${escapeHtml(ap.ssid)}</strong></td>
        <td><code>${escapeHtml(ap.bssid)}</code></td>
        <td><span class="fl-tag">Ch ${ap.channel}</span></td>
        <td>${bandTag} <small style="color: #64748b;">(${escapeHtml(ap.freq)})</small></td>
        <td>
          <div class="fl-signal-bar">
            <span>${ap.signal}%</span>
            <div class="fl-progress-track">
              <div class="fl-progress-fill" style="width: ${ap.signal}%;"></div>
            </div>
          </div>
        </td>
        <td><span class="fl-badge ${badgeClass}">${escapeHtml(ap.security)}</span></td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function renderSpectrum() {
  const canvas = dom.canvas;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  const is5g = state.currentBand === '5';
  dom.spectrumTitle.textContent = is5g ? 'Spectrum Distribution (5 GHz Band)' : 'Spectrum Distribution (2.4 GHz Band)';

  if (is5g) {
    render5GHzSpectrum(ctx, w, h);
  } else {
    render24GHzSpectrum(ctx, w, h);
  }
}

function render24GHzSpectrum(ctx, w, h) {
  const step = w / 15;
  
  // Grid lines
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#64748b';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';

  for (let ch = 1; ch <= 14; ch++) {
    const x = ch * step;
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x, h - 25);
    ctx.stroke();
    
    // Highlight primary non-overlapping channels
    if (ch === 1 || ch === 6 || ch === 11) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`Ch ${ch}*`, x, h - 10);
      ctx.fillStyle = '#64748b';
    } else {
      ctx.fillText(`Ch ${ch}`, x, h - 10);
    }
  }

  // Draw Bell Curves for 2.4GHz APs
  const visibleAPs = state.filteredAccessPoints.filter(is24GHz);
  const colors = [
    'rgba(2, 132, 199, 0.45)',
    'rgba(16, 185, 129, 0.45)',
    'rgba(245, 158, 11, 0.45)',
    'rgba(168, 85, 247, 0.45)',
    'rgba(236, 72, 153, 0.45)'
  ];

  visibleAPs.forEach((ap, idx) => {
    const centerX = ap.channel * step;
    const peakHeight = Math.max(15, (ap.signal / 100) * (h - 60));
    const channelWidth = step * 2.5; // standard 20/22MHz bandwidth spread

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(centerX - channelWidth, h - 25);
    ctx.bezierCurveTo(
      centerX - channelWidth / 2, h - 25 - peakHeight,
      centerX + channelWidth / 2, h - 25 - peakHeight,
      centerX + channelWidth, h - 25
    );

    const color = colors[idx % colors.length];
    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = color.replace('0.45', '1.0');
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`${ap.ssid} (${ap.signal}%)`, centerX, h - 25 - peakHeight - 6);
    ctx.restore();
  });
}

function render5GHzSpectrum(ctx, w, h) {
  // 5 GHz primary channels
  const channels5g = [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 132, 136, 140, 149, 153, 157, 161, 165];
  const step = w / (channels5g.length + 1);

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#64748b';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';

  channels5g.forEach((ch, idx) => {
    const x = (idx + 1) * step;
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x, h - 25);
    ctx.stroke();
    ctx.fillText(`${ch}`, x, h - 10);
  });

  const visibleAPs = state.filteredAccessPoints.filter(is5GHz);
  const colors = ['rgba(56, 189, 248, 0.45)', 'rgba(74, 222, 128, 0.45)', 'rgba(251, 146, 60, 0.45)'];

  visibleAPs.forEach((ap, idx) => {
    let chIdx = channels5g.indexOf(ap.channel);
    if (chIdx === -1) chIdx = 0;
    const centerX = (chIdx + 1) * step;
    const peakHeight = Math.max(15, (ap.signal / 100) * (h - 60));
    const channelWidth = step * 1.5;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(centerX - channelWidth, h - 25);
    ctx.bezierCurveTo(
      centerX - channelWidth / 2, h - 25 - peakHeight,
      centerX + channelWidth / 2, h - 25 - peakHeight,
      centerX + channelWidth, h - 25
    );

    const color = colors[idx % colors.length];
    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = color.replace('0.45', '1.0');
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`${ap.ssid} (${ap.signal}%)`, centerX, h - 25 - peakHeight - 6);
    ctx.restore();
  });
}

// Event Listeners for Filters
dom.bandButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    dom.bandButtons.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    state.currentBand = e.target.dataset.band;
    applyFilters();
  });
});

dom.filterSsid.addEventListener('input', (e) => {
  state.searchQuery = e.target.value.trim();
  applyFilters();
});

dom.filterSec.addEventListener('change', (e) => {
  state.securityFilter = e.target.value;
  applyFilters();
});

dom.filterSignal.addEventListener('input', (e) => {
  state.minSignal = parseInt(e.target.value, 10);
  dom.signalVal.textContent = `${state.minSignal}%`;
  applyFilters();
});

// Table sorting
dom.tableHeaders.forEach(th => {
  th.addEventListener('click', () => {
    const sortField = th.dataset.sort;
    if (state.sortKey === sortField) {
      state.sortAsc = !state.sortAsc;
    } else {
      state.sortKey = sortField;
      state.sortAsc = true;
    }
    applyFilters();
  });
});

dom.btnScan.addEventListener('click', fetchScanResults);
window.addEventListener('resize', renderSpectrum);

// Initial execution
fetchScanResults();
