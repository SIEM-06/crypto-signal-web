import { backtestSymbol, aggregate } from "./backtest.js";
import {
  SOURCE, BINANCE_BASE, DEFAULT_SYMBOLS, CONCURRENCY,
  EXCLUDE_PATTERNS, EXCLUDE_STABLES, PARAMS,
} from "./config.js";

const $ = (id) => document.getElementById(id);
const BT_LIMIT = 1000; // backtest icin daha cok gecmis
let busy = false;

function apiUrl(path, params) {
  const qs = new URLSearchParams(params).toString();
  if (SOURCE === "proxy") return `/api/binance?path=${encodeURIComponent(path)}&${qs}`;
  return `${BINANCE_BASE}${path}?${qs}`;
}
async function fetchKlines(symbol, interval) {
  const r = await fetch(apiUrl("/api/v3/klines", { symbol, interval, limit: BT_LIMIT }));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const rows = await r.json();
  return rows.map((x) => ({ openTime: +x[0], open: +x[1], high: +x[2], low: +x[3], close: +x[4], volume: +x[5] }));
}
async function fetchAllUsdtSymbols() {
  const r = await fetch(apiUrl("/api/v3/exchangeInfo", {}));
  if (!r.ok) throw new Error(`exchangeInfo HTTP ${r.status}`);
  const data = await r.json();
  return data.symbols.filter((s) => s.status === "TRADING" && s.quoteAsset === "USDT")
    .map((s) => s.symbol)
    .filter((sym) => !EXCLUDE_PATTERNS.some((p) => sym.includes(p)))
    .filter((sym) => !EXCLUDE_STABLES.includes(sym)).sort();
}

