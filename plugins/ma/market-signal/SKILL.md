---
name: market_signal_automation_studio
title: Market Signal & Swing Automation Studio Operational Runbook
description: Authoritative SOP and operational API contract for autonomous market signal scanning, multi-indicator confluence evaluation, automated trade plans, and webhook dispatching on Flowork OS Canvas.
author: "Awenk Audico & Flowork OS"
version: "1.0.0"
keywords:
  - market_signals
  - swing_trading
  - technical_analysis
  - stock_scanner
  - crypto_signals
  - automated_alerts
  - rsi_divergence
  - macd_histogram
  - ema_ribbon
  - bollinger_bands
  - volume_surge
  - trade_plans
  - risk_reward
  - webhook_dispatch
  - hmac_signature
  - canvas_workbench
  - dynamic_port
  - financial_telemetry
  - zero_zombie
  - exit_code_zero
---

# 📈 MARKET SIGNAL & SWING AUTOMATION STUDIO — OPERATIONAL RUNBOOK

> **PLATFORM**: FLOWORK OS (FLOWORKOS.COM) SOVEREIGN CANVAS.  
> **CATEGORY**: Finance & Algorithmic Trading (CAT-006).  
> **CORE DOCTRINE**: ZERO THIRD-PARTY PAYWALL, REAL-TIME CONFLUENCE SCORING, AUTOMATED 1:2+ R:R TRADE PLANS, AND EMPIRICAL EXIT CODE 0 VERIFICATION.  
> **CO-AUTHORED-BY**: Flowork OS <agent@floworkos.com>

---

## 1. Role & Architecture Overview
Market Signal & Swing Automation Studio provides autonomous, real-time technical analysis and trade plan generation across US equities and cryptocurrency pairs:
- **Pure Python Math Engine (`engine/scanner.py`)**: Computes 14-period RSI, 20/50/200 Exponential Moving Averages, MACD momentum histogram, Bollinger Bands squeeze, and volume surge anomalies.
- **Microservice Daemon (`engine/server.mjs`)**: Node.js ESM server managing periodic background scans, dynamic port binding, Server-Sent Events (SSE) telemetry, and signed webhook delivery.
- **Canvas Workbench UI (`gui/index.html`)**: Obsidian-dark interactive radar displaying ranked candidates, individual confluence scores, entry/SL/target plans, and watchlist controls.

---

## 2. Dynamic Port & Endpoint Resolution
The active service port is injected via `<CALLER_CONTEXT>` or resolved dynamically from the X-Flow Host:
- Environment Variable: `$FLOWORK_APP_PORT`
- Default Fallback: `17892`
- Base URL: `http://127.0.0.1:<PORT>`

---

## 3. Official REST API Contracts

### A. Health & Engine Status
```bash
curl -s http://127.0.0.1:<PORT>/api/status
```
Response:
```json
{
  "status": "ok",
  "service": "market-signal",
  "port": 17892,
  "is_scanning": false,
  "total_watchlist": 11,
  "confirmed_count": 2,
  "watch_count": 3
}
```

### B. Fetch Latest Ranked Signals
```bash
curl -s http://127.0.0.1:<PORT>/api/signals
```
Response contains candidate rankings, technical scores (0-100), decision status (`CONFIRMED BUY`, `WATCH ONLY`, `NO BUY`), and complete trade plans (Entry, Stop Loss, Target 1, Target 2, Risk-Reward).

### C. Trigger On-Demand Scan
```bash
curl -s -X POST http://127.0.0.1:<PORT>/api/scan \
  -H "Content-Type: application/json" \
  -d '{"tickers": ["NVDA", "BTC-USD", "TSLA"], "interval": "1d"}'
```

### D. Manage Watchlist
```bash
curl -s -X POST http://127.0.0.1:<PORT>/api/watchlist \
  -H "Content-Type: application/json" \
  -d '{"action": "add", "ticker": "AMD"}'
```

### E. Simulate Signed Webhook Dispatch
```bash
curl -s -X POST http://127.0.0.1:<PORT>/api/webhook/simulate \
  -H "Content-Type: application/json" \
  -d '{"target_url": "https://example.com/webhook"}'
```

---

## 4. Real-Time Telemetry Stream (SSE)
Connect to Server-Sent Events for instant state synchronization:
```bash
curl -N http://127.0.0.1:<PORT>/api/events
```
Events dispatched:
- `scan_status`: Dispatched when scanning starts or finishes.
- `scan_complete`: Dispatched with updated candidate rankings and scores.
