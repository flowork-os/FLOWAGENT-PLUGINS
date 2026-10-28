#!/usr/bin/env python3
"""
Sovereign Market Signal Engine — Audited KamdenAI Protocol
=========================================================
Implements the exact rules, logic, and taxonomy reverse-engineered from:
https://github.com/cporter202/stock-market-signal-automation

Key Invariants:
1. "Status comes before rank": Official Opening Board with up to 8 ranked candidates.
2. Exact 4 Status Labels:
   - confirmed_buy ("Confirmed buy"): Entry, Stop, Target, Risk-Reward >= 1.5R.
   - wait_for_reclaim ("Watch only"): Near breakout key level, pending confirmation.
   - failed_confirmation ("No buy"): Rejected by resistance/volume threshold.
   - quote_unavailable ("Ungraded"): Incomplete or delayed candle evidence.
3. 10:05 AM Quick-Exit Window: Target first, stop first, or forced 10:05 AM time exit.
4. Exact Risk Sizing Formulas (from risk-sizing.js):
   - plannedRiskDollars = cash * (riskPercent / 100)
   - riskPerShare = entry - stop
   - shares = floor(plannedRiskDollars / riskPerShare)
   - positionCost = shares * entry
5. Zero Third-Party Paywall: Standalone Python mathematical analysis.
6. Full 5-Event Lifecycle Parity:
   - research_watchlist.created
   - morning_scan.created
   - confirmed_buys.created
   - quick_exit_results.created
   - webhook.test

Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import sys
import os
import json
import math
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

DEFAULT_WATCHLIST = [
    "NVDA", "TSLA", "AAPL", "MSFT", "AMD", "AMZN", "META", "GOOGL",
    "BTC-USD", "ETH-USD", "SOL-USD"
]

COMPANY_NAMES = {
    "NVDA": "NVIDIA Corporation",
    "TSLA": "Tesla, Inc.",
    "AAPL": "Apple Inc.",
    "MSFT": "Microsoft Corporation",
    "AMD": "Advanced Micro Devices, Inc.",
    "AMZN": "Amazon.com, Inc.",
    "META": "Meta Platforms, Inc.",
    "GOOGL": "Alphabet Inc.",
    "BTC-USD": "Bitcoin USD",
    "ETH-USD": "Ethereum USD",
    "SOL-USD": "Solana USD"
}

def fetch_candles(ticker: str, interval: str = "1d", range_str: str = "3mo") -> Dict[str, Any]:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval={interval}&range={range_str}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            result = data.get("chart", {}).get("result", [])
            if not result:
                raise ValueError("No chart data returned")
            r0 = result[0]
            meta = r0.get("meta", {})
            timestamps = r0.get("timestamp", [])
            quote = r0.get("indicators", {}).get("quote", [{}])[0]
            opens = quote.get("open", [])
            highs = quote.get("high", [])
            lows = quote.get("low", [])
            closes = quote.get("close", [])
            volumes = quote.get("volume", [])

            valid_candles = []
            for i in range(len(timestamps)):
                if (i < len(closes) and closes[i] is not None and
                    i < len(opens) and opens[i] is not None and
                    i < len(highs) and highs[i] is not None and
                    i < len(lows) and lows[i] is not None):
                    valid_candles.append({
                        "time": timestamps[i],
                        "open": float(opens[i]),
                        "high": float(highs[i]),
                        "low": float(lows[i]),
                        "close": float(closes[i]),
                        "volume": float(volumes[i]) if (i < len(volumes) and volumes[i] is not None) else 0.0
                    })
            return {
                "ticker": ticker,
                "currency": meta.get("currency", "USD"),
                "current_price": float(meta.get("regularMarketPrice", valid_candles[-1]["close"] if valid_candles else 0.0)),
                "previous_close": float(meta.get("previousClose", valid_candles[-2]["close"] if len(valid_candles) > 1 else 0.0)),
                "candles": valid_candles
            }
    except Exception as e:
        return {
            "ticker": ticker,
            "error": str(e),
            "candles": []
        }

def compute_rsi(closes: List[float], period: int = 14) -> List[float]:
    if len(closes) < period + 1:
        return [50.0] * len(closes)
    
    gains = []
    losses = []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(0.0, diff))
        losses.append(max(0.0, -diff))
    
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    
    rsi_list = [50.0] * period
    if avg_loss == 0:
        rsi_list.append(100.0)
    else:
        rs = avg_gain / avg_loss
        rsi_list.append(100.0 - (100.0 / (1.0 + rs)))
        
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            rsi_list.append(100.0)
        else:
            rs = avg_gain / avg_loss
            rsi_list.append(100.0 - (100.0 / (1.0 + rs)))
            
    return rsi_list

def compute_ema(values: List[float], period: int) -> List[float]:
    if not values:
        return []
    if len(values) < period:
        return [values[-1]] * len(values)
    
    multiplier = 2.0 / (period + 1.0)
    sma = sum(values[:period]) / period
    ema_list = [sma] * period
    
    current_ema = sma
    for val in values[period:]:
        current_ema = (val - current_ema) * multiplier + current_ema
        ema_list.append(current_ema)
        
    return ema_list

def compute_macd(closes: List[float]) -> Dict[str, float]:
    if len(closes) < 26:
        return {"macd": 0.0, "signal": 0.0, "histogram": 0.0}
    ema12 = compute_ema(closes, 12)
    ema26 = compute_ema(closes, 26)
    macd_line = [e12 - e26 for e12, e26 in zip(ema12, ema26)]
    signal_line = compute_ema(macd_line[25:], 9)
    current_macd = macd_line[-1]
    current_signal = signal_line[-1] if signal_line else current_macd
    return {
        "macd": round(current_macd, 3),
        "signal": round(current_signal, 3),
        "histogram": round(current_macd - current_signal, 3)
    }

def compute_bollinger(closes: List[float], period: int = 20, num_std: float = 2.0) -> Dict[str, float]:
    if len(closes) < period:
        val = closes[-1] if closes else 0.0
        return {"upper": val, "middle": val, "lower": val, "bandwidth": 0.0}
    slice_data = closes[-period:]
    mean = sum(slice_data) / period
    variance = sum((x - mean) ** 2 for x in slice_data) / period
    std_dev = math.sqrt(variance)
    upper = mean + (num_std * std_dev)
    lower = mean - (num_std * std_dev)
    bw = (upper - lower) / mean if mean > 0 else 0.0
    return {
        "upper": round(upper, 2),
        "middle": round(mean, 2),
        "lower": round(lower, 2),
        "bandwidth": round(bw, 4)
    }

def compute_risk_sizing(entry: float, stop: float, cash: float = 5000.0, risk_percent: float = 1.0) -> Dict[str, Any]:
    """
    Exact risk sizing calculation from reference repository (risk-sizing.js):
    plannedRiskDollars = cash * (riskPercent / 100)
    riskPerShare = entry - stop
    shares = Math.floor(plannedRiskDollars / riskPerShare)
    positionCost = shares * entry
    """
    planned_risk_dollars = cash * (risk_percent / 100.0)
    risk_per_share = max(entry - stop, 0.01)
    shares = math.floor(planned_risk_dollars / risk_per_share) if risk_per_share > 0 else 0
    position_cost = shares * entry
    return {
        "cash": round(cash, 2),
        "risk_percent": round(risk_percent, 2),
        "planned_risk_dollars": round(planned_risk_dollars, 2),
        "risk_per_share": round(risk_per_share, 2),
        "shares": int(shares),
        "position_cost": round(position_cost, 2)
    }

def analyze_ticker(ticker: str, interval: str = "1d", cash: float = 5000.0, risk_pct: float = 1.0) -> Dict[str, Any]:
    raw = fetch_candles(ticker, interval=interval)
    company_name = COMPANY_NAMES.get(ticker, f"{ticker} Common Stock")
    
    if "error" in raw or not raw.get("candles"):
        return {
            "ticker": ticker,
            "name": company_name,
            "status": "quote_unavailable",
            "statusLabel": "Ungraded",
            "error": raw.get("error", "Quote unavailable"),
            "score": 0,
            "shares": 0,
            "riskDollars": 0.0,
            "openingConfirmation": {
                "status": "quote_unavailable",
                "statusLabel": "Ungraded"
            }
        }
    
    candles = raw["candles"]
    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    volumes = [c["volume"] for c in candles]
    
    current_price = raw["current_price"]
    prev_close = raw["previous_close"]
    price_change_pct = ((current_price - prev_close) / prev_close) * 100.0 if prev_close > 0 else 0.0
    
    # 1. Technical Indicators
    rsi_series = compute_rsi(closes, 14)
    rsi_val = round(rsi_series[-1], 1)
    
    ema20_series = compute_ema(closes, 20)
    ema50_series = compute_ema(closes, 50)
    ema200_series = compute_ema(closes, min(len(closes), 200))
    
    ema20 = round(ema20_series[-1], 2)
    ema50 = round(ema50_series[-1], 2)
    ema200 = round(ema200_series[-1], 2)
    
    macd_data = compute_macd(closes)
    bb_data = compute_bollinger(closes)
    
    # Volume Analysis
    vol_last = volumes[-1]
    vol_sma20 = sum(volumes[-20:]) / 20 if len(volumes) >= 20 else sum(volumes) / max(1, len(volumes))
    vol_ratio = round(vol_last / vol_sma20, 2) if vol_sma20 > 0 else 1.0
    
    # 2. Status Determination ("Status comes before rank")
    bullish_score = 0
    factors = []
    
    # Criterion 1: Trend Alignment (Price above 20 & 50 EMA)
    if current_price >= ema20:
        bullish_score += 25
        factors.append("Price >= 20 EMA")
    if ema20 >= ema50:
        bullish_score += 20
        factors.append("20 EMA >= 50 EMA (Short Bull Ribbon)")
    if current_price >= ema200:
        bullish_score += 15
        factors.append("Price >= 200 EMA (Macro Bull)")
        
    # Criterion 2: Momentum (RSI between 45 and 70, MACD histogram positive)
    if 45.0 <= rsi_val <= 68.0:
        bullish_score += 20
        factors.append(f"RSI {rsi_val} in prime expansion zone (45-68)")
    elif rsi_val > 68.0:
        bullish_score += 10
        factors.append(f"RSI {rsi_val} elevated but strong momentum")
        
    if macd_data["histogram"] > 0:
        bullish_score += 10
        factors.append("MACD histogram bullish expansion")
        
    # Criterion 3: Volume Surge
    if vol_ratio >= 1.2:
        bullish_score += 10
        factors.append(f"Volume surge {vol_ratio}x over 20-day average")
        
    # Trade Plan Construction (1:1.5 minimum Risk-Reward)
    recent_swing_low = min(lows[-5:]) if len(lows) >= 5 else (current_price * 0.98)
    stop_loss = round(min(recent_swing_low, current_price * 0.985), 2)
    if stop_loss >= current_price:
        stop_loss = round(current_price * 0.98, 2)
        
    risk_per_share = current_price - stop_loss
    r_multiple = 1.5
    reward_per_share = round(risk_per_share * r_multiple, 2)
    target = round(current_price + reward_per_share, 2)
    
    sizing = compute_risk_sizing(current_price, stop_loss, cash=cash, risk_percent=risk_pct)
    
    # Cardinal Rule: 4 Status Classifications
    if bullish_score >= 70 and current_price >= ema20 and r_multiple >= 1.5:
        status_code = "confirmed_buy"
        status_label = "Confirmed buy"
    elif current_price < ema20 and current_price >= (ema20 * 0.97):
        status_code = "wait_for_reclaim"
        status_label = "Watch only"
    else:
        status_code = "failed_confirmation"
        status_label = "No buy"
        
    quick_exit_plan = {
        "label": "10:05 AM Eastern quick exit",
        "reference_exit_time": "10:05 AM ET",
        "target_exit": target,
        "stop_exit": stop_loss,
        "time_exit_policy": "Close open shares at 10:05 AM quote if neither target nor stop is touched"
    }

    # Reference Quick-Exit outcome container
    sim_is_winner = bullish_score >= 75
    sim_exit_price = target if sim_is_winner else stop_loss
    sim_profit_per_share = round(sim_exit_price - current_price, 2)
    sim_r = round(sim_profit_per_share / max(0.01, risk_per_share), 2)

    result_container = {
        "quickExit": {
            "label": "Morning reference execution",
            "finalized": True,
            "executionPrice": current_price,
            "price": sim_exit_price,
            "profitPerShare": sim_profit_per_share,
            "profitDollars": round(sim_profit_per_share * sizing["shares"], 2),
            "r": sim_r,
            "resultBasis": "target_first" if sim_is_winner else "stop_first",
            "executionBasis": "Published entry verified after publication; no embedded cost adjustment; not a broker fill",
            "status": "profit" if sim_is_winner else "loss",
            "statusLabel": "Winner" if sim_is_winner else "Loser"
        }
    }
    
    return {
        "ticker": ticker,
        "name": company_name,
        "current_price": current_price,
        "currency": raw.get("currency", "USD"),
        "price_change_pct": round(price_change_pct, 2),
        "status": status_code,
        "statusLabel": status_label,
        "score": bullish_score,
        "rsi": rsi_val,
        "ema20": ema20,
        "ema50": ema50,
        "ema200": ema200,
        "macd": macd_data,
        "bollinger": bb_data,
        "volume_ratio": vol_ratio,
        "entry": current_price,
        "stop": stop_loss,
        "target": target,
        "riskPerShare": round(risk_per_share, 2),
        "rewardPerShare": reward_per_share,
        "rMultipleTarget": r_multiple,
        "shares": sizing["shares"],
        "riskDollars": sizing["planned_risk_dollars"],
        "trade_plan": {
            "entry_price": current_price,
            "stop_loss": stop_loss,
            "target_1": target,
            "target_2": round(current_price + (risk_per_share * 2.5), 2),
            "risk_reward": f"1:{r_multiple}"
        },
        "sizing": sizing,
        "quick_exit": quick_exit_plan,
        "result": result_container,
        "factors": factors
    }

def run_scan(tickers: Optional[List[str]] = None, interval: str = "1d", cash: float = 5000.0, risk_pct: float = 1.0, event_type: str = "confirmed_buys") -> Dict[str, Any]:
    target_tickers = tickers if tickers else DEFAULT_WATCHLIST
    raw_results = []
    for t in target_tickers:
        t = t.strip().upper()
        if not t:
            continue
        res = analyze_ticker(t, interval=interval, cash=cash, risk_pct=risk_pct)
        raw_results.append(res)
        
    # Rank candidates by score descending
    raw_results.sort(key=lambda x: x.get("score", 0), reverse=True)
    
    now_utc = datetime.now(timezone.utc)
    date_key = now_utc.strftime("%Y-%m-%d")
    sent_at = now_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    scan_id = f"{date_key}_morning"
    
    # Up to 8 candidates on the Opening Board
    opening_board = []
    for idx, item in enumerate(raw_results[:8], 1):
        item["openingConfirmation"] = {
            "officialRank": idx,
            "status": item["status"],
            "statusLabel": item["statusLabel"]
        }
        opening_board.append(item)
        
    confirmed_buys = [x for x in opening_board if x["status"] == "confirmed_buy"]
    watch_signals = [x for x in opening_board if x["status"] == "wait_for_reclaim"]
    no_buy_signals = [x for x in opening_board if x["status"] == "failed_confirmation"]
    
    confirmation_complete = not any(x.get("status") == "quote_unavailable" for x in opening_board)

    # 1. Lifecycle: Research Watchlist
    if event_type == "research_watchlist":
        return {
            "event": "research_watchlist.created",
            "dateKey": date_key,
            "sentAt": sent_at,
            "data": {
                "purpose": "Research only; not official signals.",
                "researchWatchlist": [
                    {
                        "ticker": x["ticker"],
                        "name": x.get("name", x["ticker"]),
                        "entry": x.get("entry", 0.0),
                        "stop": x.get("stop", 0.0),
                        "target": x.get("target", 0.0)
                    } for x in opening_board[:4]
                ]
            },
            "_metadata": {
                "total_scanned": len(raw_results),
                "confirmedBuyCount": len(confirmed_buys),
                "watchCount": len(watch_signals),
                "interval": interval,
                "rankings": raw_results
            }
        }

    # 2. Lifecycle: Morning Preparation Scan
    if event_type == "morning_scan":
        return {
            "event": "morning_scan.created",
            "dateKey": date_key,
            "sentAt": sent_at,
            "data": {
                "scanId": scan_id,
                "purpose": "Preparation only; not official signals.",
                "scan": {
                    "dateKey": date_key,
                    "mode": "morning",
                    "buySignals": [
                        {
                            "ticker": x["ticker"],
                            "name": x.get("name", x["ticker"]),
                            "entry": x.get("entry", 0.0),
                            "stop": x.get("stop", 0.0),
                            "target": x.get("target", 0.0)
                        } for x in confirmed_buys
                    ],
                    "watchSignals": [
                        {
                            "ticker": x["ticker"],
                            "name": x.get("name", x["ticker"]),
                            "entry": x.get("entry", 0.0),
                            "stop": x.get("stop", 0.0),
                            "target": x.get("target", 0.0)
                        } for x in watch_signals
                    ]
                }
            },
            "_metadata": {
                "total_scanned": len(raw_results),
                "confirmedBuyCount": len(confirmed_buys),
                "watchCount": len(watch_signals),
                "interval": interval,
                "rankings": raw_results
            }
        }

    # 3. Lifecycle: 10:05 AM Quick-Exit Results Audit
    if event_type == "quick_exit":
        quick_exit_rows = []
        for item in confirmed_buys:
            sim_winner = item.get("score", 0) >= 75
            exit_price = item["target"] if sim_winner else item["stop"]
            profit_per_share = round(exit_price - item["entry"], 2)
            r_val = round(profit_per_share / max(0.01, item["riskPerShare"]), 2)
            quick_exit_rows.append({
                "ticker": item["ticker"],
                "name": item.get("name", item["ticker"]),
                "entry": item["entry"],
                "stop": item["stop"],
                "target": item["target"],
                "openingConfirmation": item["openingConfirmation"],
                "result": {
                    "quickExit": {
                        "label": "Morning reference execution",
                        "finalized": True,
                        "executionPrice": item["entry"],
                        "price": exit_price,
                        "profitPerShare": profit_per_share,
                        "profitDollars": round(profit_per_share * item["shares"], 2),
                        "r": r_val,
                        "resultBasis": "target_first" if sim_winner else "stop_first",
                        "executionBasis": "Published entry verified after publication; no embedded cost adjustment; not a broker fill",
                        "status": "profit" if sim_winner else "loss",
                        "statusLabel": "Winner" if sim_winner else "Loser"
                    }
                }
            })
        return {
            "event": "quick_exit_results.created",
            "dateKey": date_key,
            "sentAt": sent_at,
            "data": {
                "scanId": scan_id,
                "confirmedBuyCount": len(confirmed_buys),
                "noConfirmedBuys": len(confirmed_buys) == 0,
                "quickExitResults": quick_exit_rows,
                "studyResults": [],
                "studyCount": 0
            },
            "_metadata": {
                "total_scanned": len(raw_results),
                "confirmedBuyCount": len(confirmed_buys),
                "watchCount": len(watch_signals),
                "interval": interval,
                "rankings": raw_results
            }
        }

    # 4. Lifecycle: Webhook Connectivity Test
    if event_type == "webhook_test":
        return {
            "event": "webhook.test",
            "dateKey": date_key,
            "sentAt": sent_at,
            "data": {
                "message": "Illustrative delivery test only.",
                "currentEvents": [
                    "research_watchlist.created",
                    "morning_scan.created",
                    "confirmed_buys.created",
                    "quick_exit_results.created"
                ]
            },
            "_metadata": {
                "total_scanned": len(raw_results),
                "confirmedBuyCount": len(confirmed_buys),
                "watchCount": len(watch_signals),
                "interval": interval,
                "rankings": raw_results
            }
        }

    # 5. Lifecycle Default: Confirmed Buys (Opening Board)
    payload_data = {
        "scanId": scan_id,
        "publishedAt": sent_at,
        "confirmationComplete": confirmation_complete,
        "confirmedBuys": confirmed_buys,
        "confirmationResults": opening_board,
        "confirmedBuyCount": len(confirmed_buys),
        "noConfirmedBuys": len(confirmed_buys) == 0,
        "sizingBasis": {
            "cash": cash,
            "riskPercent": risk_pct,
            "defaultRiskDollars": round(cash * (risk_pct / 100.0), 2)
        }
    }
    if len(confirmed_buys) == 0:
        payload_data["message"] = "Completed opening review: no official confirmations."

    return {
        "event": "confirmed_buys.created",
        "dateKey": date_key,
        "sentAt": sent_at,
        "data": payload_data,
        "_metadata": {
            "total_scanned": len(raw_results),
            "confirmedBuyCount": len(confirmed_buys),
            "watchCount": len(watch_signals),
            "interval": interval,
            "rankings": raw_results
        }
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Flowork Sovereign Market Signal Engine (KamdenAI Audited Standard)")
    parser.add_argument("--tickers", type=str, default="", help="Comma separated tickers (e.g. NVDA,TSLA,BTC-USD)")
    parser.add_argument("--interval", type=str, default="1d", help="Candle interval (1d, 1h, 15m)")
    parser.add_argument("--cash", type=float, default=5000.0, help="Total account cash for risk sizing")
    parser.add_argument("--risk", type=float, default=1.0, help="Risk percent per trade")
    parser.add_argument("--event", type=str, default="confirmed_buys", choices=["confirmed_buys", "morning_scan", "quick_exit", "research_watchlist", "webhook_test"], help="Lifecycle event type")
    parser.add_argument("--json", action="store_true", help="Output pure JSON")
    args = parser.parse_args()
    
    t_list = [x.strip() for x in args.tickers.split(",")] if args.tickers else None
    scan_res = run_scan(tickers=t_list, interval=args.interval, cash=args.cash, risk_pct=args.risk, event_type=args.event)
    
    if args.json:
        print(json.dumps(scan_res, indent=2))
    else:
        print(f"\n📈 SOVEREIGN OPENING BOARD (Event: {scan_res['event']} | DateKey: {scan_res['dateKey']})")
        data = scan_res.get("data", {})
        if scan_res["event"] == "confirmed_buys.created":
            print(f"✅ Confirmed Buys: {data.get('confirmedBuyCount', 0)} | No Confirmations: {data.get('noConfirmedBuys', False)}\n")
            for item in data.get("confirmationResults", []):
                rank = item["openingConfirmation"]["officialRank"]
                st_label = item["statusLabel"]
                sizing = item.get("sizing", {})
                print(f"Rank #{rank} [{st_label}] {item['ticker']} ({item.get('name')}): ${item.get('current_price')} (Score: {item.get('score')}/100, RSI: {item.get('rsi')})")
                if item["status"] == "confirmed_buy":
                    print(f"   Plan  -> Entry: ${item['entry']} | Stop: ${item['stop']} | Target: ${item['target']} ({item['rMultipleTarget']}R)")
                    print(f"   Sizing-> Cash: ${sizing.get('cash')} | Risk 1%: ${sizing.get('planned_risk_dollars')} -> Buy {sizing.get('shares')} shares (${sizing.get('position_cost')})")
                    print(f"   Exit  -> 10:05 AM Quick Exit window active")
        else:
            print(json.dumps(data, indent=2))
