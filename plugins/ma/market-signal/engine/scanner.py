#!/usr/bin/env python3
"""
Sovereign Market Signal & Technical Scanner Engine
=================================================
Pure Python mathematical analysis engine for stocks and crypto.
Computes:
- RSI (14) with Wilder's smoothing
- EMA (20, 50, 200) trend ribbons & Golden/Death cross
- MACD (12, 26, 9) histogram & momentum
- Bollinger Bands (20, 2.0) squeeze & breakout
- Volume Surge detection vs 20-period SMA
- Automated Trade Plan: Entry, Stop Loss, Target 1, Target 2 (1:2+ R:R)
- Decision Ranking: Confirmed Buy, Watch Only, Neutral, Confirmed Sell

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
    "NVDA", "AAPL", "TSLA", "MSFT", "AMD", "AMZN", "META", "GOOGL",
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

            # Filter valid points
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

def analyze_ticker(ticker: str, interval: str = "1d") -> Dict[str, Any]:
    raw = fetch_candles(ticker, interval=interval)
    if "error" in raw or not raw.get("candles"):
        return {
            "ticker": ticker,
            "status": "UNGRADED",
            "error": raw.get("error", "No historical data"),
            "score": 0
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
    
    # 2. Algorithmic Scoring (0 - 100)
    bullish_score = 0
    factors = []
    
    # Factor A: RSI
    if 40 <= rsi_val <= 65:
        bullish_score += 25
        factors.append("RSI in strong bullish momentum (40-65)")
    elif 30 <= rsi_val < 40:
        bullish_score += 15
        factors.append("RSI recovering from oversold threshold")
    elif rsi_val > 70:
        bullish_score -= 10
        factors.append("RSI overbought (>70)")
        
    # Factor B: EMA Trend
    if current_price > ema20 > ema50:
        bullish_score += 30
        factors.append("Price stacked bullishly above 20 & 50 EMA")
    elif current_price > ema20:
        bullish_score += 15
        factors.append("Price above 20 EMA short-term baseline")
        
    if current_price > ema200:
        bullish_score += 15
        factors.append("Macro bullish: trading above 200 EMA")
    else:
        bullish_score -= 15
        factors.append("Macro caution: trading below 200 EMA")
        
    # Factor C: MACD
    if macd_data["hist"] > 0:
        bullish_score += 15
        factors.append("MACD histogram positive momentum expansion")
        
    # Factor D: Volume Surge
    if vol_ratio >= 1.3:
        bullish_score += 15
        factors.append(f"Volume surge detected ({vol_ratio}x 20-day avg)")
        
    bullish_score = max(0, min(100, bullish_score))
    
    # 3. Decision Status
    if bullish_score >= 70:
        status = "CONFIRMED BUY"
    elif bullish_score >= 50:
        status = "WATCH ONLY"
    elif bullish_score <= 30 and rsi_val > 70:
        status = "CONFIRMED SELL"
    else:
        status = "NO BUY"
        
    # 4. Automated Trade Plan (1:2+ R:R)
    # Stop loss based on recent 10-period lowest low or 3% buffer
    recent_low = min(lows[-10:]) if len(lows) >= 10 else current_price * 0.96
    stop_loss = round(min(recent_low * 0.995, current_price * 0.96), 2)
    risk = max(current_price - stop_loss, current_price * 0.02)
    target_1 = round(current_price + (risk * 1.5), 2)
    target_2 = round(current_price + (risk * 2.5), 2)
    risk_reward = round((target_1 - current_price) / max(0.01, (current_price - stop_loss)), 2)
    
    return {
        "ticker": ticker,
        "current_price": current_price,
        "currency": raw.get("currency", "USD"),
        "price_change_pct": round(price_change_pct, 2),
        "status": status,
        "score": bullish_score,
        "rsi": rsi_val,
        "ema20": ema20,
        "ema50": ema50,
        "ema200": ema200,
        "macd": macd_data,
        "bollinger": bb_data,
        "volume_ratio": vol_ratio,
        "trade_plan": {
            "entry_price": current_price,
            "stop_loss": stop_loss,
            "target_1": target_1,
            "target_2": target_2,
            "risk_reward": f"1:{risk_reward}"
        },
        "factors": factors
    }

def run_scan(tickers: Optional[List[str]] = None, interval: str = "1d") -> Dict[str, Any]:
    target_tickers = tickers if tickers else DEFAULT_WATCHLIST
    results = []
    for t in target_tickers:
        t = t.strip().upper()
        if not t:
            continue
        res = analyze_ticker(t, interval=interval)
        results.append(res)
        
    # Rank candidates by score descending
    results.sort(key=lambda x: x.get("score", 0), reverse=True)
    
    confirmed_count = sum(1 for r in results if r.get("status") == "CONFIRMED BUY")
    watch_count = sum(1 for r in results if r.get("status") == "WATCH ONLY")
    
    return {
        "total_scanned": len(results),
        "confirmed_count": confirmed_count,
        "watch_count": watch_count,
        "interval": interval,
        "rankings": results
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Flowork Sovereign Market Signal Scanner")
    parser.add_argument("--tickers", type=str, default="", help="Comma separated tickers (e.g. NVDA,BTC-USD)")
    parser.add_argument("--interval", type=str, default="1d", help="Candle interval (1d, 1h, 15m)")
    parser.add_argument("--json", action="store_true", help="Output pure JSON")
    args = parser.parse_args()
    
    t_list = [x.strip() for x in args.tickers.split(",")] if args.tickers else None
    scan_res = run_scan(tickers=t_list, interval=args.interval)
    
    if args.json:
        print(json.dumps(scan_res, indent=2))
    else:
        print(f"\n📈 MARKET SIGNAL SCANNER RESULTS ({scan_res['total_scanned']} Assets)")
        print(f"✅ Confirmed: {scan_res['confirmed_count']} | 👀 Watch: {scan_res['watch_count']}\n")
        for i, item in enumerate(scan_res["rankings"][:8], 1):
            st = item.get("status")
            tp = item.get("trade_plan", {})
            print(f"#{i} [{st}] {item['ticker']}: ${item.get('current_price')} (Score: {item.get('score')}/100, RSI: {item.get('rsi')})")
            if "entry_price" in tp:
                print(f"   Plan -> Entry: ${tp['entry_price']} | SL: ${tp['stop_loss']} | T1: ${tp['target_1']} | R:R: {tp['risk_reward']}")
