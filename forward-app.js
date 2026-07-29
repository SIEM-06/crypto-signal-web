import { getRecords, updateRecords, evaluateRecord, applyLivePrice, clearRecords, removeRecord, fwdStats } from "./forward.js";
import { SOURCE, BINANCE_BASE, CONCURRENCY } from "./config.js";

const $ = (id) => document.getElementById(id);
let busy = false, timer = null, countdownTimer = null, nextAt = 0;
const storage = window.localStorage;

const INTERVAL_MS = {
  "1m": 60e3, "3m": 180e3, "5m": 300e3, "15m": 900e3, "30m": 1800e3,
  "1h": 3600e3, "2h": 7200e3, "4h": 14400e3, "6h": 21600e3, "8h": 28800e3,
  "12h": 43200e3, "1d": 86400e3, "3d": 259200e3, "1w": 604800e3,
};

function apiUrl(path, params) {
  const qs = new URLSearchParams(params).toString();
  if (SOURCE === "proxy") return `/api/binance?path=${encodeURIComponent(path)}&${qs}`;
  return `${BINANCE_BASE}${path}?${qs}`;
}
async function fetchKlinesSince(symbol, interval, recordedAt) {
  // Kayit anindaki YARIM mum da dahil olsun diye bir interval geriden basla.
  const startTime = recordedAt - (INTERVAL_MS[interval] || 3600e3);
  const r = await fetch(apiUrl("/api/v3/klines", { symbol, interval, startTime, limit: 1000 }));
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const rows = await r.json();
  return rows.map((x) => ({ openTime: +x[0], open: +x[1], high: +x[2], low: +x[3], close: +x[4] }));
}
async function fetchTicker(symbol) {
  const r = await fetch(apiUrl("/api/v3/ticker/price", { symbol }));
  if (!r.ok) throw new Error(`ticker HTTP ${r.status}`);
  const data = await r.json();
  return parseFloat(data.price);
}

const fmtTime = (ms) => new Date(ms).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
const price = (v) => v >= 1 ? v.toLocaleString("tr-TR", { maximumFractionDigits: 4 }) : v.toLocaleString("tr-TR", { maximumFractionDigits: 8 });
const sign = (v) => (v > 0 ? "+" : "") + v.toFixed(2);

function statusInfo(t) {
  if (t.status === "tp") return { cls: "tp", label: "doğru ✓", ret: `+%${t.rewardPct.toFixed(2)}` };
  if (t.status === "sl") return { cls: "sl", label: "yanlış ✗", ret: `-%${t.riskPct.toFixed(2)}` };
  if (t.status === "expired") return { cls: "expired", label: "süre doldu", ret: `${sign(t.lastPct)}%` };
  return { cls: "open", label: "takipte", ret: `${sign(t.lastPct)}%` };
}

// Acik kayitlarda fiyatin stop->hedef araligindaki konumu (progress bar)
function progress(t) {
  const span = t.target - t.stop;
  if (span <= 0) return 50;
  return Math.max(0, Math.min(100, ((t.lastPrice - t.stop) / span) * 100));
}

function fwCard(t) {
  const si = statusInfo(t);
  const base = t.symbol.replace("USDT", "");
  const tv = `https://www.tradingview.com/chart/?symbol=BINANCE:${t.symbol}`;
  const p = progress(t);
  const fillCol = t.status === "sl" ? "var(--red)" : t.status === "tp" ? "var(--fresh)" : "var(--cyan)";
  const retCls = si.ret.startsWith("+") ? "pos" : si.ret.startsWith("-") ? "neg" : "";
  return `
  <div class="card ${t.status === "tp" ? "fresh" : ""}">
    <div class="chead">
      <div class="sym">${base}<span class="q">/USDT · ${t.interval}</span></div>
      <span class="fw-status ${si.cls}">${si.label}</span>
    </div>
    <div class="rows">
      <div class="row"><span class="lbl">giriş</span><span class="val">${price(t.entry)} <small class="mini">(${fmtTime(t.recordedAt)})</small></span></div>
      <div class="row"><span class="lbl">stop → hedef</span><span class="val"><span class="neg">${price(t.stop)}</span> → <span class="pos">${price(t.target)}</span></span></div>
      <div class="row"><span class="lbl">son fiyat</span><span class="val cy">${price(t.lastPrice)}</span></div>
      <div class="row"><span class="lbl">anlık getiri</span><span class="val ${retCls}">${si.ret}</span></div>
      <div class="row"><span class="lbl">risk/ödül</span><span class="val">1 : ${t.rr} <small class="mini">(risk %${t.riskPct.toFixed(2)})</small></span></div>
    </div>
    <div class="progressbar"><div class="fill" style="left:0;width:${p.toFixed(1)}%;background:${fillCol}"></div></div>
    <div class="mini" style="display:flex;justify-content:space-between;margin-top:3px"><span>stop</span><span>hedef</span></div>
    <div class="cfoot">
      <span class="ts">${t.barsSeen || 0} mum izlendi${t.resolvedAt ? " · sonuç: " + fmtTime(t.resolvedAt) : ""}</span>
      <span style="display:flex;gap:8px">
        <a class="tv" href="${tv}" target="_blank" rel="noopener">grafik ↗</a>
        <a class="tv" href="#" data-del="${t.id}">sil</a>
      </span>
    </div>
  </div>`;
}

