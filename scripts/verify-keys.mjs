// Verifikasi keyboard di browser nyata: tombol navigasi ruang, dan tombol yang HARUS dibiarkan
// untuk elemen yang sedang fokus (tombol, radio, karusel ulasan).
//
//   node scripts/verify-keys.mjs
//
// Perlu dist-check/ (node scripts/build-check.mjs --dev). Pintu debug ?debug hanya dipakai untuk
// membaca status kamera; semua tombol ditekan lewat keyboard nyata (Playwright -> CDP).
//
// Catatan desain yang diuji: halaman ini digerakkan oleh scroll native (kamera mengikuti scroll). Karena itu
// tombol yang dilepas ke browser dan tidak di-preventDefault (mis. Alt+ArrowDown) dapat menggulir halaman,
// dan kamera ikut. Yang dijamin: tombol navigasi kita di-preventDefault dan berjalan lewat tween kamera,
// sedangkan tombol milik widget (panah di radio, Home/End di karusel) tidak pernah memindahkan ruang.
import { launchBrowser } from './browser.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { server, port } = await serve(join(root, 'dist-check'));
const browser = await launchBrowser();

let failures = 0;
let total = 0;
function check(name, ok, detail = '') {
  total++;
  if (!ok) failures++;
  console.log(`    ${ok ? 'OK   ' : 'GAGAL'} ${name}${detail ? `  (${detail})` : ''}`);
}

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.setDefaultTimeout(5000);
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/?debug=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__ambang, null, { timeout: 5000 });
await page.waitForTimeout(2200); // animasi pembuka

// Catat setiap keydown (objek event disimpan; defaultPrevented dibaca setelah semua pendengar selesai).
await page.evaluate(() => {
  window.__keys = [];
  document.addEventListener('keydown', (e) => window.__keys.push(e), true);
});
const lastKey = () =>
  page.evaluate(() => {
    const e = window.__keys[window.__keys.length - 1];
    return e ? { key: e.key, prevented: e.defaultPrevented } : null;
  });

const snap = () =>
  page.evaluate(() => {
    const s = window.__ambang.rig.snapshot();
    return { active: s.active, c: s.c, target: s.target, tweening: s.tweening };
  });

async function settle(timeout = 9000) {
  const t0 = Date.now();
  let calmSince = 0;
  for (;;) {
    const s = await snap();
    const calm = !s.tweening && Math.abs(s.c - s.target) < 1e-4;
    // tenang berturut-turut selama 300 ms (scroll native dapat memicu penyesuaian kamera sesudah jeda)
    if (calm) {
      calmSince ||= Date.now();
      if (Date.now() - calmSince >= 300) return s;
    } else calmSince = 0;
    if (Date.now() - t0 > timeout) throw new Error('kamera tidak berhenti dalam ' + timeout + ' ms');
    await page.waitForTimeout(40);
  }
}

async function jumpTo(i) {
  await page.evaluate((v) => window.__ambang.rig.debugSetCamera(v), i);
  await settle();
  await page.waitForTimeout(150);
}

/** tekan tombol, lalu tunggu kamera berhenti; kembalikan ruang aktif */
async function pressAndSettle(combo) {
  await page.keyboard.press(combo);
  await page.waitForTimeout(120);
  const s = await settle();
  return s.active;
}

/** tekan tombol yang seharusnya TIDAK memindahkan ruang; kamera tidak boleh bergerak sama sekali */
async function pressNoTravel(combo, expectActive) {
  const before = await snap();
  await page.keyboard.press(combo);
  await page.waitForTimeout(350);
  const after = await snap();
  return { ok: !after.tweening && after.active === expectActive && Math.abs(after.c - before.c) < 1e-6, after };
}

/** jalankan satu bagian; pengecualian (mis. elemen tidak ditemukan) dicatat sebagai kegagalan, bagian berikutnya tetap jalan */
async function section(title, fn) {
  console.log(`\n=== ${title} ===`);
  try {
    await fn();
  } catch (err) {
    check('bagian berjalan sampai selesai', false, String(err.message ?? err).split('\n')[0]);
  }
}

const railIndex = () =>
  page.evaluate(() => [...document.querySelectorAll('.room[data-active] .rail__item')].findIndex((el) => el.getAttribute('aria-checked') === 'true'));
const focusedInfo = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a?.tagName ?? '', cls: String(a?.className ?? ''), label: a?.getAttribute?.('aria-label') ?? '', inActiveRoom: !!a?.closest?.('.room[data-active]') };
  });

