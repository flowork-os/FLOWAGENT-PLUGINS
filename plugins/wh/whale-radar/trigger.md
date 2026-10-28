---
trigger_id: "PLUGIN-WHALE-RADAR-TRIGGER"
name: "Whale Radar & Smart Money Activation Trigger"
scopes:
  - "universal_all"
events:
  - "crypto_analytics"
  - "onchain_monitoring"
categories:
  - "CAT-006"
keywords:
  - "whale"
  - "radar"
  - "solana"
  - "ethereum"
  - "dex"
  - "swap"
  - "smart_money"
  - "crypto"
exclude_keywords:
  - "fiat_banking"
  - "physical_ledger"
conditions:
  - key: "env.is_headless"
    op: "=="
    val: false
---

# Whale Radar Ambient Activation Trigger
<!-- Co-authored-by: Flowork OS <agent@floworkos.com> -->

This trigger manages the ambient activation and mounting of the Whale Radar & Smart Money Tracker Canvas plugin when crypto analysis or token monitoring workflows are active.
