# Ambang Coffee House — situs 3D berbasis ruang (DEMO)

Situs coffee house imersif: delapan "ruang" yang tersusun dalam kedalaman CSS 3D. Saat menggulir, kamera
**maju** ke ruang berikutnya — pasangan kartu di depan membesar dan memudar melewati kamera, sementara pasangan
berikutnya muncul dari kedalaman. Ini perspektif CSS sungguhan (`perspective` + `translate3d`), bukan carousel
dan bukan pertukaran opacity.

| Ruang | Isi |
| --- | --- |
| 1 | Landing: nama brand (paling jauh), gelas (paling dekat), isyarat gulir |
| 2–6 | Menu: dua produk per ruang (01–02, 03–04, … 09–10) |
| 7 | Detail produk: pilih menu, ukuran/opsi, jumlah, harga, **pratinjau pesanan demo** |
| 8 | Ulasan (contoh) dan penutup |

> **Semua isi adalah data demo.** "Ambang", nama menu, harga, deskripsi, dan ulasan hanyalah contoh. Tombol
> pesan **tidak mengirim pesanan dan tidak menerima pembayaran** — ia hanya menampilkan ringkasan di layar,
> dan antarmuka mengatakannya terang-terangan. Ulasan diberi label "contoh". Ganti semuanya sebelum dipakai
> klien sungguhan (lihat "Mengganti isi").

## Menjalankan

Butuh Node.js 20.19+ (atau 22.12+).

```bash
npm install
npm run dev          # server pengembangan (Vite)
npm run build        # tsc --noEmit lalu vite build  -> dist/
npm run preview      # menyajikan dist/ untuk dicoba
npm run typecheck    # hanya pemeriksaan tipe
npm test             # tes unit (tsx + node:test)
```

Hasil `dist/` berupa situs statis dengan URL relatif (`base: './'`): bisa diunggah ke Vercel, Netlify, GitHub Pages,
atau sub-folder hosting biasa tanpa pengaturan tambahan. Tidak ada backend, tidak ada panggilan jaringan, tidak ada
penyimpanan data pengguna.

## Mengganti isi

Semua yang ingin Anda ubah ada di `src/config/` dan `public/` — komponen tidak perlu disentuh.

| Yang diganti | Di mana |
| --- | --- |
| Nama brand, keterangan, headline, teks landing, catatan demo | `src/config/brand.ts` |
| Produk: nama, harga (rupiah bulat), deskripsi, catatan rasa, opsi ukuran/susu/dll. | `src/config/products.ts` |
| Foto produk | taruh file di `public/images/`, lalu ubah `image` di `products.ts` |
| Foto landing (gelas) | `public/images/coffee-hero.png` (PNG transparan, rasio 504×713; jika rasio lain, ubah `width`/`height` di `HeroSection.tsx` dan rasio di `hero.css`) |
| Ulasan | `src/config/reviews.ts` — setelah memakai ulasan **nyata**, ubah `reviewsAreDemo` menjadi `false` |
| Rasa gerak: kedalaman, kecepatan, redaman, jarak ruang, ambang pindah ruang saat menggulir | `src/config/motion.ts` |

- **Jumlah ruang mengikuti jumlah produk** (dua per ruang). Menambah atau mengurangi produk tidak butuh perubahan kode.
- Tiap produk punya `focus` (titik fokus pemotongan kartu 3:4) dan `tint` (seberapa kuat latar terang foto dihangatkan
  agar tidak menjadi persegi putih di ruang gelap). Atur bila foto baru terpotong di tempat yang salah.
- **Nama brand bebas panjang.** Landing membagi nama menjadi dua belahan di kiri-kanan gelas dan **mengukur lebar
  hurufnya sendiri** (`src/lib/useWordmarkFit.ts`), jadi "Ambang", "Kopi Kenangan", atau "Sekolah Kopi Nusantara"
  sama-sama muat. Nama yang sangat panjang tentu menghasilkan huruf yang lebih kecil. Keterangan di bawah nama
  turun ke baris kedua bila perlu, dan kosong pun tidak masalah.
- Font: Gloock dan Instrument Sans, dilayani dari `public/fonts/` (lisensi SIL OFL ada di folder yang sama).

## Struktur

