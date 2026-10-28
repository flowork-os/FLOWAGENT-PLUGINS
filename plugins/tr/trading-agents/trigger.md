---
app_id: trading-agents
trigger_type: canvas_interaction
description: Triggers autonomous multi-agent trading council debate, market analysis, and portfolio risk gating.
---

# TradingAgents Sovereign Council Trigger

## Activation Patterns
- **Manual Launch**: User clicks the "TradingAgents Sovereign Council" application tile in Flowork Cockpit or App Store.
- **REST Signal**: Direct invocation via `POST http://127.0.0.1:17898/api/analyze` with payload:
  ```json
  {
    "ticker": "NVDA",
    "asset_type": "stock",
    "cash": 25000,
    "portfolio": [{"ticker": "NVDA", "quantity": 50, "average_price": 120.0}]
  }
  ```
- **Agent Dispatch**: Flowork agents dispatching deep-dive committee analysis on confirmed buy candidates from `market-signal`.
