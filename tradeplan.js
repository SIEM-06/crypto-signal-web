// Islem plani: sinyalden giris / stop / hedef / risk-odul hesabi.
// Backtest ve canli test AYNI matematigi kullanir (tek kaynak).

export const PLAN = {
  rMultiple: 2.0,     // hedef = giris + R * risk
  stopBufferPct: 0.5, // stop, cift dibin bu kadar altinda
};

const r6 = (x) => Math.round(x * 1e6) / 1e6;

// entryPrice: plan kurulurken kullanilacak fiyat.
//  - canli sinyalde: son kapanis (guncel fiyat)
//  - backtest'te: onay mumunun kapanisi
export function makePlan(sig, entryPrice, plan = PLAN) {
  const structureLow = Math.min(sig.dip1Price, sig.dip2Price);
  const stop = structureLow * (1 - plan.stopBufferPct / 100);
  const risk = entryPrice - stop;
  if (risk <= 0) return null; // fiyat zaten stopun altinda -> plan gecersiz
  const target = entryPrice + plan.rMultiple * risk;
  const riskPct = (risk / entryPrice) * 100;
  const rewardPct = ((target - entryPrice) / entryPrice) * 100;
  return {
    entry: r6(entryPrice),
    stop: r6(stop),
    target: r6(target),
    riskPct: Math.round(riskPct * 100) / 100,
    rewardPct: Math.round(rewardPct * 100) / 100,
    rr: plan.rMultiple, // odul/risk orani
  };
}
