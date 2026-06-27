import { detectSignals } from "./detector.js";
import {
  SOURCE, BINANCE_BASE, DEFAULT_SYMBOLS, KLINE_LIMIT, CONCURRENCY,
  EXCLUDE_PATTERNS, EXCLUDE_STABLES, PARAMS,
} from "./config.js";

const $ = (id) => document.getElementById(id);
let timer = null, countdownTimer = null, nextAt = 0, busy = false;

// ---- URL kurucu (direct / proxy) ----
function apiUrl(path, params) {
  const qs = new URLSearchParams(params).toString();
  if (SOURCE === "proxy") {
    return `/api/binance?path=${encodeURIComponent(path)}&${qs}`;
  }
  return `${BINANCE_BASE}${path}?${qs}`;
}

async function fetchKlines(symbol, interval) {
  const url = apiUrl("/api/v3/klines", { symbol, interval, limit: KLINE_LIMIT });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const rows = await r.json();
  return rows.map((x) => ({
    openTime: +x[0], open: +x[1], high: +x[2], low: +x[3], close: +x[4], volume: +x[5],
  }));
}

async function fetchAllUsdtSymbols() {
  const url = apiUrl("/api/v3/exchangeInfo", {});
  const r = await fetch(url);
  if (!r.ok) throw new Error(`exchangeInfo HTTP ${r.status}`);
  const data = await r.json();
  return data.symbols
    .filter((s) => s.status === "TRADING" && s.quoteAsset === "USDT")
    .map((s) => s.symbol)
    .filter((sym) => !EXCLUDE_PATTERNS.some((p) => sym.includes(p)))
    .filter((sym) => !EXCLUDE_STABLES.includes(sym))
    .sort();
}

