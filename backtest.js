// Backtest motoru. Her gecmis sinyali gercekci sekilde simule eder:
//  - Giris: sinyal ONAYLANDIGI an (2. dip + pivotLookback mum sonrasinin kapanisi).
//  - Stop:  cift dibin altina (yapisal stop) + kucuk tampon.
//  - Hedef: risk kadar mesafenin R kati (varsayilan 2R).
//  - Ufuk:  en fazla 'horizon' mum tutulur; ne stop ne hedef gelirse kapanista cikilir.
// Sonra kazanma orani, beklenti, profit factor, sermaye egrisi, max dususu hesaplar.

import { detectSignals } from "./detector.js";

export const DEFAULT_BT = {
  horizon: 24,        // bir islemi en fazla kac mum tut
  rMultiple: 2.0,     // hedef = giris + R * risk
  stopBufferPct: 0.5, // stop, yapisal dibin bu kadar altinda
  feePct: 0.1,        // tek yon islem ucreti (al+sat iki kez uygulanir)
};

const r2 = (x) => Math.round(x * 100) / 100;

export function simulateTrade(candles, sig, params, bt = DEFAULT_BT) {
  const last = candles.length - 1;
  const entryIndex = sig.dip2Index + params.pivotLookback; // sinyalin bilinebildigi ilk an
  if (entryIndex >= last) return null;

  const entry = candles[entryIndex].close;
  const structureLow = Math.min(sig.dip1Price, sig.dip2Price);
  const stop = structureLow * (1 - bt.stopBufferPct / 100);
  const risk = entry - stop;
  if (risk <= 0) return null;
  const target = entry + bt.rMultiple * risk;

  const end = Math.min(entryIndex + bt.horizon, last);
  let exitIndex = end, exitPrice = candles[end].close, outcome = "time";
  for (let i = entryIndex + 1; i <= end; i++) {
    const c = candles[i];
    if (c.low <= stop) { exitIndex = i; exitPrice = stop; outcome = "sl"; break; }   // ayni mumda ikisi de olursa stop oncelikli (temkinli)
    if (c.high >= target) { exitIndex = i; exitPrice = target; outcome = "tp"; break; }
  }

  const feeMult = (1 - bt.feePct / 100) * (1 - bt.feePct / 100);
  const returnPct = (exitPrice / entry * feeMult - 1) * 100;
  const rMultiple = (exitPrice - entry) / risk;

  return {
    symbol: sig.symbol,
    entryIndex, entryTime: candles[entryIndex].openTime, entry: r2(entry),
    stop: r2(stop), target: r2(target),
    exitIndex, exitTime: candles[exitIndex].openTime, exitPrice: r2(exitPrice),
    outcome, returnPct: r2(returnPct), rMultiple: r2(rMultiple),
    barsHeld: exitIndex - entryIndex,
  };
}

export function backtestSymbol(candles, symbol, interval, params, bt = DEFAULT_BT) {
  const signals = detectSignals(candles, symbol, interval, params);
  const trades = [];
  for (const s of signals) {
    const t = simulateTrade(candles, s, params, bt);
    if (t) trades.push(t);
  }
  return trades;
}

export function aggregate(trades) {
  const n = trades.length;
  if (!n) return { n: 0 };

  const sorted = [...trades].sort((a, b) => a.entryTime - b.entryTime);
  const rets = sorted.map((t) => t.returnPct);
  const wins = rets.filter((r) => r > 0);
  const losses = rets.filter((r) => r <= 0);

  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : 0);
  const med = (a) => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const grossProfit = sum(wins);
  const grossLoss = Math.abs(sum(losses));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;

  // Sermaye egrisi (her islem sirayla, %getiriyle bilesik)
  let equity = 100, peak = 100, maxDD = 0;
  const curve = [100];
  for (const t of sorted) {
    equity *= 1 + t.returnPct / 100;
    curve.push(equity);
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const tp = sorted.filter((t) => t.outcome === "tp").length;
  const sl = sorted.filter((t) => t.outcome === "sl").length;
  const time = sorted.filter((t) => t.outcome === "time").length;

  return {
    n,
    winRate: r2(wins.length / n * 100),
    avgReturn: r2(mean(rets)),
    medianReturn: r2(med(rets)),
    avgWin: r2(mean(wins)),
    avgLoss: r2(mean(losses)),
    expectancyR: r2(mean(sorted.map((t) => t.rMultiple))),
    profitFactor: profitFactor === Infinity ? Infinity : r2(profitFactor),
    totalReturn: r2(equity - 100),
    maxDrawdown: r2(maxDD),
    best: r2(Math.max(...rets)),
    worst: r2(Math.min(...rets)),
    tp, sl, time,
    equityCurve: curve.map((x) => r2(x)),
    trades: sorted,
  };
}