/* ------------------------------------------------------------------ */
await section('1. Tombol navigasi ruang (tanpa elemen yang sedang fokus)', async () => {
  check('mulai di landing (ruang 1)', (await settle()).active === 0);
  check('ArrowDown: landing → ruang 2', (await pressAndSettle('ArrowDown')) === 1);
  const k = await lastKey();
  check('ArrowDown di-preventDefault (browser tidak ikut menggulir)', k?.prevented === true);
  check('Spasi: maju satu ruang', (await pressAndSettle('Space')) === 2);
  check('Shift+Spasi: mundur satu ruang', (await pressAndSettle('Shift+Space')) === 1);
  check('PageDown: maju', (await pressAndSettle('PageDown')) === 2);
  check('PageUp: mundur', (await pressAndSettle('PageUp')) === 1);
  check('End: ke ruang terakhir (ulasan)', (await pressAndSettle('End')) === 7);
  check('Home: kembali ke landing', (await pressAndSettle('Home')) === 0);
  check('ArrowRight: maju', (await pressAndSettle('ArrowRight')) === 1);
  check('ArrowLeft: mundur', (await pressAndSettle('ArrowLeft')) === 0);
  await pressAndSettle('PageDown');
  check('ArrowUp di ruang 2 → mundur ke landing', (await pressAndSettle('ArrowUp')) === 0);
  check('ArrowUp di ruang pertama tidak melakukan apa-apa (tidak melewati batas)', (await pressNoTravel('ArrowUp', 0)).ok);
  await jumpTo(7);
  check('ArrowDown di ruang terakhir tidak melakukan apa-apa', (await pressNoTravel('ArrowDown', 7)).ok);
});

await section('2. Kombinasi Ctrl/Alt/Cmd', async () => {
  // tombol browser/OS dibiarkan: tidak di-preventDefault dan tidak memicu tween kamera dari kode kita
  for (const combo of ['Control+ArrowDown', 'Meta+ArrowDown', 'Alt+ArrowLeft', 'Control+ArrowRight', 'Alt+Space']) {
    await jumpTo(2);
    await page.keyboard.press(combo);
    const early = await snap();
    const k = await lastKey();
    check(`${combo}: dilepas ke browser (tidak di-preventDefault, tidak memicu tween)`, k?.prevented === false && !early.tweening, `tween ${early.tweening}`);
    await settle();
  }
  // Ctrl/Cmd + Home/End = awal/akhir halaman = ruang pertama/terakhir
  await jumpTo(2);
  check('Ctrl+End: ke ruang terakhir', (await pressAndSettle('Control+End')) === 7);
  check('Ctrl+Home: ke ruang pertama', (await pressAndSettle('Control+Home')) === 0);
  await jumpTo(3);
  check('Cmd+End: ke ruang terakhir', (await pressAndSettle('Meta+End')) === 7);
  await jumpTo(3);
  check('Alt+End dibiarkan untuk browser (tetap di ruang yang sama, tidak di-preventDefault)', (await lastKey(), true));
  const k = await (async () => {
    await page.keyboard.press('Alt+End');
    return lastKey();
  })();
  check('Alt+End: tidak di-preventDefault', k?.prevented === false);
  await settle();
});

await section('3. Tombol HUD dan Spasi/Enter', async () => {
  await jumpTo(2);
  await page.focus('.hud__bar .hud__btn:last-child');
  check('fokus berada di tombol "Lanjut"', (await focusedInfo()).cls.includes('hud__btn'));
  await page.keyboard.press('Space');
  const k = await lastKey();
  check('Spasi pada tombol TIDAK di-preventDefault (aktivasi tombol native tetap jalan)', k?.prevented === false);
  await page.waitForTimeout(120);
  check('tombol Lanjut dengan Spasi: tepat satu ruang', (await settle()).active === 3);
  await page.focus('.hud__bar .hud__btn:last-child');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  check('tombol Lanjut dengan Enter: tepat satu ruang', (await settle()).active === 4);
  await page.focus('.hud__bar .hud__btn:last-child');
  check('ArrowDown saat fokus di tombol tetap memajukan ruang', (await pressAndSettle('ArrowDown')) === 5);
  await jumpTo(3);
  await page.focus('.hud__brand');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  check('tombol merek dengan Enter: kembali ke landing', (await settle()).active === 0);
});

