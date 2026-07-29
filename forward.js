// Ileri test (canli/kagit uzerinde test) motoru.
// - Taramada cikan TAZE sinyaller otomatik kaydedilir (localStorage).
// - Acik kayitlar mumlarla degerlendirilir: high>=hedef -> dogru (tp),
//   low<=stop -> yanlis (sl). Ayni mumda ikisi de olursa STOP sayilir (temkinli,
//   backtest ile ayni kural). Ufuk asilirsa "süre doldu" (kapanisla getirili).
// Not: localStorage tarayicida kalicidir; bu proje Vercel'de kendi siten olarak
// calistigi icin uygundur. Kayitlar cihaz-bazlidir.

import { makePlan, PLAN } from "./tradeplan.js";

export const FWD_KEY = "noll_fwd_v1";
export const FWD = {
  horizonBars: 48,   // bir kaydi en fazla kac mum takip et
  maxRecords: 400,   // depoda tutulacak max kayit
};

function loadAll(storage) {
  try { return JSON.parse(storage.getItem(FWD_KEY) || "[]"); }
  catch { return []; }
}
function saveAll(storage, arr) {
  storage.setItem(FWD_KEY, JSON.stringify(arr.slice(-FWD.maxRecords)));
}

export function recordId(sig) { return `${sig.symbol}_${sig.interval}_${sig.dip2Time}`; }

// Taze sinyalleri kaydet. Ayni sinyal (symbol+interval+dip2Time) iki kez kaydedilmez.
// entryPrice: kayit anindaki guncel fiyat (son kapanis).
export function recordSignals(storage, signals, priceBySymbol, plan = PLAN) {
  const all = loadAll(storage);
  const seen = new Set(all.map((t) => t.id));
  let added = 0;
  for (const s of signals) {
    if (!s.isFresh) continue;
    const id = recordId(s);
    if (seen.has(id)) continue;
    const px = priceBySymbol[s.symbol];
    if (!px) continue;
    const p = makePlan(s, px, plan);
    if (!p) continue;
    all.push({
      id, symbol: s.symbol, interval: s.interval,
      dip2Time: s.dip2Time, dip1Rsi: s.dip1Rsi, dip2Rsi: s.dip2Rsi,
      recordedAt: Date.now(),
      entry: p.entry, stop: p.stop, target: p.target,
      riskPct: p.riskPct, rewardPct: p.rewardPct, rr: p.rr,
      status: "open",      // open | tp | sl | expired
      resolvedAt: null, lastPrice: p.entry, lastPct: 0, barsSeen: 0,
    });
    seen.add(id); added++;
  }
  saveAll(storage, all);
  return added;
}

// Acik bir kaydi, gelen mumlarla degerlendir.
// candles: kayit anindaki (yarim) mum DAHIL olmali (openTime, kayittan bir interval oncesine kadar geri gidebilir).
// Adil kural: kayit anindaki yarim mumun high/low'u stop/hedef SAYILMAZ (bir kismi kayittan onceki
// fiyat hareketi olabilir); o mumdan sadece kapanis, "son fiyat" olarak alinir.
export function evaluateRecord(rec, candles) {
  const r = { ...rec };
  let bars = 0;
  for (const c of candles) {
    const partial = c.openTime <= r.recordedAt; // kayit aninda olusmakta olan mum
    if (partial) { r.lastPrice = c.close; continue; }
    bars++;
    if (c.low <= r.stop) { r.status = "sl"; r.resolvedAt = c.openTime; r.lastPrice = r.stop; break; }
    if (c.high >= r.target) { r.status = "tp"; r.resolvedAt = c.openTime; r.lastPrice = r.target; break; }
    r.lastPrice = c.close;
    if (bars >= FWD.horizonBars) { r.status = "expired"; r.resolvedAt = c.openTime; break; }
  }
  r.barsSeen = Math.max(r.barsSeen || 0, bars);
  r.lastPct = Math.round(((r.lastPrice / r.entry) - 1) * 10000) / 100;
  return r;
}

// Anlik (ticker) fiyati acik kayda uygula: son fiyati gunceller ve
// anlik fiyat stopu/hedefi gecmisse hemen sonuclandirir.
export function applyLivePrice(rec, livePrice, now = Date.now()) {
  if (rec.status !== "open" || !livePrice) return rec;
  const r = { ...rec, lastPrice: livePrice };
  if (livePrice <= r.stop) { r.status = "sl"; r.resolvedAt = now; r.lastPrice = r.stop; }
  else if (livePrice >= r.target) { r.status = "tp"; r.resolvedAt = now; r.lastPrice = r.target; }
  r.lastPct = Math.round(((r.lastPrice / r.entry) - 1) * 10000) / 100;
  return r;
}

export function updateRecords(storage, evaluatedById) {
  const all = loadAll(storage);
  const out = all.map((t) => evaluatedById[t.id] ? evaluatedById[t.id] : t);
  saveAll(storage, out);
  return out;
}

export function getRecords(storage) { return loadAll(storage); }
export function clearRecords(storage) { storage.removeItem(FWD_KEY); }
export function removeRecord(storage, id) {
  saveAll(storage, loadAll(storage).filter((t) => t.id !== id));
}

export function fwdStats(records) {
  const open = records.filter((t) => t.status === "open");
  const tp = records.filter((t) => t.status === "tp");
  const sl = records.filter((t) => t.status === "sl");
  const exp = records.filter((t) => t.status === "expired");
  const resolvedWithDirection = tp.length + sl.length;
  const winRate = resolvedWithDirection ? Math.round((tp.length / resolvedWithDirection) * 1000) / 10 : null;
  // sure dolanlarin son yuzdesi + tp odul + sl risk ile ortalama getiri
  const rets = [
    ...tp.map((t) => t.rewardPct),
    ...sl.map((t) => -t.riskPct),
    ...exp.map((t) => t.lastPct),
  ];
  const avg = rets.length ? Math.round((rets.reduce((s, x) => s + x, 0) / rets.length) * 100) / 100 : null;
  return {
    total: records.length, open: open.length,
    tp: tp.length, sl: sl.length, expired: exp.length,
    winRate, avgReturn: avg,
  };
}