```
src/
  config/        brand, products, reviews, rooms (disusun dari produk), motion (semua angka kamera/animasi)
  components/    HeroSection, RoomTransition, ProductGrid, ProductCard, ProductDetail,
                 ReviewsRoom, ReviewCarousel, NavigationControls
  lib/           camera.ts (matematika kamera murni, diuji), rig.ts (mesin kamera imperatif),
                 keys.ts (pemetaan keyboard, diuji), order.ts + money.ts (harga/pesanan demo, diuji),
                 wordmark.ts + useWordmarkFit.ts (nama brand), css.ts
  styles/        tokens, stage (dunia 3D), hero, menu, detail, finale, hud
public/          images/ (foto), fonts/, favicon
tests/           tes unit (camera, config, order, keys, wordmark)
scripts/         alat uji browser (opsional, lihat "Pengujian")
```

**Cara kerjanya.** Halaman memakai scroll native (roda, sentuh, scrollbar, keyboard tetap bekerja) lewat spacer
setinggi jumlah ruang. `CameraRig` menerjemahkan posisi scroll menjadi posisi kamera `c`, lalu menggeser "dunia"
3D dan menulis pose kedalaman tiap ruang (custom property CSS) langsung ke DOM — tanpa render ulang React per frame.
Skala sebuah ruang mengikuti `P / (P + d·step)` (`d` = jarak ruang dari kamera), sehingga ruang di depan tampak
mengecil menurut perspektif yang benar. Setelah scroll berhenti, kamera dirapikan ke ruang terdekat. Hanya
`transform` dan `opacity` yang dianimasikan.

## Navigasi dan aksesibilitas

- **Mouse/sentuh/trackpad:** gulir; atau klik rel ruang, tombol sebelumnya/berikutnya, dan isyarat "Gulir untuk masuk".
  **Satu klik roda mouse memindahkan satu ruang**, di tinggi jendela mana pun. Geseran kecil di bawah 48 px
  (sentuhan tak sengaja) dikembalikan ke ruang semula. Angkanya ada di `src/config/motion.ts` (`commitMinPx`).
- **Keyboard:** ↓ / PageDown / Spasi = ruang berikutnya; ↑ / PageUp / Shift+Spasi = sebelumnya; ← → juga; Home / End =
  pertama / terakhir. Widget yang memakai panah sendiri (pilihan ukuran, kartu ulasan, rel produk) tidak direbut.
  Tombol dengan Alt/Ctrl/Cmd dibiarkan untuk browser.
- **`prefers-reduced-motion`:** tanpa perspektif dan tanpa zoom; ruang berganti dengan transisi sederhana.
- Tidak ada fungsi yang bergantung pada hover. Layar kecil memakai dua kolom kartu.
- Parameter `?debug` pada URL hanya untuk pengujian otomatis (membuka `window.__ambang`); tidak perlu dipakai.

## Pengujian

Yang dijalankan sebelum paket ini diserahkan:

| Alat | Cakupan | Hasil terakhir |
| --- | --- | --- |
| `npm run typecheck` | seluruh `src/` dan `tests/` (strict, `noUnusedLocals`) | lulus |
| `npm test` | 117 tes unit: matematika kamera (termasuk ambang pindah ruang per klik roda), susunan ruang dari produk, harga/pesanan, keyboard, pemisahan nama | 117/117 |
| `npm run check:transition` | transisi ruang di browser: kartu tumbuh serempak dengan pasangan berikutnya, kontinuitas skala, tanpa lompatan, mode gerak dikurangi, desktop dan ponsel; roda mouse (putaran cepat, satu klik di 4 tinggi layar 768–1440 px, geseran kecil, ujung rentang) | 318 pemeriksaan lulus |
| `npm run check:keys` | semua tombol keyboard di browser, termasuk widget yang memakai panah | 65/65 |
| `npm run check:layout` | tabrakan teks/kontrol, elemen keluar layar, overflow, teks meluap, di 17 ukuran layar dan semua ruang/produk | 0 masalah keras |
| `npm run check:landing` | landing di **361** ukuran layar (320×320 sampai 2560×1366), termasuk teks menyentuh piksel gelas | 0 masalah |
| `npm run check:brand` | landing dengan 6 nama brand berbeda (panjang, huruf lebar, sangat pendek) × 11 ukuran layar | 0 masalah |

