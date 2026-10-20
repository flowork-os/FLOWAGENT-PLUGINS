# 📡 SOVEREIGN WIFI ANALYZER & SPECTRUM RUNBOOK

## 1. Overview
The Sovereign WiFi Analyzer is a high-performance visual diagnostic app for Flowork Canvas. It maps access points, channel congestion across 2.4GHz & 5GHz bands, audits weak cryptographic flags (WEP/WPA-TKIP vs WPA2/WPA3), and monitors gateway latency telemetry.

## 2. Dynamic Port & Process Management
- The microservice binds dynamically to `process.env.FLOWORK_APP_PORT` (fallback `17850`).
- Process conforms to zero-zombie lifecycle with graceful `SIGTERM` cleanup.

## 3. REST API Contract & Execution

### A. Fetch Live Network Telemetry & Access Points
```bash
curl -s http://127.0.0.1:<PORT>/api/scan
```

### B. Trigger Active Diagnostic Scan
```bash
curl -s -X POST http://127.0.0.1:<PORT>/api/scan \
  -H "Content-Type: application/json" \
  -d '{"interface": "wlan0"}'
```

### C. Get Gateway Latency & Health
```bash
curl -s http://127.0.0.1:<PORT>/api/health
```