async function runPool(symbols, interval, bt, onProgress) {
  const trades = [], errors = [];
  let done = 0, idx = 0;
  async function worker() {
    while (idx < symbols.length) {
      const sym = symbols[idx++];
      try {
        const candles = await fetchKlines(sym, interval);
        trades.push(...backtestSymbol(candles, sym, interval, PARAMS, bt));
      } catch (e) { errors.push(`${sym}: ${e.message}`); }
      finally { done++; onProgress(done, symbols.length); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, worker));
  return { trades, errors };
}

const fmtTime = (ms) => new Date(ms).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
const sign = (v) => (v > 0 ? "+" : "") + v.toFixed(2);
const cls = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");

function equityCurveSVG(curve) {
  const w = 1000, h = 240, pad = 10;
  if (curve.length < 2) return "";
  const min = Math.min(...curve), max = Math.max(...curve);
  const span = max - min || 1;
  const x = (i) => pad + (i / (curve.length - 1)) * (w - 2 * pad);
  const y = (v) => pad + (1 - (v - min) / span) * (h - 2 * pad);
  const pts = curve.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const baseY = y(100).toFixed(1);
  const last = curve[curve.length - 1];
  const col = last >= 100 ? "#36f5a0" : "#ff5468";
  const area = `${pad},${h - pad} ${pts} ${(w - pad)},${h - pad}`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:240px">
    <polyline points="${pad},${baseY} ${w - pad},${baseY}" fill="none" stroke="rgba(0,229,255,.2)" stroke-width="1" stroke-dasharray="5 5"/>
    <polygon points="${area}" fill="${col}" opacity="0.08"/>
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2"/>
  </svg>`;
}

function tile(k, v, cls2 = "") { return `<div class="stat ${cls2}"><div class="k">${k}</div><div class="v">${v}</div></div>`; }

function renderSummary(a) {
  if (!a.n) {
    $("summary").innerHTML = `<div class="state"><div class="big">işlem yok</div>seçili ayarlarla geçmişte hiç sinyal/işlem oluşmadı. zaman dilimini ya da kapsamı değiştir.</div>`;
    return;
  }
  const pf = a.profitFactor === Infinity ? "∞" : a.profitFactor.toFixed(2);
  const exp = (a.expectancyR > 0 ? "+" : "") + a.expectancyR.toFixed(2) + "R";
  const winCls = a.winRate >= 50 ? "f" : "";
  const expCls = a.expectancyR > 0 ? "f" : "bad";
  $("summary").innerHTML = `
    <div class="stats">
      ${tile("işlem", a.n)}
      ${tile("kazanma oranı", "%" + a.winRate.toFixed(1), winCls)}
      ${tile("beklenti / işlem", exp, expCls)}
      ${tile("profit factor", pf, a.profitFactor >= 1 ? "f" : "bad")}
      ${tile("ort. getiri", sign(a.avgReturn) + "%", a.avgReturn > 0 ? "f" : "bad")}
      ${tile("toplam (bileşik)", sign(a.totalReturn) + "%", a.totalReturn > 0 ? "f" : "bad")}
      ${tile("max düşüş", "-%" + a.maxDrawdown.toFixed(1), "bad")}
      ${tile("TP / SL / süre", `${a.tp} / ${a.sl} / ${a.time}`)}
    </div>
    <div class="section-title">sermaye eğrisi (100 birim başlangıç)</div>
    <div class="eq-wrap">${equityCurveSVG(a.equityCurve)}</div>`;
}

function renderTrades(a) {
  if (!a.n) { $("content").innerHTML = ""; return; }
  const rows = [...a.trades].sort((x, y) => y.entryTime - x.entryTime).slice(0, 100);
  const tr = rows.map((t) => `
    <tr>
      <td>${t.symbol.replace("USDT", "")}</td>
      <td>${fmtTime(t.entryTime)}</td>
      <td><span class="pill ${t.outcome}">${t.outcome === "tp" ? "hedef" : t.outcome === "sl" ? "stop" : "süre"}</span></td>
      <td class="${cls(t.returnPct)}">${sign(t.returnPct)}%</td>
      <td class="${cls(t.rMultiple)}">${sign(t.rMultiple)}R</td>
      <td>${t.barsHeld}</td>
    </tr>`).join("");
  $("content").innerHTML = `
    <div class="section-title">işlemler (son ${rows.length})</div>
    <div class="bt-table-wrap"><table class="bt">
      <thead><tr><th>coin</th><th>giriş</th><th>sonuç</th><th>getiri</th><th>R</th><th>bar</th></tr></thead>
      <tbody>${tr}</tbody>
    </table></div>`;
}

async function run() {
  if (busy) return;
  busy = true;
  $("runBtn").disabled = true; $("runBtn").textContent = "çalışıyor…";
  $("summary").innerHTML = ""; $("content").innerHTML = `<div class="grid">${Array(4).fill('<div class="skel" style="height:120px"></div>').join("")}</div>`;

  const interval = $("interval").value;
  const bt = {
    horizon: Math.max(3, +$("horizon").value || 24),
    rMultiple: Math.max(0.5, +$("rmult").value || 2),
    stopBufferPct: Math.max(0, +$("stopbuf").value || 0.5),
    feePct: 0.1,
  };

  try {
    let symbols = DEFAULT_SYMBOLS;
    if ($("allToggle").classList.contains("on")) {
      $("liveTxt").textContent = "semboller alınıyor…";
      symbols = await fetchAllUsdtSymbols();
    }
    const { trades, errors } = await runPool(symbols, interval, bt, (d, t) => {
      $("countdown").innerHTML = `taranıyor: <b>${d}/${t}</b>`;
    });
    const a = aggregate(trades);
    $("liveTxt").textContent = `${symbols.length} sembol · ${interval}`;
    $("countdown").innerHTML = "";
    renderSummary(a);
    renderTrades(a);
    if (errors.length) {
      $("content").innerHTML += `<div class="errbox"><b>${errors.length} sembol çekilemedi.</b>${SOURCE === "direct" ? ' Hepsi hata veriyorsa config.js içinde SOURCE="proxy" yap.' : ""}</div>`;
    }
  } catch (e) {
    $("liveTxt").textContent = "hata";
    $("summary").innerHTML = `<div class="state err"><div class="big">bağlantı hatası</div>${e.message}</div>`;
    $("content").innerHTML = "";
  } finally {
    busy = false;
    $("runBtn").disabled = false; $("runBtn").textContent = "backtest çalıştır ↻";
  }
}

$("runBtn").addEventListener("click", run);
run();