// ---- Es zamanlilik sinirli tarama havuzu ----
async function runPool(symbols, interval, onProgress) {
  const results = [];
  const errors = [];
  let done = 0;
  let idx = 0;

  async function worker() {
    while (idx < symbols.length) {
      const sym = symbols[idx++];
      try {
        const candles = await fetchKlines(sym, interval);
        const sigs = detectSignals(candles, sym, interval, PARAMS);
        results.push(...sigs);
      } catch (e) {
        errors.push(`${sym}: ${e.message}`);
      } finally {
        done++;
        onProgress(done, symbols.length);
      }
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, worker);
  await Promise.all(workers);
  return { results, errors };
}

// ---- Bicimlendirme ----
const fmtTime = (ms) => new Date(ms).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
const fmtClock = (ms) => new Date(ms).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const price = (v) => v >= 1 ? v.toLocaleString("tr-TR", { maximumFractionDigits: 4 }) : v.toLocaleString("tr-TR", { maximumFractionDigits: 8 });
const rsiBarH = (rsi) => Math.max(14, Math.min(68, (rsi / 100) * 68));

function card(s) {
  const fresh = s.isFresh;
  const base = s.symbol.replace("USDT", "");
  const tv = `https://www.tradingview.com/chart/?symbol=BINANCE:${s.symbol}`;
  return `
  <div class="card ${fresh ? "fresh" : ""}">
    <div class="chead">
      <div class="sym">${base}<span class="q">/USDT</span></div>
      <span class="badge ${fresh ? "fresh" : "old"}">${fresh ? "taze" : s.barsAgo + " mum önce"}</span>
    </div>
    <div class="viz">
      <div class="dip">
        <div class="dval" style="color:var(--red)">${s.dip1Rsi.toFixed(1)}</div>
        <div class="bar d1" style="height:${rsiBarH(s.dip1Rsi)}px"></div>
        <div class="dlab">1. dip</div>
      </div>
      <div class="dip">
        <div class="dval" style="color:var(--fresh)">${s.dip2Rsi.toFixed(1)}</div>
        <div class="bar d2" style="height:${rsiBarH(s.dip2Rsi)}px"></div>
        <div class="dlab">2. dip</div>
      </div>
    </div>
    <div class="rows">
      <div class="row"><span class="lbl">RSI farkı (yukarı)</span><span class="val up">+${s.rsiDiff.toFixed(1)}</span></div>
      <div class="row"><span class="lbl">fiyat sapması</span><span class="val cy">%${s.priceDiffPct.toFixed(2)}</span></div>
      <div class="row"><span class="lbl">dip fiyatları</span><span class="val">${price(s.dip1Price)} → ${price(s.dip2Price)}</span></div>
      <div class="row"><span class="lbl">dipler arası</span><span class="val">${s.barsBetween} mum</span></div>
    </div>
    <div class="cfoot">
      <span class="ts">2. dip: ${fmtTime(s.dip2Time)}</span>
      <a class="tv" href="${tv}" target="_blank" rel="noopener">grafik ↗</a>
    </div>
  </div>`;
}

function loadingState(progressLabel) {
  $("content").innerHTML = `<div class="grid">${Array(6).fill('<div class="skel"></div>').join("")}</div>`;
  if (progressLabel) $("countdown").innerHTML = progressLabel;
}

async function scan() {
  if (busy) return;
  busy = true;
  $("scanBtn").disabled = true; $("scanBtn").textContent = "taranıyor…";
  clearInterval(timer); clearInterval(countdownTimer);

  const interval = $("interval").value;
  const onlyFresh = $("freshToggle").classList.contains("on");
  const scanAll = $("allToggle").classList.contains("on");
  loadingState();

  try {
    let symbols = DEFAULT_SYMBOLS;
    if (scanAll) {
      $("liveTxt").textContent = "semboller alınıyor…";
      symbols = await fetchAllUsdtSymbols();
    }

    const { results, errors } = await runPool(symbols, interval, (done, total) => {
      $("countdown").innerHTML = `taranıyor: <b>${done}/${total}</b>`;
    });

    results.sort((a, b) => b.dip2Time - a.dip2Time);
    const shown = onlyFresh ? results.filter((s) => s.isFresh) : results;

    $("sScanned").textContent = symbols.length;
    $("sCount").textContent = shown.length;
    $("sFresh").textContent = results.filter((s) => s.isFresh).length;
    $("sUpd").textContent = fmtClock(Date.now());
    $("liveTxt").textContent = `canlı · ${interval}`;

    const c = $("content");
    if (!shown.length) {
      c.innerHTML = `<div class="state"><div class="big">sinyal yok</div>
        seçili kriterlere uyan boğa uyumsuzluğu bulunamadı. zaman dilimini değiştir ya da "sadece taze"yi kapat.</div>`;
    } else {
      c.innerHTML = `<div class="grid">${shown.map(card).join("")}</div>`;
    }
    if (errors.length) {
      c.innerHTML += `<div class="errbox"><b>${errors.length} sembol çekilemedi:</b><br>${errors.slice(0, 8).join("<br>")}${errors.length > 8 ? "<br>…" : ""}
        ${SOURCE === "direct" ? '<br><br>Hepsi hata veriyorsa bölgesel/CORS engeli olabilir → config.js içinde SOURCE="proxy" yap.' : ""}</div>`;
    }
  } catch (e) {
    $("liveTxt").textContent = "hata";
    $("content").innerHTML = `<div class="state err"><div class="big">bağlantı hatası</div>
      ${e.message}<br><br>${SOURCE === "direct"
        ? 'Bölgesel/CORS engeli olabilir. config.js içinde <b>SOURCE="proxy"</b> yapıp tekrar dene.'
        : "Proxy fonksiyonu (api/binance.js) yayında mı kontrol et."}</div>`;
  } finally {
    busy = false;
    $("scanBtn").disabled = false; $("scanBtn").textContent = "tara ↻";
    scheduleNext();
  }
}

function scheduleNext() {
  clearInterval(timer); clearInterval(countdownTimer);
  const sec = parseInt($("refresh").value, 10);
  if (sec > 0) {
    nextAt = Date.now() + sec * 1000;
    timer = setTimeout(scan, sec * 1000);
    countdownTimer = setInterval(() => {
      const left = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
      $("countdown").innerHTML = `sonraki tarama: <b>${left}s</b>`;
    }, 1000);
  } else {
    $("countdown").innerHTML = "";
  }
}

$("scanBtn").addEventListener("click", scan);
$("interval").addEventListener("change", scan);
$("refresh").addEventListener("change", scheduleNext);
$("freshToggle").addEventListener("click", () => { $("freshToggle").classList.toggle("on"); scan(); });
$("allToggle").addEventListener("click", () => { $("allToggle").classList.toggle("on"); scan(); });

scan();