function tile(k, v, cls2 = "") { return `<div class="stat ${cls2}"><div class="k">${k}</div><div class="v">${v}</div></div>`; }

function render(records) {
  const st = fwdStats(records);
  $("summary").innerHTML = `
    <div class="stats">
      ${tile("kayıtlı sinyal", st.total)}
      ${tile("takipte", st.open, "c")}
      ${tile("doğru ✓", st.tp, "f")}
      ${tile("yanlış ✗", st.sl, st.sl ? "bad" : "")}
      ${tile("süre doldu", st.expired)}
      ${tile("isabet oranı", st.winRate == null ? "—" : "%" + st.winRate, st.winRate >= 50 ? "f" : st.winRate == null ? "" : "bad")}
      ${tile("ort. getiri", st.avgReturn == null ? "—" : sign(st.avgReturn) + "%", st.avgReturn > 0 ? "f" : st.avgReturn == null ? "" : "bad")}
    </div>`;

  if (!records.length) {
    $("content").innerHTML = `<div class="state"><div class="big">henüz kayıt yok</div>
      önce <a href="./index.html" style="color:var(--cyan)">canlı paneli</a> aç ve bir tarama yap — çıkan taze sinyaller
      otomatik olarak buraya kaydedilir ve takip başlar.</div>`;
    return;
  }
  const sorted = [...records].sort((a, b) => {
    const rank = (t) => (t.status === "open" ? 0 : 1); // once takiptekiler
    return rank(a) - rank(b) || b.recordedAt - a.recordedAt;
  });
  $("content").innerHTML = `<div class="grid">${sorted.map(fwCard).join("")}</div>`;
  document.querySelectorAll("[data-del]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      removeRecord(storage, el.getAttribute("data-del"));
      render(getRecords(storage));
    });
  });
}

async function check() {
  if (busy || !$("checkBtn")) return;
  busy = true;
  $("checkBtn").disabled = true; $("checkBtn").textContent = "kontrol ediliyor…";
  try {
    const records = getRecords(storage);
    const open = records.filter((t) => t.status === "open");
    const evaluated = {};
    let done = 0, idx = 0;
    async function worker() {
      while (idx < open.length) {
        const t = open[idx++];
        try {
          const candles = await fetchKlinesSince(t.symbol, t.interval, t.recordedAt);
          let ev = evaluateRecord(t, candles);
          if (ev.status === "open") {
            // Mumlar sonuclandirmadiysa ANLIK fiyati al: son fiyat canli guncellensin,
            // anlik fiyat stopu/hedefi gectiyse hemen sonuclansin.
            try { ev = applyLivePrice(ev, await fetchTicker(t.symbol)); } catch {}
          }
          evaluated[t.id] = ev;
        } catch { /* bu tur atla, sonraki kontrolde tekrar dener */ }
        finally { done++; $("countdown").innerHTML = open.length ? `kontrol: <b>${done}/${open.length}</b>` : ""; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(open.length, 1)) }, worker));
    const updated = updateRecords(storage, evaluated);
    $("liveTxt").textContent = `canlı · ${open.length} açık kayıt kontrol edildi`;
    render(updated);
  } catch (e) {
    $("liveTxt").textContent = "hata";
    $("summary").innerHTML = `<div class="state err"><div class="big">bağlantı hatası</div>${e.message}</div>`;
  } finally {
    busy = false;
    $("checkBtn").disabled = false; $("checkBtn").textContent = "durumu güncelle ↻";
    scheduleNext();
  }
}

function scheduleNext() {
  clearTimeout(timer); clearInterval(countdownTimer);
  const sec = parseInt($("refresh").value, 10);
  if (sec > 0) {
    nextAt = Date.now() + sec * 1000;
    timer = setTimeout(check, sec * 1000);
    countdownTimer = setInterval(() => {
      const left = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
      $("countdown").innerHTML = `sonraki kontrol: <b>${left}s</b>`;
    }, 1000);
  } else { $("countdown").innerHTML = ""; }
}

$("checkBtn").addEventListener("click", check);
$("refresh").addEventListener("change", scheduleNext);
$("clearBtn").addEventListener("click", () => {
  if (window.confirm("Tüm canlı test kayıtları silinsin mi?")) {
    clearRecords(storage);
    render(getRecords(storage));
  }
});

render(getRecords(storage));
check();
