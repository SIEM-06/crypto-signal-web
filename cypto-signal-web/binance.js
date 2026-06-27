// Opsiyonel CORS/bolge fallback proxy'si (Vercel Edge Function).
// Sadece config.js icinde SOURCE="proxy" yaparsan kullanilir.
// Edge fonksiyonu ziyaretciye yakin bolgede calistigi icin (TR icin Avrupa edge),
// Binance ABD coğrafi engeline genelde takilmaz.
//
// Kullanim: /api/binance?path=/api/v3/klines&symbol=BTCUSDT&interval=1h&limit=250

export const config = { runtime: "edge", regions: ["fra1"] };

const ALLOWED_PATHS = new Set([
  "/api/v3/klines",
  "/api/v3/exchangeInfo",
  "/api/v3/ticker/24hr",
]);

const BASE = "https://data-api.binance.vision";

export default async function handler(req) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path") || "";

  if (!ALLOWED_PATHS.has(path)) {
    return new Response(JSON.stringify({ error: "izin verilmeyen path" }), {
      status: 400,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }

  url.searchParams.delete("path");
  const target = `${BASE}${path}?${url.searchParams.toString()}`;

  try {
    const upstream = await fetch(target, { headers: { "User-Agent": "noll-rsi-scanner/1.0" } });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=30",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }
}
