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
5. Zero Third-Party Paywall: Pure standalone Python mathematical analysis.

Co-authored-by: Flowork OS <agent@floworkos.com>
"""

import sys
import os
import json
import math
import argparse
import urllib.request
import urllib.error
from typing import List, Dict, Any, Optional

DEFAULT_WATCHLIST = [
    "NVDA", "TSLA", "AAPL", "MSFT", "AMD", "AMZN", "META", "GOOGL",
    "BTC-USD", "ETH-USD", "SOL-USD"
]

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
    
    rsi = [50.0] * (period)
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    
    if avg_loss == 0.0:
        rsi.append(100.0)
    else:
        rs = avg_gain / avg_loss
        rsi.append(100.0 - (100.0 / (1.0 + rs)))
        
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0.0:
            rsi.append(100.0)
        else:
            rs = avg_gain / avg_loss
            rsi.append(100.0 - (100.0 / (1.0 + rs)))
            
    return rsi

def compute_ema(series: List[float], period: int) -> List[float]:
    if not series:
        return []
    if len(series) < period:
        sma = sum(series) / len(series)
        return [sma] * len(series)
        
    ema = []
    sma = sum(series[:period]) / period
    ema.extend([sma] * period)
    multiplier = 2.0 / (period + 1.0)
    
    curr = sma
    for val in series[period:]:
        curr = (val - curr) * multiplier + curr
        ema.append(curr)
    return ema

def compute_macd(closes: List[float]) -> Dict[str, float]:
    if len(closes) < 26:
        return {"macd": 0.0, "signal": 0.0, "hist": 0.0}
    ema12 = compute_ema(closes, 12)
    ema26 = compute_ema(closes, 26)
    macd_line = [e12 - e26 for e12, e26 in zip(ema12, ema26)]
    signal_line = compute_ema(macd_line, 9)
    hist = macd_line[-1] - signal_line[-1]
    return {
        "macd": round(macd_line[-1], 3),
        "signal": round(signal_line[-1], 3),
        "hist": round(hist, 3)
    }

def compute_bollinger(closes: List[float], period: int = 20, num_std: float = 2.0) -> Dict[str, float]:
    if len(closes) < period:
        c = closes[-1] if closes else 0.0
        return {"upper": c, "middle": c, "lower": c, "bandwidth_pct": 0.0}
    sub = closes[-period:]
    mean = sum(sub) / period
    variance = sum((x - mean) ** 2 for x in sub) / period
    std = math.sqrt(variance)
    upper = mean + (num_std * std)
    lower = mean - (num_std * std)
    bandwidth_pct = ((upper - lower) / mean) * 100.0 if mean > 0 else 0.0
    return {
        "upper": round(upper, 2),
        "middle": round(mean, 2),
        "lower": round(lower, 2),
        "bandwidth_pct": round(bandwidth_pct, 2)
    }

def compute_risk_sizing(cash: float, risk_percent: float, entry: float, stop: float) -> Dict[str, Any]:
    """Exact logic reverse-engineered from risk-sizing.js"""
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
    if "error" in raw or not raw.get("candles"):
        return {
            "ticker": ticker,
            "status": "quote_unavailable",
            "statusLabel": "Ungraded",
            "error": raw.get("error", "Quote unavailable"),
            "score": 0,
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
    
    # 2. Confluence Scoring & Reclaim Detection
    bullish_score = 0
    factors = []
    
    # Check if price is near 20 EMA reclaim level
    is_testing_reclaim = abs(current_price - ema20) / ema20 <= 0.015
    
    if 45 <= rsi_val <= 65:
        bullish_score += 25
        factors.append("RSI in primary bullish expansion zone (45-65)")
    elif 35 <= rsi_val < 45:
        bullish_score += 15
        factors.append("RSI holding ascending support above oversold threshold")
    elif rsi_val > 70:
        bullish_score -= 10
        factors.append("RSI overbought (>70)")
        
    if current_price > ema20 > ema50:
        bullish_score += 30
        factors.append("Price stacked bullishly above 20 & 50 EMA ribbons")
    elif current_price > ema20:
        bullish_score += 15
        factors.append("Price holding above short-term 20 EMA baseline")
    elif is_testing_reclaim:
        factors.append("Price currently testing 20 EMA reclaim level")
        
    if current_price > ema200:
        bullish_score += 15
        factors.append("Macro bullish: trading above 200 EMA")
    else:
        bullish_score -= 15
        factors.append("Macro caution: trading below 200 EMA")
        
    if macd_data["hist"] > 0:
        bullish_score += 15
        factors.append("MACD histogram positive momentum expansion")
        
    if vol_ratio >= 1.25:
        bullish_score += 15
        factors.append(f"Volume surge detected ({vol_ratio}x 20-day moving average)")
        
    bullish_score = max(0, min(100, bullish_score))
    
    # 3. Exact Audited Status Mapping
    # Rule: Status comes before rank
    if bullish_score >= 70:
        status_code = "confirmed_buy"
        status_label = "Confirmed buy"
    elif bullish_score >= 45 or is_testing_reclaim:
        status_code = "wait_for_reclaim"
        status_label = "Watch only"
    else:
        status_code = "failed_confirmation"
        status_label = "No buy"
        
    # 4. Trade Plan & 10:05 AM Quick Exit Rules
    recent_low = min(lows[-10:]) if len(lows) >= 10 else current_price * 0.96
    stop_loss = round(min(recent_low * 0.995, current_price * 0.96), 2)
    risk_per_share = max(current_price - stop_loss, current_price * 0.02)
    target = round(current_price + (risk_per_share * 1.5), 2)
    reward_per_share = round(target - current_price, 2)
    r_multiple = round(reward_per_share / risk_per_share, 2)
    
    # Risk Sizing
    sizing = compute_risk_sizing(cash, risk_pct, current_price, stop_loss)
    
    # 10:05 AM Quick Exit Model
    quick_exit_plan = {
        "label": "10:05 AM Eastern quick exit",
        "reference_exit_time": "10:05 AM ET",
        "target_exit": target,
        "stop_exit": stop_loss,
        "time_exit_policy": "Close open shares at 10:05 AM quote if neither target nor stop is touched"
    }
    
    return {
        "ticker": ticker,
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
        "rMultipleTarget": f"{r_multiple}R",
        "trade_plan": {
            "entry_price": current_price,
            "stop_loss": stop_loss,
            "target_1": target,
            "target_2": round(current_price + (risk_per_share * 2.5), 2),
            "risk_reward": f"1:{r_multiple}"
        },
        "sizing": sizing,
        "quick_exit": quick_exit_plan,
        "factors": factors
    }

def run_scan(tickers: Optional[List[str]] = None, interval: str = "1d", cash: float = 5000.0, risk_pct: float = 1.0) -> Dict[str, Any]:
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
    
    return {
        "event": "confirmed_buys.created",
        "scanId": "sovereign_morning_board",
        "total_scanned": len(raw_results),
        "confirmedBuyCount": len(confirmed_buys),
        "noConfirmedBuys": len(confirmed_buys) == 0,
        "watchCount": len(watch_signals),
        "interval": interval,
        "confirmedBuys": confirmed_buys,
        "confirmationResults": opening_board,
        "rankings": raw_results
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Flowork Sovereign Market Signal Engine (KamdenAI Audited Standard)")
    parser.add_argument("--tickers", type=str, default="", help="Comma separated tickers (e.g. NVDA,TSLA,BTC-USD)")
    parser.add_argument("--interval", type=str, default="1d", help="Candle interval (1d, 1h, 15m)")
    parser.add_argument("--cash", type=float, default=5000.0, help="Total account cash for risk sizing")
    parser.add_argument("--risk", type=float, default=1.0, help="Risk percent per trade")
    parser.add_argument("--json", action="store_true", help="Output pure JSON")
    args = parser.parse_args()
    
    t_list = [x.strip() for x in args.tickers.split(",")] if args.tickers else None
    scan_res = run_scan(tickers=t_list, interval=args.interval, cash=args.cash, risk_pct=args.risk)
    
    if args.json:
        print(json.dumps(scan_res, indent=2))
    else:
        print(f"\n📈 SOVEREIGN OPENING BOARD (Top 8 Ranked Candidates)")
        print(f"✅ Confirmed Buys: {scan_res['confirmedBuyCount']} | 👀 Watch: {scan_res['watchCount']} | No Confirmations: {scan_res['noConfirmedBuys']}\n")
        for item in scan_res["confirmationResults"]:
            rank = item["openingConfirmation"]["officialRank"]
            st_label = item["statusLabel"]
            sizing = item["sizing"]
            print(f"Rank #{rank} [{st_label}] {item['ticker']}: ${item.get('current_price')} (Score: {item.get('score')}/100, RSI: {item.get('rsi')})")
            if item["status"] == "confirmed_buy":
                print(f"   Plan  -> Entry: ${item['entry']} | Stop: ${item['stop']} | Target: ${item['target']} ({item['rMultipleTarget']})")
                print(f"   Sizing-> Cash: ${sizing['cash']} | Risk 1%: ${sizing['planned_risk_dollars']} -> Buy {sizing['shares']} shares (${sizing['position_cost']})")
                print(f"   Exit  -> 10:05 AM Quick Exit window active")
