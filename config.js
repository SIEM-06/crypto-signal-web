// Bot yapilandirmasi (tarayici tarafi).

// VERI KAYNAGI:
//  'direct' -> dogrudan Binance halka acik veri ucu (data-api.binance.vision).
//              Cogu yerde tarayicidan calisir, sunucu gerektirmez.
//  'proxy'  -> /api/binance (Vercel Edge fonksiyonu). Eger bulundugun yerde
//              'direct' CORS/engel hatasi verirse buna gec. (api/binance.js dosyasi)
export const SOURCE = "direct";

export const BINANCE_BASE = "https://data-api.binance.vision";

// Genisletilmis varsayilan tarama listesi (likit USDT pariteleri).
export const DEFAULT_SYMBOLS = [
  "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT",
  "LINKUSDT","DOTUSDT","TRXUSDT","MATICUSDT","LTCUSDT","BCHUSDT","ATOMUSDT","NEARUSDT",
  "APTUSDT","ARBUSDT","OPUSDT","INJUSDT","SUIUSDT","TIAUSDT","SEIUSDT","FILUSDT",
  "ICPUSDT","HBARUSDT","VETUSDT","ALGOUSDT","RUNEUSDT","FTMUSDT","AAVEUSDT","GRTUSDT",
  "STXUSDT","IMXUSDT","RNDRUSDT","FETUSDT","LDOUSDT","SANDUSDT","MANAUSDT","AXSUSDT",
  "GALAUSDT","CHZUSDT","EGLDUSDT","FLOWUSDT","XTZUSDT","THETAUSDT","KAVAUSDT","ROSEUSDT",
  "1INCHUSDT","CRVUSDT","SNXUSDT","COMPUSDT","ENJUSDT","ZILUSDT","DYDXUSDT","WLDUSDT",
  "PEPEUSDT","SHIBUSDT","BONKUSDT","JUPUSDT","PYTHUSDT","ORDIUSDT","ENAUSDT","STRKUSDT",
];

// Cekilecek mum sayisi (RSI + 50 mum dip araligi icin fazlasiyla yeter).
export const KLINE_LIMIT = 250;

// Es zamanli istek siniri (rate-limit'e takilmamak icin).
export const CONCURRENCY = 8;

// "tum USDT pariteleri" tarandiginda haric tutulacaklar
export const EXCLUDE_PATTERNS = ["UPUSDT","DOWNUSDT","BULLUSDT","BEARUSDT"];
export const EXCLUDE_STABLES = ["USDCUSDT","FDUSDTUSDT","TUSDUSDT","BUSDUSDT","EURUSDT","AEURUSDT","USDPUSDT","FDUSDUSDT"];

// Dedektor parametreleri (stabil varsayilan: yerel dip + RSI esigi + igne).
export const PARAMS = {
  rsiPeriod: 14,
  rsiDipThreshold: 35.0,
  pivotLookback: 3,
  maxBarsBetween: 50,
  minBarsBetween: 3,
  priceTolerancePct: 0.5,
  rsiMinDiff: 2.0,
  rsiMaxDiff: 20.0,
  requireWick: true,
  wickMinRatio: 0.25,
  freshWithinBars: 8,
};