`check:*` memakai Playwright: jalankan `npx playwright install chromium` sekali, lalu `npm run check:build`
(membuat `dist-check/` lewat esbuild) sebelum yang lain. Bila Chromium Anda ada di tempat lain, set `CHROMIUM_PATH`.
Pemeriksa tata letak dan transisi menunggu keadaan halaman (transisi CSS selesai, kamera diam) sebelum mengukur, bukan
hanya menunggu waktu tetap, supaya hasilnya tidak bergantung pada kecepatan mesin; Chromium tanpa GPU yang lambat
sengaja dipakai sebagai kondisi terburuk.
Pemeriksa tata letak punya uji diri (`node scripts/audit-layout.mjs --selftest`): ia merusak halaman dengan sengaja
dan memastikan dirinya sendiri bisa gagal. **Alat ini mencari tabrakan yang jelas; ia tidak menggantikan melihat
halamannya dengan mata.**

## Batasan yang perlu Anda tahu

Ditulis apa adanya, bukan untuk menakut-nakuti:

1. **`vite build` belum pernah dijalankan oleh saya.** Lingkungan tempat proyek ini dibuat tidak punya akses ke
   registry npm. Verifikasi memakai `tsc` dengan tipe React asli (TypeScript 6.0.3, React 19.2.8) dan bundel esbuild
   (`scripts/build-check.mjs`) yang menyajikan halaman yang sama ke browser uji. Konfigurasi Vite (`vite.config.ts`)
   sederhana, tetapi jalankan `npm install && npm run build` sekali di mesin Anda dan laporkan bila ada yang aneh.
   Satu hal yang mungkin Anda lihat: Vite dapat mencetak peringatan "didn't resolve at build time" untuk URL font dan
   gambar di `index.html`. Aset di `public/` sengaja diacu dengan URL relatif agar hasil build tetap berjalan di
   sub-folder hosting; peringatan itu tidak menggagalkan build dan URL-nya dibiarkan apa adanya.
   Tes unit memakai `node:test` lewat `tsx`, bukan Vitest.
2. **Hanya Chromium yang diuji.** Safari dan Firefox belum. CSS 3D (`preserve-3d`, `perspective`, filter pada elemen
   bertransformasi 3D) punya keanehan khas Safari; uji di iPhone sungguhan sebelum diserahkan ke klien.
3. **Kinerja di perangkat nyata belum diukur.** Pengujian berjalan di Chromium tanpa GPU (render perangkat lunak),
   sehingga angka waktu frame di sana tidak mewakili ponsel sungguhan. Rancangannya hemat (hanya transform/opacity,
   tanpa render React per frame, blur dikurangi di layar kecil), tetapi itu rancangan, bukan hasil ukur.
4. **Resolusi foto menu rendah (sekitar 736 px).** Pada layar besar kartu yang membesar terlihat sedikit lembut.
   Ganti dengan foto 1500 px ke atas untuk hasil terbaik.
5. **Foto landing adalah potongan transparan** yang saya olah dari foto pertama Anda. Tepi gelas bisa terlihat kurang
   rapi di latar sangat terang; ganti dengan potongan yang lebih bersih bila punya.
6. **Urutan foto dianggap sama dengan urutan lampiran** (foto 2…11 → `product-01…10`). Nama menu, harga, dan deskripsi
   adalah tebakan dari tampilan foto — koreksi di `products.ts`.
7. **Tampilan sangat pendek/sempit menyembunyikan teks sekunder** (deskripsi landing; pada jendela di bawah ±520 px
   tinggi atau 600 px lebar juga headline) agar tidak bertabrakan. Jendela persegi di bawah 360 px tidak menjadi target.
8. Pada ponsel lanskap, tombol thumbnail rel produk berukuran sekitar 36×28 px (di bawah 44 px yang disarankan).
9. Pemindai keamanan dinamis (HawkScan) **tidak dapat dijalankan** di lingkungan ini (CLI `hawk` tidak terpasang dan
   tidak ada kunci API). Situs ini statis tanpa backend, tanpa formulir yang mengirim data, dan tanpa pustaka pihak
   ketiga selain React — tetapi itu penilaian dari membaca kode, bukan hasil pindai.
10. **Perilaku roda/trackpad hanya diuji dengan klik roda sintetis di Chromium** (100 px, 57 px ala Firefox, 40 px
    "tak sengaja"). Ambang 48 px dipilih agar satu klik roda Chrome dan Firefox cukup; trackpad Mac dan roda
    dengan akselerasi belum dicoba di perangkat sungguhan. Bila terasa terlalu sensitif/kurang, ubah `commitMinPx`.

## Lisensi

Kode proyek: milik Anda (tidak ada lisensi terpisah yang dibebankan). Font Gloock dan Instrument Sans: SIL Open Font
License 1.1 (salinan di `public/fonts/`). Foto produk dan landing: dari Anda; pastikan Anda berhak memakainya.
