# NØLL // RSI Divergence Scanner — Web (Vercel)

Binance'te canlı çalışan RSI **boğa uyumsuzluğu** tarayıcı. Tamamen **tarayıcı tarafında** çalışır — sunucu yok, veritabanı yok, API anahtarı yok. Vercel'de bedava ve anında yayınlanır.

> Neden statik? Binance, sunucu (ABD) IP'lerini engeller (HTTP 451). İstekler ziyaretçinin **kendi tarayıcısından** (örn. Türkiye) gittiği için bu engele takılmaz. Veri kaynağı: `data-api.binance.vision` (kimlik gerektirmeyen halka açık uç).

## Dosya yapısı

```
crypto-signal-web/
├─ index.html      # panel (arayüz)
├─ app.js          # tarama + render (tarayıcıda çalışır)
├─ detector.js     # RSI + pattern mantığı (Python sürümüyle birebir aynı)
├─ config.js       # coin listesi, parametreler, veri kaynağı
├─ api/
│  └─ binance.js   # OPSİYONEL fallback proxy (Edge fonksiyonu)
├─ vercel.json
└─ README.md
```

## Yerelde denemek

Modüller `file://` ile çalışmaz, basit bir sunucu gerekir:

```bash
cd crypto-signal-web
python -m http.server 5500
```

Tarayıcı: `http://localhost:5500`

## Vercel'de yayınlama

Build adımı **yok** (saf statik). İki yoldan biri:

### Yol A — Vercel CLI (en hızlı)

```bash
npm i -g vercel
cd crypto-signal-web
vercel          # ilk seferde sorulara Enter'la geç
vercel --prod   # canlı yayın
```

### Yol B — GitHub üzerinden

1. Bu klasörü bir GitHub deposuna at (push).
2. [vercel.com/new](https://vercel.com/new) → depoyu **Import** et.
3. Ayarlar:
   - **Framework Preset:** Other
   - **Build Command:** boş bırak
   - **Output Directory:** boş bırak (kök dizin)
4. **Deploy.** Bitince `https://...vercel.app` linkin hazır.

## Coin ekleme / çıkarma

`config.js` içindeki `DEFAULT_SYMBOLS` listesini düzenle:

```js
export const DEFAULT_SYMBOLS = [
  "BTCUSDT","ETHUSDT","SOLUSDT",   // ...
  "YENICOINUSDT",                  // buraya ekle (büyük harf + USDT)
];
```

Ya da hiç uğraşma — panelde **"tüm USDT"** anahtarını aç, borsadaki tüm USDT paritelerini tarar (daha yavaş ama tam kapsam).

## Panelde ne var?

- **zaman** — mum aralığı (5m … 1d)
- **yenile** — otomatik tarama sıklığı
- **sadece taze** — yalnızca son birkaç mumda oluşan yeni sinyaller
- **tüm USDT** — sabit liste yerine tüm pariteleri tara
- Her kart: 1. dip (kırmızı RSI) vs 2. dip (yeşil RSI), RSI farkı, fiyat sapması, "grafik ↗" ile TradingView teyidi

İyi sinyal = yeşil çubuk kırmızıdan belirgin yüksek **(RSI farkı +3…+12)** ve fiyat sapması düşük **(< %0.3)**.

## Sorun: hiç veri gelmiyor / hepsi hata

Nadiren ağ/tarayıcı `data-api.binance.vision`'a doğrudan erişimi engelleyebilir. O zaman dahili Edge proxy'sine geç:

1. `config.js` aç, `SOURCE`'u değiştir: `export const SOURCE = "proxy";`
2. Tekrar deploy et (`vercel --prod`).
3. `api/binance.js` Edge fonksiyonu Avrupa bölgesinden (fra1) Binance'e gider ve veriyi tarayıcına CORS'lu döner.

## Ayarları değiştirme

`config.js` → `PARAMS` (RSI eşiği, fiyat toleransı, iğne oranı vb.) ve `KLINE_LIMIT`, `CONCURRENCY` buradan ayarlanır.

## Notlar

- Bu bir **yatırım tavsiyesi değildir.** Sinyalleri her zaman kendi grafiğinde teyit et.
- Düşük zaman dilimlerinde (5m–15m) sinyal çok ama gürültülü olur; 1h+ daha güvenilir.
- "tüm USDT" ~400 parite çeker; çok sık yenileme Binance hız limitine yaklaştırabilir, `CONCURRENCY`'yi düşük tut.

— NØLL STUDIOS