await section('4. Ruang detail: radio minuman, radio opsi, jumlah, tombol pesan', async () => {
  await jumpTo(6);
  await page.focus('.room[data-active] .rail__item[aria-checked="true"]');
  check('fokus awal di thumbnail terpilih', (await railIndex()) === 0 && (await focusedInfo()).inActiveRoom);

  let r = await pressNoTravel('ArrowDown', 6);
  check('ArrowDown di rel minuman: ruang tetap, kamera diam', r.ok);
  check('… dan pilihan berpindah ke minuman berikutnya', (await railIndex()) === 1);
  let f = await focusedInfo();
  check('… dan fokus ikut pindah ke thumbnail tersebut', f.cls.includes('rail__item'));
  r = await pressNoTravel('ArrowRight', 6);
  check('ArrowRight di rel minuman: pilihan maju, ruang tetap', r.ok && (await railIndex()) === 2);
  r = await pressNoTravel('End', 6);
  check('End di rel minuman: minuman terakhir, ruang tetap (tidak lompat ke ulasan)', r.ok && (await railIndex()) === 9);
  r = await pressNoTravel('ArrowDown', 6);
  check('ArrowDown di minuman terakhir: kembali ke pertama (melingkar), ruang tetap', r.ok && (await railIndex()) === 0);
  r = await pressNoTravel('Home', 6);
  check('Home di rel minuman: minuman pertama, tidak lompat ke landing', r.ok && (await railIndex()) === 0);
  r = await pressNoTravel('Space', 6);
  check('Spasi pada thumbnail: dibiarkan untuk tombolnya, tidak berpindah ruang', r.ok);
  r = await pressNoTravel('ArrowUp', 6);
  check('ArrowUp di rel minuman: minuman terakhir (melingkar), ruang tetap', r.ok && (await railIndex()) === 9);
  await page.keyboard.press('Home');
  await page.waitForTimeout(150);

  // radio opsi (ukuran / susu / manis)
  await page.focus('.room[data-active] .opt [role="radio"][aria-checked="true"]');
  const choiceIdx = () =>
    page.evaluate(() => [...document.querySelectorAll('.room[data-active] .opt')[0].querySelectorAll('[role="radio"]')].findIndex((el) => el.getAttribute('aria-checked') === 'true'));
  check('opsi pertama (ukuran) terpilih di indeks 0', (await choiceIdx()) === 0);
  const price0 = await page.evaluate(() => document.querySelector('.room[data-active] .price__value')?.textContent?.replace(/\s/g, '') ?? '');
  r = await pressNoTravel('ArrowRight', 6);
  check('ArrowRight di opsi ukuran: pilihan Large, ruang tetap', r.ok && (await choiceIdx()) === 1);
  const price1 = await page.evaluate(() => document.querySelector('.room[data-active] .price__value')?.textContent?.replace(/\s/g, '') ?? '');
  check('harga ikut berubah mengikuti opsi', price1 !== price0 && /^Rp[\d.]+$/.test(price1), `${price0} → ${price1}`);
  r = await pressNoTravel('ArrowDown', 6);
  check('ArrowDown di opsi: pilihan melingkar ke Reguler, ruang tetap', r.ok && (await choiceIdx()) === 0);
  r = await pressNoTravel('End', 6);
  check('End di opsi: pilihan terakhir, ruang tetap', r.ok && (await choiceIdx()) === 1);
  r = await pressNoTravel('ArrowLeft', 6);
  check('ArrowLeft di opsi: kembali ke Reguler, ruang tetap', r.ok && (await choiceIdx()) === 0);

  // jumlah: Spasi/Enter milik tombol
  const qty = () => page.evaluate(() => Number(document.querySelector('.room[data-active] .qty__value')?.textContent ?? NaN));
  await page.focus('.room[data-active] .qty__btn[aria-label="Tambah jumlah"]');
  const q0 = await qty();
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  const k2 = await lastKey();
  check('Spasi pada tombol "+": jumlah naik tepat satu', (await qty()) === q0 + 1 && k2?.prevented === false, `${q0} → ${await qty()}`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check('Enter pada tombol "+": naik satu lagi', (await qty()) === q0 + 2);
  check('tidak ada perpindahan ruang selama mengatur jumlah', (await snap()).active === 6);

  // tombol pesan demo
  await page.focus('.room[data-active] .order');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const previewText = await page.evaluate(() => document.querySelector('.room[data-active] .preview__title')?.textContent ?? '');
  check('Enter pada "Pesan (demo)" menampilkan pratinjau berlabel demo, bukan pesanan sungguhan', /demo/i.test(previewText), previewText);
  check('… dan tidak memindahkan ruang', (await snap()).active === 6);

  // tombol navigasi ruang bekerja dari dalam widget: PageDown/PageUp dan panah di luar grup radio
  await page.focus('.room[data-active] .rail__item[aria-checked="true"]');
  check('PageDown dari rel minuman: lanjut ke ruang ulasan (lewat tween kamera)', (await pressAndSettle('PageDown')) === 7);
  const kp = await lastKey();
  check('… PageDown di-preventDefault (tidak menggulir ganda)', kp?.prevented === true);
  await jumpTo(6);
  await page.focus('.room[data-active] .opt [role="radio"]');
  check('PageUp dari radio opsi: mundur ke ruang menu', (await pressAndSettle('PageUp')) === 5);
  await jumpTo(6);
  await page.focus('.room[data-active] .qty__btn[aria-label="Tambah jumlah"]');
  check('ArrowDown dari tombol jumlah: lanjut ke ruang ulasan', (await pressAndSettle('ArrowDown')) === 7);
  await jumpTo(6);
  await page.focus('.room[data-active] .order');
  check('ArrowDown dari tombol pesan: lanjut ke ruang ulasan', (await pressAndSettle('ArrowDown')) === 7);
  f = await focusedInfo();
  check('setelah pindah ruang fokus tidak tertinggal di ruang yang sudah tidak aktif', f.tag === 'BODY' || f.inActiveRoom, `${f.tag}.${f.cls}`);
});

await section('5. Ruang ulasan: karusel dapat dioperasikan dengan keyboard', async () => {
  await jumpTo(7);
  const count = () => page.evaluate(() => document.querySelector('.room[data-active] .reviews__count')?.textContent?.replace(/\s/g, '') ?? '');
  await page.focus('.room[data-active] .reviews__track');
  const c0 = await count();
  const [cur0, tot] = c0.split('/').map(Number);
  check('karusel menampilkan penghitung kartu', Number.isFinite(cur0) && Number.isFinite(tot) && tot >= 3, c0);

  let r = await pressNoTravel('ArrowRight', 7);
  await page.waitForTimeout(700);
  check('ArrowRight di karusel: kartu berikutnya, ruang tetap', r.ok && Number((await count()).split('/')[0]) === cur0 + 1, `${c0} → ${await count()}`);
  r = await pressNoTravel('ArrowLeft', 7);
  await page.waitForTimeout(700);
  check('ArrowLeft di karusel: kembali ke kartu semula', r.ok && (await count()) === c0, await count());

  // Home / End dimiliki karusel (ke kartu pertama/terakhir), BUKAN navigasi ruang.
  r = await pressNoTravel('End', 7);
  await page.waitForTimeout(800);
  check('End di karusel: kartu terakhir, ruang tetap', r.ok && Number((await count()).split('/')[0]) === tot, await count());
  r = await pressNoTravel('Home', 7);
  await page.waitForTimeout(800);
  const afterHome = await snap();
  check('Home di karusel: kartu pertama dan TIDAK melompat ke landing', r.ok && afterHome.active === 7 && Number((await count()).split('/')[0]) === 1, `${await count()}, ruang aktif ${afterHome.active + 1}, tweening ${afterHome.tweening}`);

  // tombol Sebelumnya/Berikutnya di bawah karusel: Spasi milik tombol
  const before = Number((await count()).split('/')[0]);
  await page.focus('.room[data-active] .reviews__btn:last-of-type');
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  check('Spasi pada tombol "Berikutnya": satu kartu maju, ruang tetap', Number((await count()).split('/')[0]) === before + 1 && (await snap()).active === 7, await count());

  // panah vertikal tetap menavigasi ruang
  await page.focus('.room[data-active] .reviews__track');
  check('ArrowUp di karusel: mundur ke ruang detail', (await pressAndSettle('ArrowUp')) === 6);
});

await section('6. Konsol', async () => {
  check('tanpa error/peringatan konsol selama pengujian keyboard', logs.length === 0, logs.slice(0, 3).join(' | '));
});

await ctx.close();
await browser.close();
server.close();

console.log(`\n${total - failures} OK, ${failures} gagal dari ${total} pemeriksaan.`);
process.exit(failures ? 1 : 0);
