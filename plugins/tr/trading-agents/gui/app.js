// TradingAgents Sovereign Council Client Application
(function () {
  'use strict';

  let currentVerdict = null;
  let apiBase = '';

  const elements = {
    statusBadge: document.getElementById('status-badge'),
    portBadge: document.getElementById('port-badge'),
    autoDispatchToggle: document.getElementById('auto-dispatch-toggle'),
    tickerInput: document.getElementById('ticker-input'),
    assetTypeSelect: document.getElementById('asset-type'),
    cashInput: document.getElementById('cash-input'),
    runCouncilBtn: document.getElementById('run-council-btn'),
    settleBtn: document.getElementById('settle-btn'),
    dispatchAgentBtn: document.getElementById('dispatch-agent-btn'),
    presetPills: document.querySelectorAll('.preset-pills .pill'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    debateTimeline: document.getElementById('debate-timeline'),
    riskTimeline: document.getElementById('risk-timeline'),
    polymarketList: document.getElementById('polymarket-list'),
    stScore: document.getElementById('st-score'),
    stFill: document.getElementById('st-fill'),
    stLabel: document.getElementById('st-label'),
    stPosts: document.getElementById('st-posts'),
    verdictTicker: document.getElementById('verdict-ticker'),
    verdictRating: document.getElementById('verdict-rating'),
    metricPrice: document.getElementById('metric-price'),
    metricChange: document.getElementById('metric-change'),
    metricRsi: document.getElementById('metric-rsi'),
    metricRr: document.getElementById('metric-rr'),
    levelEntry: document.getElementById('level-entry'),
    levelStop: document.getElementById('level-stop'),
    levelTarget: document.getElementById('level-target'),
    sizingVal: document.getElementById('sizing-val'),
    executiveSummaryText: document.getElementById('executive-summary-text'),
    investmentThesisText: document.getElementById('investment-thesis-text'),
    memoryTbody: document.getElementById('memory-tbody'),
    memoryCount: document.getElementById('memory-count'),
    toast: document.getElementById('toast')
  };

  function showToast(msg, duration = 3000) {
    if (!elements.toast) return;
    elements.toast.textContent = msg;
    elements.toast.classList.add('show');
    setTimeout(() => {
      elements.toast.classList.remove('show');
    }, duration);
  }

  // --- RESOLVE API BASE DYNAMICALLY ---
  async function resolveApiBase() {
    // 1. Direct engine port probe
    try {
      const testRes = await fetch(`${window.location.origin}/api/status`, { signal: AbortSignal.timeout(600) });
      if (testRes.ok) {
        const info = await testRes.json();
        if (info.app === 'trading-agents') {
          return window.location.origin;
        }
      }
    } catch (_) {}

    // 2. Cockpit Host status discovery probe (port 19890 or window host)
    try {
      const hostPort = (window.location.port && window.location.port !== '80' && window.location.port !== '443') ? window.location.port : '19890';
      const res = await fetch(`http://127.0.0.1:${hostPort}/api/plugins/trading-agents/status`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) {
        const info = await res.json();
        if (info.port && info.running) {
          return `http://127.0.0.1:${info.port}`;
        }
      }
    } catch (_) {}

    // 3. Fallback to default port
    return 'http://127.0.0.1:17898';
  }

  // --- TAB NAVIGATION ---
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.tabBtns.forEach(b => b.classList.remove('active'));
      elements.tabPanes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const pane = document.getElementById(targetId);
      if (pane) pane.classList.add('active');
    });
  });

  // --- PRESET TICKERS ---
  elements.presetPills.forEach(pill => {
    pill.addEventListener('click', () => {
      elements.presetPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      elements.tickerInput.value = pill.getAttribute('data-ticker');
      if (pill.getAttribute('data-ticker').includes('-USD')) {
        elements.assetTypeSelect.value = 'crypto';
      } else if (pill.getAttribute('data-ticker') === 'SPY') {
        elements.assetTypeSelect.value = 'index';
      } else {
        elements.assetTypeSelect.value = 'stock';
      }
    });
  });

  // --- RENDER VERDICT ---
  function renderVerdict(v) {
    if (!v) return;
    currentVerdict = v;

    elements.verdictTicker.textContent = v.ticker;
    const rating = (v.final_rating || 'HOLD').toUpperCase();
    elements.verdictRating.textContent = rating;

    // Reset rating classes
    elements.verdictRating.className = 'rating-badge';
    if (rating === 'BUY') {
      elements.verdictRating.classList.add('rating-buy');
    } else if (rating === 'OVERWEIGHT') {
      elements.verdictRating.classList.add('rating-overweight');
    } else if (rating === 'SELL' || rating === 'UNDERWEIGHT') {
      elements.verdictRating.classList.add('rating-sell');
    } else {
      elements.verdictRating.classList.add('rating-hold');
    }

    const snap = v.market_snapshot || {};
    const price = snap.current_price ? `$${snap.current_price.toFixed(2)}` : '$0.00';
    elements.metricPrice.textContent = price;

    const chg = snap.change_pct !== undefined ? snap.change_pct : 0;
    elements.metricChange.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
    elements.metricChange.className = chg >= 0 ? 'metric-val text-emerald' : 'metric-val text-rose';

    elements.metricRsi.textContent = snap.rsi ? snap.rsi.toFixed(1) : '--';
    
    const prop = v.trader_proposal || {};
    elements.metricRr.textContent = prop.risk_reward_ratio || '2.00R';
    elements.levelEntry.textContent = prop.entry_price ? `$${prop.entry_price.toFixed(2)}` : price;
    elements.levelStop.textContent = prop.stop_loss ? `$${prop.stop_loss.toFixed(2)}` : '$0.00';
    elements.levelTarget.textContent = prop.take_profit ? `$${prop.take_profit.toFixed(2)}` : '$0.00';
    elements.sizingVal.textContent = prop.position_sizing || 'Standard Allocation (2% equity risk)';

    elements.executiveSummaryText.textContent = v.executive_summary || 'No summary available.';
    elements.investmentThesisText.textContent = v.investment_thesis || 'No thesis generated.';

    // Render Dialectic Debate
    if (elements.debateTimeline && v.debate_timeline) {
      elements.debateTimeline.innerHTML = '';
      v.debate_timeline.forEach(item => {
        const bubble = document.createElement('div');
        bubble.className = `speech-bubble ${item.role === 'bull' ? 'bubble-bull' : 'bubble-bear'}`;
        bubble.innerHTML = `
          <div class="speech-speaker">
            <span>${item.speaker}</span>
            <span>${item.role === 'bull' ? '📈 BULL CASE' : '📉 BEAR RISK'}</span>
          </div>
          <div>${item.content}</div>
        `;
        elements.debateTimeline.appendChild(bubble);
      });
    }

    // Render Risk Committee
    if (elements.riskTimeline && v.risk_timeline) {
      elements.riskTimeline.innerHTML = '';
      v.risk_timeline.forEach(item => {
        const bubble = document.createElement('div');
        let bubbleClass = 'bubble-risk-neut';
        if (item.stance === 'aggressive') bubbleClass = 'bubble-risk-agg';
        if (item.stance === 'conservative') bubbleClass = 'bubble-risk-cons';

        bubble.className = `speech-bubble ${bubbleClass}`;
        bubble.innerHTML = `
          <div class="speech-speaker">
            <span>${item.speaker}</span>
            <span>STANCE: ${item.stance.toUpperCase()}</span>
          </div>
          <div>${item.content}</div>
        `;
        elements.riskTimeline.appendChild(bubble);
      });
    }

    // Render Zero-Key Feeds
    if (elements.polymarketList && v.polymarket_snapshot) {
      elements.polymarketList.innerHTML = '';
      v.polymarket_snapshot.forEach(pm => {
        const row = document.createElement('div');
        row.className = 'feed-item';
        row.innerHTML = `
          <div class="feed-item-title">${pm.title}</div>
          <div class="feed-item-prob">${pm.probability}</div>
        `;
        elements.polymarketList.appendChild(row);
      });
    }

    const sent = v.sentiment_snapshot || {};
    if (elements.stScore) {
      elements.stScore.textContent = `${sent.sentiment_score || 5.0} / 10`;
      elements.stFill.style.width = `${((sent.sentiment_score || 5.0) / 10) * 100}%`;
      elements.stLabel.textContent = `${sent.band || 'Neutral'} (${sent.bullish || 0} Bullish / ${sent.bearish || 0} Bearish)`;
    }
    if (elements.stPosts && sent.sample_posts) {
      elements.stPosts.innerHTML = '';
      sent.sample_posts.slice(0, 3).forEach(post => {
        const p = document.createElement('div');
        p.className = 'sample-post-item';
        p.textContent = post;
        elements.stPosts.appendChild(p);
      });
    }

    // Check auto-dispatch
    if (elements.autoDispatchToggle && elements.autoDispatchToggle.checked) {
      dispatchVerdictToAgent(v, true);
    }
  }

  // --- DISPATCH VERDICT TO AGENT CHAT ---
  async function dispatchVerdictToAgent(verdict, isAuto = false) {
    if (!verdict) return;
    const ticker = verdict.ticker;
    const rating = verdict.final_rating;
    const prop = verdict.trader_proposal || {};
    const entry = prop.entry_price || 0;
    const stop = prop.stop_loss || 0;
    const target = prop.take_profit || 0;
    const sizing = prop.position_sizing || '2% risk';

    const promptText = `[TRADINGAGENTS COUNCIL VERDICT: ${ticker}]
Rating: ${rating.toUpperCase()}
Action: ${prop.action || 'HOLD'}
Entry: $${entry} | Stop Loss: $${stop} | Target: $${target} | Sizing: ${sizing}
Executive Summary: ${verdict.executive_summary}
Thesis: ${verdict.investment_thesis}
Direct Action: The council committee has completed deliberation. You may confirm execution or review risk factors on ${apiBase}/api/history.`;

    try {
      const res = await fetch(`${apiBase}/api/prompt-dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toAgent: 'mr.flow',
          triggerId: 'trading-agents',
          prompt: promptText
        })
      });
      const data = await res.json();
      showToast(isAuto ? `⚡ Auto-Dispatched ${ticker} verdict to agent chat!` : `⚡ Verdict for ${ticker} dispatched to agent chat!`);
    } catch (e) {
      showToast(`Notice: Local dispatch registered (${e.message})`);
    }
  }

  // --- RUN COUNCIL DEBATE ---
  async function runCouncilDebate() {
    const ticker = elements.tickerInput.value.trim().toUpperCase() || 'NVDA';
    const assetType = elements.assetTypeSelect.value;
    const cash = parseFloat(elements.cashInput.value) || 25000;

    elements.runCouncilBtn.disabled = true;
    elements.runCouncilBtn.innerHTML = '<span class="btn-icon">⏳</span> Deliberating...';

    try {
      const res = await fetch(`${apiBase}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          asset_type: assetType,
          cash
        })
      });

      const data = await res.json();
      if (data.success && data.verdict) {
        renderVerdict(data.verdict);
        loadMemoryHistory();
        showToast(`Council deliberation complete for ${ticker}`);
      } else {
        showToast(`Error: ${data.error || 'Failed to deliberate'}`);
      }
    } catch (err) {
      showToast(`Network error: ${err.message}`);
    } finally {
      elements.runCouncilBtn.disabled = false;
      elements.runCouncilBtn.innerHTML = '<span class="btn-icon">⚡</span> Run Council Debate';
    }
  }

  // --- SETTLE PENDING TRADES ---
  async function settlePendingTrades() {
    elements.settleBtn.disabled = true;
    elements.settleBtn.innerHTML = '<span class="btn-icon">⏳</span> Settling...';

    try {
      const res = await fetch(`${apiBase}/api/settle`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`Alpha scoring complete: ${data.settled_count} trades settled.`);
        loadMemoryHistory();
      } else {
        showToast(`Settlement error: ${data.error}`);
      }
    } catch (err) {
      showToast(`Network error: ${err.message}`);
    } finally {
      elements.settleBtn.disabled = false;
      elements.settleBtn.innerHTML = '<span class="btn-icon">🔄</span> Settle Alpha';
    }
  }

  // --- LOAD MEMORY HISTORY ---
  async function loadMemoryHistory() {
    try {
      const res = await fetch(`${apiBase}/api/history`);
      const data = await res.json();
      if (data.success && data.history) {
        if (elements.memoryCount) {
          elements.memoryCount.textContent = `${data.history.length} Decision Records`;
        }
        if (elements.memoryTbody) {
          if (data.history.length === 0) {
            elements.memoryTbody.innerHTML = '<tr><td colspan="9" class="empty-cell">No trade records found. Execute council analysis to begin logging.</td></tr>';
            return;
          }
          elements.memoryTbody.innerHTML = '';
          data.history.forEach(item => {
            const tr = document.createElement('tr');
            const dateStr = item.timestamp ? item.timestamp.substring(0, 16).replace('T', ' ') : '--';
            const statusColor = item.status === 'settled' ? 'text-emerald' : 'text-cyan';
            tr.innerHTML = `
              <td>${dateStr}</td>
              <td><strong>${item.ticker}</strong></td>
              <td><span class="badge ${item.rating === 'Buy' ? 'badge-online' : 'badge-port'}">${item.rating}</span></td>
              <td>$${item.entry_price || '--'}</td>
              <td>$${item.target_price || '--'}</td>
              <td><span class="${statusColor}">${(item.status || 'pending').toUpperCase()}</span></td>
              <td>${item.raw_return || '--'}</td>
              <td><strong>${item.alpha_return || '--'}</strong></td>
              <td style="font-size: 11.5px; color: var(--text-secondary); max-width: 320px;">${item.reflection || item.executive_summary || '--'}</td>
            `;
            elements.memoryTbody.appendChild(tr);
          });
        }
      }
    } catch (err) {
      console.warn('Could not load memory history:', err.message);
    }
  }

  // --- INITIALIZATION ---
  async function init() {
    apiBase = await resolveApiBase();
    console.log('[TradingAgents Client] Active API Base resolved:', apiBase);

    try {
      const res = await fetch(`${apiBase}/api/status`);
      const data = await res.json();
      if (data.port && elements.portBadge) {
        elements.portBadge.textContent = `PORT: ${data.port}`;
      }
      if (elements.statusBadge) {
        elements.statusBadge.textContent = '● COUNCIL ENGINE READY';
      }
    } catch (e) {
      console.warn('[TradingAgents Client] Initial status check warning:', e.message);
    }

    // Load memory ledger on startup
    await loadMemoryHistory();

    // Event listeners
    if (elements.runCouncilBtn) {
      elements.runCouncilBtn.addEventListener('click', runCouncilDebate);
    }
    if (elements.settleBtn) {
      elements.settleBtn.addEventListener('click', settlePendingTrades);
    }
    if (elements.dispatchAgentBtn) {
      elements.dispatchAgentBtn.addEventListener('click', () => {
        if (currentVerdict) {
          dispatchVerdictToAgent(currentVerdict, false);
        } else {
          showToast('Please run council debate first before dispatching');
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
