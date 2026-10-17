---
name: whale_radar_tracker
description: Authoritative runbook and SOP for operating the Whale Radar & Smart Money Tracker Canvas plugin, monitoring DEX swaps, managing whale watchlists, and querying real-time on-chain intelligence.
author: "@awenkaudico"
version: "1.0.0"
keywords:
  - whale_tracker
  - smart_money
  - crypto_analytics
  - dex_monitoring
  - solana_tracker
  - evm_analytics
  - uniswap_watcher
  - raydium_swaps
  - token_sniffer
  - pnl_profiler
  - liquidity_lock
  - copy_trading
  - onchain_radar
  - canvas_plugin
  - real_time_sse
  - wallet_profiler
  - blockchain_scanner
  - web3_intelligence
  - dynamic_port
  - zero_zombie
exclude_keywords:
  - fiat_banking
  - physical_ledger
---

# 🐋 WHALE RADAR & SMART MONEY TRACKER (CANVAS PLUGIN)

> **AUTHORITY**: AWENK AUDICO & TEGUHFX (LEVEL 99 SUPER ADMIN).  
> **RUNTIME MODULE**: Flowork OS Canvas Plugin (`plugins/whale-radar`).  
> **STANDARD**: 100% STRICT ENGLISH RUNBOOK, ZERO HARDCODED PATH, DYNAMIC PORT BINDING.

---

## 1. Overview & Capabilities

The **Whale Radar & Smart Money Tracker** is an interactive Flowork Canvas workbench designed for real-time surveillance of high-net-worth on-chain cryptocurrency traders. It monitors decentralized exchange (DEX) swaps across Solana, Ethereum, and Base, profiling smart wallets with proven win rates and high profit margins.

### Core Capabilities:
1. **Real-time DEX Swap Stream**: Captures token buy/sell actions across Raydium, Uniswap V3, and Aerodrome via Server-Sent Events (SSE).
2. **Curated Smart Wallet Profiling**: Tracks wallet PnL, 30-day win rates, and USD asset holdings.
3. **Instant Swap Trigger**: Allows human operators or AI Agents to execute on-demand DEX sniffing tests.
4. **Token Security Profiler**: Flags honeypots, liquidity lock statuses, and security scores.

---

## 2. Microservice API Specifications

The plugin backend runs an HTTP microservice bound to dynamic port `$FLOWORK_APP_PORT` (fallback `17830`).

### 2.1 Daemon Health Check
- **Endpoint**: `GET /health`
- **Response**:
```json
{
  "status": "ok",
  "plugin": "whale-radar",
  "uptime_seconds": 45,
  "version": "1.0.0",
  "active_wallets": 4,
  "recent_transactions": 3
}
```

### 2.2 Live State Retrieval
- **Endpoint**: `GET /api/state`
- **Method**: `GET`
- **Response**: Full snapshot containing tracked `wallets`, recent `transactions`, and `radarSettings`.

### 2.3 Real-Time SSE Stream
- **Endpoint**: `GET /api/events`
- **Stream Events**:
  - `connected`: Broadcasted upon initial connection.
  - `new_transaction`: Broadcasted whenever a whale executes a DEX swap.
  - `wallet_added`: Broadcasted when a new wallet is added to the watchlist.
  - `wallet_removed`: Broadcasted when a wallet is deleted.

### 2.4 Action Dispatcher
- **Endpoint**: `POST /api/action`
- **Content-Type**: `application/json`

#### Action: `add_wallet`
```bash
# Request via Canvas Host or Microservice Port
curl -s -X POST "/api/action" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "add_wallet",
    "label": "Meteora Sniper",
    "chain": "SOL",
    "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "balanceUsd": 2500000,
    "winRate": 88
  }'
```

#### Action: `remove_wallet`
```bash
curl -s -X POST "/api/action" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "remove_wallet",
    "id": "w-01"
  }'
```

#### Action: `trigger_manual_scan`
```bash
curl -s -X POST "/api/action" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "trigger_manual_scan",
    "label": "Alpha Whale Entry",
    "chain": "SOL"
  }'
```

---

## 3. Human-In-The-Loop Co-Creation Workflow

1. **User Observation**: The user views incoming swap transactions and security scores directly on the Canvas UI.
2. **Agent Collaboration**: When requested, the AI Agent queries `/api/state`, performs contract security audits on the newly bought token, and alerts the user about multi-whale confluence entries.
3. **Automated Risk Filtering**: Transactions with security scores below 75 are highlighted for user discretion before considering copy-trade execution.
