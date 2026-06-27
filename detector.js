// RSI tabanli boga uyumsuzlugu (bullish divergence) tespiti.
// Python detector.py'nin birebir JS karsiligi. Saf fonksiyonlar, ag yok.

export const DEFAULT_PARAMS = {
  rsiPeriod: 14,
  rsiDipThreshold: 35.0,   // 1. dip RSI bunun altinda olmali (anlamli dip)
  pivotLookback: 3,        // dip onayi icin sag/sol mum sayisi
  maxBarsBetween: 50,      // iki dip arasi max mum
  minBarsBetween: 3,
  priceTolerancePct: 0.5,  // iki dip fiyat farki %
  rsiMinDiff: 2.0,         // 2. dip RSI, 1. dipten en az bu kadar yukarida
  rsiMaxDiff: 20.0,
  requireWick: true,
  wickMinRatio: 0.25,      // alt fitil / (high-low)
  freshWithinBars: 8,
};

// closes ile ayni uzunlukta dizi; ilk 'period' deger null.
export function computeRSI(closes, period = 14) {
  const n = closes.length;
  const rsi = new Array(n).fill(null);
  if (n <= period) return rsi;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gains += ch; else losses -= ch;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const calc = (ag, al) => (al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  rsi[period] = calc(avgGain, avgLoss);

  for (let i = period + 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = calc(avgGain, avgLoss);
  }
  return rsi;
}

export function findPivotLows(lows, lookback) {
  const pivots = [];
  const n = lows.length;
  for (let i = lookback; i < n - lookback; i++) {
    const center = lows[i];
    let isPivot = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (lows[j] < center) { isPivot = false; break; }
    }
    if (!isPivot) continue;
    let dup = false;
    for (let j = i - lookback; j < i; j++) {
      if (lows[j] === center) { dup = true; break; }
    }
    if (!dup) pivots.push(i);
  }
  return pivots;
}

export function lowerWickRatio(c) {
  const rng = c.high - c.low;
  if (rng <= 0) return 0;
  const wick = Math.min(c.open, c.close) - c.low;
  return Math.max(0, wick) / rng;
}

const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

// candles: [{openTime, open, high, low, close, volume}]
export function detectSignals(candles, symbol, interval, params = DEFAULT_PARAMS) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const n = candles.length;
  if (n < p.rsiPeriod + p.pivotLookback + 2) return [];

  const closes = candles.map((c) => c.close);
  const lows = candles.map((c) => c.low);
  const rsi = computeRSI(closes, p.rsiPeriod);
  const pivots = findPivotLows(lows, p.pivotLookback);
  const last = n - 1;

  const signals = [];
  const seenDip2 = new Set();

  for (let a = 0; a < pivots.length; a++) {
    const i1 = pivots[a];
    const r1 = rsi[i1];
    if (r1 == null) continue;
    if (r1 >= p.rsiDipThreshold) continue;
    if (p.requireWick && lowerWickRatio(candles[i1]) < p.wickMinRatio) continue;

    for (let b = a + 1; b < pivots.length; b++) {
      const i2 = pivots[b];
      const bars = i2 - i1;
      if (bars < p.minBarsBetween) continue;
      if (bars > p.maxBarsBetween) break;

      const rr2 = rsi[i2];
      if (rr2 == null) continue;

      const priceDiff = (Math.abs(lows[i2] - lows[i1]) / lows[i1]) * 100;
      if (priceDiff > p.priceTolerancePct) continue;

      const rsiDiff = rr2 - r1;
      if (rsiDiff < p.rsiMinDiff || rsiDiff > p.rsiMaxDiff) continue;

      if (p.requireWick && lowerWickRatio(candles[i2]) < p.wickMinRatio) continue;
      if (seenDip2.has(i2)) continue;
      seenDip2.add(i2);

      const barsAgo = last - i2;
      signals.push({
        symbol, interval,
        dip1Index: i1, dip2Index: i2,
        dip1Time: candles[i1].openTime, dip2Time: candles[i2].openTime,
        dip1Price: lows[i1], dip2Price: lows[i2],
        dip1Rsi: r2(r1), dip2Rsi: r2(rr2),
        priceDiffPct: r3(priceDiff), rsiDiff: r2(rsiDiff),
        barsBetween: bars, barsAgo,
        isFresh: barsAgo <= p.freshWithinBars,
      });
      break;
    }
  }

  signals.sort((x, y) => y.dip2Index - x.dip2Index);
  return signals;
}
