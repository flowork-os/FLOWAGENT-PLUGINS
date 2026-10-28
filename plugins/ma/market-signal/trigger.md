---
name: market_signal_trigger
category_id: CAT-006
scopes:
  - finance
  - trading
  - stocks
  - crypto
  - market_scanner
events:
  - market.open
  - market.scan_requested
  - webhook.dispatch
  - chart.analysis
unce_conditions:
  - env.is_headless == false
---

# 📈 Market Signal & Swing Automation Trigger Specification

Activate this plugin when:
1. User requests real-time stock or crypto technical analysis, market scanners, swing trade signals, or automated entry/exit plans.
2. User mentions stock tickers (e.g., NVDA, AAPL, TSLA) or crypto symbols (e.g., BTC, ETH, SOL) in the context of trade plans, RSI, MACD, or breakouts.
3. User desires automated webhook dispatch to Discord, Slack, or trading bots for confirmed market setups.
