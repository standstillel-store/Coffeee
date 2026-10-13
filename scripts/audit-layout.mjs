// Audit tata letak otomatis: tumpang-tindih teks/kontrol, elemen keluar layar, overflow horizontal.
// Membutuhkan dist-check/ (node scripts/build-check.mjs).
//
//   node scripts/audit-layout.mjs [--only=1280x720,390x844] [--quick]
//
// Untuk tiap ukuran layar dan tiap ruang, kamera diletakkan tepat di ruang itu,
// lalu semua kotak teks / kontrol / foto di ruang aktif dan HUD dibandingkan.
// Di ruang detail, tiap produk diperiksa, juga dalam keadaan pratinjau pesanan terbuka.
// Skrip ini mencari masalah yang jelas (tabrakan, meluap); ia TIDAK menggantikan
// pemeriksaan visual lewat tangkapan layar.
import { launchBrowser } from './browser.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '').split(',').filter(Boolean);
const quick = args.includes('--quick');

const VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 1536, h: 864 },
  { w: 1440, h: 900 },
  { w: 1366, h: 768 },
  { w: 1366, h: 650 },
  { w: 1280, h: 720 },
  { w: 1280, h: 600 },
  { w: 1024, h: 768 },
  { w: 820, h: 1180, touch: true },
  { w: 768, h: 1024, touch: true },
  { w: 430, h: 932, touch: true },
  { w: 390, h: 844, touch: true },
  { w: 375, h: 667, touch: true },
  { w: 360, h: 640, touch: true },
  { w: 320, h: 568, touch: true },
  { w: 844, h: 390, touch: true },
  { w: 667, h: 375, touch: true },
].filter((v) => only.length === 0 || only.includes(`${v.w}x${v.h}`));

/* ---------- dijalankan di dalam halaman ---------- */
function pageAudit() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const issues = [];
  const room = document.querySelector('.room[data-active]');
  if (!room) return { issues: ['tidak ada ruang aktif'], boxes: 0 };
  const kind = room.className.match(/room--(\w+)/)?.[1] ?? '?';

  const effOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      o *= parseFloat(cs.opacity);
      if (cs.visibility === 'hidden' || cs.display === 'none') return 0;
    }
    return o;
  };

  const label = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
    const txt = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 28);
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${txt ? ` "${txt}"` : ''}`;
  };

  const boxes = [];
  const push = (el, r, type) => {
    if (r.width < 1 || r.height < 1) return;
    boxes.push({ el, type, l: r.left, t: r.top, r: r.right, b: r.bottom });
  };

  const scan = (scope, hud) => {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const byParent = new Map();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue || !n.nodeValue.trim()) continue;
      const p = n.parentElement;
      // aria-hidden di sini berarti "dekoratif bagi pembaca layar", bukan "tidak terlihat": nama brand di
      // landing (AMBANG / COFFEE HOUSE) bertanda aria-hidden tetapi terlihat penuh, jadi tetap diperiksa.
      if (!p || p.closest('.sr-only') || (p.closest('[aria-hidden="true"]') && !hud && !p.closest('.hero__brand'))) continue;
      if (p.closest('.review') && !p.closest('.review[data-focus]')) {
        // kartu ulasan: hanya yang cukup terang (terfokus) yang dihitung
      }
      if (effOpacity(p) < 0.45) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
      if (!rects.length) continue;
      const u = byParent.get(p) ?? { l: 1e9, t: 1e9, r: -1e9, b: -1e9 };
      for (const r of rects) {
        u.l = Math.min(u.l, r.left);
        u.t = Math.min(u.t, r.top);
        u.r = Math.max(u.r, r.right);
        u.b = Math.max(u.b, r.bottom);
      }
      byParent.set(p, u);
    }
    // Kotak Range memakai area isi font (ascent+descent), lebih tinggi dari glif. Untuk tipe besar
    // dengan line-height < 1 itu memberi tumpang tindih palsu, jadi kotak dirapatkan ke area glif.
    for (const [el, u] of byParent) {
      const h = u.b - u.t;
      boxes.push({ el, type: hud ? 'hud-text' : 'text', l: u.l, t: u.t + h * 0.2, r: u.r, b: u.b - h * 0.14 });
    }
  };

  scan(room, false);

  if (kind !== 'hero') {
    for (const el of room.querySelectorAll('img, button, [role="radio"], .qty, .card__frame, .detail__frame')) {
      if (el.closest('.review')) continue;
      if (effOpacity(el) < 0.45) continue;
      // gambar di dalam bingkai/tombol sudah terwakili oleh induknya
      if (el.tagName === 'IMG' && el.closest('button, .card__frame, .detail__frame')) continue;
      push(el, el.getBoundingClientRect(), 'box');
    }
  }

  // HUD
  const hud = document.querySelector('.hud');
  if (hud) {
    scan(hud, true);
    for (const el of hud.querySelectorAll('.hud__tick-mark')) {
      if (effOpacity(el) < 0.45) continue;
      // Garis penanda hanya setinggi 1px, sehingga tak pernah bisa menumpuk >2px dengan teks. Kotaknya digemukkan:
      // 4px ke atas/bawah dan 10px ke kiri, jadi teks yang berjarak kurang dari 10px dari garis dihitung menempel.
      const r = el.getBoundingClientRect();
      push(el, { left: r.left - 10, right: r.right, top: r.top - 4, bottom: r.bottom + 4, width: r.width + 10, height: r.height + 8 }, 'hud-box');
    }
  }

  // 0) landing: teks tidak boleh menyentuh piksel gelas. Foto gelas adalah potongan PNG dengan siluet
  // tidak beraturan (es batu di atas, bibir lebar, badan menyempit), jadi kotak gambarnya terlalu kasar:
  // alpha PNG dibaca ke kanvas kecil dan tiap kotak teks diuji terhadap siluet yang sebenarnya.
  if (kind === 'hero') {
    const img = room.querySelector('.hero__img');
    if (img && img.complete && img.naturalWidth && effOpacity(img) >= 0.45) {
      const MW = 126;
      const MH = Math.round((MW * img.naturalHeight) / img.naturalWidth);
      const cv = document.createElement('canvas');
      cv.width = MW;
      cv.height = MH;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, MW, MH);
      const px = g.getImageData(0, 0, MW, MH).data;
      const ir = img.getBoundingClientRect();
      const solid = (x, y) => {
        const u = Math.floor(((x - ir.left) / ir.width) * MW);
        const v = Math.floor(((y - ir.top) / ir.height) * MH);
        return u >= 0 && v >= 0 && u < MW && v < MH && px[(v * MW + u) * 4 + 3] > 40;
      };
      // bagian kotak b (diperluas pad px) yang jatuh di atas piksel gelas
      const covered = (b, pad) => {
        let n = 0;
        let all = 0;
        for (let y = b.t - pad; y <= b.b + pad; y += 2) {
          for (let x = b.l - pad; x <= b.r + pad; x += 2) {
            all++;
            if (solid(x, y)) n++;
          }
        }
        return all ? n / all : 0;
      };
      for (const b of boxes) {
        if (b.type !== 'text' && b.type !== 'hud-text') continue;
        if (b.el.closest('.hero__half')) {
          // huruf nama brand sengaja sedikit terselip di belakang gelas (gelas lebih dekat ke kamera);
          // yang dijaga: huruf di sisi dalam tidak boleh tertutup lebih dari sebagian kecil
          const f = covered(b, 0);
          if (f > 0.08) issues.push(`nama brand tertutup gelas ${(f * 100).toFixed(0)}% (batas 8%): ${label(b.el)}`);
        } else if (covered(b, 3) > 0) {
          issues.push(`teks menyentuh gelas (jarak < 3px): ${label(b.el)}`);
        }
      }
    }
  }

  // 1) di dalam layar
  for (const b of boxes) {
    if (b.type === 'hud-text' || b.type === 'hud-box') continue;
    const inCarousel = b.el.closest('.reviews__track');
    if (inCarousel && b.type === 'text' && !b.el.closest('.review')) continue;
    if (b.l < -0.5 || b.r > vw + 0.5 || b.t < -0.5 || b.b > vh + 0.5) {
      if (kind === 'reviews' && b.el.closest('.review')) continue; // kartu tetangga sengaja keluar tepi
      issues.push(`keluar layar: ${label(b.el)} [${b.l.toFixed(0)},${b.t.toFixed(0)} → ${b.r.toFixed(0)},${b.b.toFixed(0)}] vs ${vw}x${vh}`);
    }
  }

  // 2) tabrakan
  const inter = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 2 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 2;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.el === b.el) continue;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.type === 'box' && b.type === 'box') continue; // dua foto/tombol berdampingan: diperiksa lewat teks
      if (a.type === 'hud-box' && b.type === 'hud-box') continue;
      if (a.type.startsWith('hud') && b.type.startsWith('hud') && a.el.closest('.hud__bar') && b.el.closest('.hud__bar')) continue;
      if (!inter(a, b)) continue;
      // teks di dalam tombol/kotak yang sama
      if ((a.type === 'text' && b.type === 'box' && b.el.contains(a.el)) || (b.type === 'text' && a.type === 'box' && a.el.contains(b.el))) continue;
      issues.push(`tumpang tindih: ${label(a.el)}  ×  ${label(b.el)}`);
    }
  }

  // 3) overflow horizontal dokumen
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) issues.push(`overflow horizontal: scrollWidth ${sw} > ${vw}`);

  // 4) teks terpotong (line-clamp / overflow hidden) - hanya informasi
  const clipped = [];
  for (const el of room.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if ((cs.overflow === 'hidden' || cs.overflowY === 'hidden') && el.scrollHeight > el.clientHeight + 2 && el.textContent.trim()) {
      if (el.classList.contains('sr-only') || el.classList.contains('detail__frame') || el.classList.contains('card__frame') || el.classList.contains('detail__layer') || el.classList.contains('order')) continue;
      clipped.push(label(el));
    }
  }

  // 5) target sentuh kecil (info). Area sentuh = kotak tombol atau pseudo-elemen ::after yang memperluasnya.
  const small = [];
  for (const el of document.querySelectorAll('.room[data-active] button, .hud button')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || effOpacity(el) < 0.45) continue;
    const pa = getComputedStyle(el, '::after');
    const pw = pa.position === 'absolute' ? parseFloat(pa.width) || 0 : 0;
    const ph = pa.position === 'absolute' ? parseFloat(pa.height) || 0 : 0;
    const hw = Math.max(r.width, pw);
    const hh = Math.max(r.height, ph);
    if (Math.min(hw, hh) < 32) small.push(`${label(el)} ${hw.toFixed(0)}x${hh.toFixed(0)}`);
  }

  // 6) teks meluap dari kotak tombol/pilihan (mis. label terlalu panjang untuk tombolnya) - masalah keras
  const spill = [];
  for (const el of document.querySelectorAll('.room[data-active] :is(button, [role="radio"], .price, .detail__name), .hud button')) {
    if (el.closest('.review') || effOpacity(el) < 0.45) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let l = 1e9;
    let rr = -1e9;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue?.trim() || n.parentElement?.closest('.sr-only')) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const q of range.getClientRects()) {
        if (q.width < 0.5) continue;
        l = Math.min(l, q.left);
        rr = Math.max(rr, q.right);
      }
    }
    if (l > rr) continue;
    if (rr > r.right + 1.5 || l < r.left - 1.5) {
      spill.push(`teks meluap: ${label(el)} teks ${l.toFixed(0)}→${rr.toFixed(0)} vs kotak ${r.left.toFixed(0)}→${r.right.toFixed(0)}`);
    }
  }
  for (const m of spill) issues.push(m);

  return { kind, issues, clipped, small, boxes: boxes.length };
}

/* ---------- pelari ---------- */

/**
 * Tunggu transisi/animasi CSS yang berhingga (rel HUD, kartu, pratinjau) selesai sebelum mengukur. Menunggu waktu
 * tetap mengukur di tengah transisi bila mesin lambat: di Chromium tanpa GPU satu frame bisa 200-300 ms, dan label
 * rel yang sedang memudar (0.3 dtk) sempat terbaca menimpa garis penanda padahal keadaan diamnya bersih.
 */
async function settleUi(page, maxMs = 6000) {
  await page.evaluate(async (limit) => {
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    const t0 = performance.now();
    for (;;) {
      await raf();
      const busy = document.getAnimations().some((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations !== Infinity);
      if (!busy || performance.now() - t0 > limit) break;
    }
    await raf();
    await raf();
  }, maxMs);
}

const { server, port } = await serve(join(root, 'dist-check'));
const browser = await launchBrowser();
let total = 0;
const summary = [];

/* ---------- uji diri: pemeriksa harus benar-benar bisa GAGAL ----------
   node scripts/audit-layout.mjs --selftest
   Setiap kasus merusak halaman dengan sengaja lalu memastikan audit menandainya. */
if (process.argv.includes('--selftest')) {
  const cases = [
    {
      nama: 'label tombol terlalu panjang meluap dari tombolnya',
      camera: 6,
      needle: 'teks meluap',
      mutate: () => {
        const l = document.querySelector('.room[data-active] .order__label');
        if (l) l.textContent = 'SUDAH DI PRATINJAU DAN SEKALI LAGI';
      },
    },
    {
      nama: 'tombol penutup ditarik ke atas bilah HUD',
      camera: 7,
      needle: 'tumpang tindih',
      mutate: () => {
        const b = document.querySelector('.room[data-active] .finale__restart');
        if (b) Object.assign(b.style, { position: 'fixed', left: '10px', bottom: '8px', zIndex: '50' });
      },
    },
    {
      nama: 'keterangan "COFFEE HOUSE" turun menimpa es batu gelas (landing)',
      camera: 0,
      needle: 'teks menyentuh gelas',
      mutate: () => {
        const b = document.querySelector('.room[data-active] .hero__brand');
        if (b) b.style.translate = '-50% -60%';
      },
    },
    {
      // Cacat nyata yang pernah lolos: pergeseran perspektif lapisan nama brand (~22px) tidak dihitung,
      // sehingga keterangan menempel pada es batu di ponsel 360x640.
      nama: 'keterangan bergeser 22px ke bawah seperti sebelum kompensasi perspektif (360x640)',
      viewport: { width: 360, height: 640 },
      camera: 0,
      needle: 'teks menyentuh gelas',
      mutate: () => {
        const b = document.querySelector('.room[data-active] .hero__brand');
        if (b) b.style.translate = '-50% calc(-100% + 22px)';
      },
    },
    {
      nama: 'dua belahan nama brand dirapatkan sehingga tertutup gelas (desktop)',
      viewport: { width: 1440, height: 900 },
      camera: 0,
      needle: 'nama brand tertutup gelas',
      mutate: () => {
        const w = document.querySelector('.room[data-active] .hero__words');
        if (w) w.style.gap = '0px';
      },
    },
    {
      nama: 'elemen melebar melewati layar (overflow horizontal / keluar layar)',
      camera: 1,
      needle: 'keluar layar',
      mutate: () => {
        const t = document.querySelector('.room[data-active] .menu__title');
        if (t) Object.assign(t.style, { position: 'relative', left: '400px' });
      },
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const vp = c.viewport ?? { width: 390, height: 844 };
    const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 700, isMobile: vp.width < 700 });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/?debug=1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__ambang, null, { timeout: 5000 });
    await page.evaluate(() => window.__ambang.rig.debugSettle(false));
    await page.waitForTimeout(2300);
    await page.evaluate((v) => window.__ambang.rig.debugSetCamera(v), c.camera);
    await page.waitForTimeout(600);
    const before = await page.evaluate(pageAudit);
    await page.evaluate(c.mutate);
    await page.waitForTimeout(200);
    const after = await page.evaluate(pageAudit);
    const ok = !before.issues.some((m) => m.includes(c.needle)) && after.issues.some((m) => m.includes(c.needle));
    if (!ok) failed++;
    console.log(`${ok ? 'OK   ' : 'GAGAL'} ${c.nama} (sebelum: ${before.issues.length} masalah, sesudah: ${after.issues.length})`);
    await ctx.close();
  }
  console.log(failed ? `\n${failed} kasus uji diri GAGAL: pemeriksa tidak bisa dipercaya.` : '\nSemua kasus uji diri terdeteksi.');
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
}

/* ---------- sapuan landing: ratusan ukuran layar, hanya ruang pertama ----------
   node scripts/audit-layout.mjs --hero-sweep
   Landing paling sensitif terhadap ukuran layar (nama brand, gelas, dan teks saling bergantung),
   jadi ia diuji di kisi lebar x tinggi yang rapat, bukan hanya 17 ukuran umum. Satu halaman dipakai
   ulang; ukuran viewport diganti-ganti seperti jendela yang diubah ukurannya. */
if (process.argv.includes('--hero-sweep')) {
  const widths = [320, 340, 360, 375, 390, 412, 430, 480, 540, 600, 667, 720, 740, 768, 800, 844, 896, 932, 1024, 1112, 1180, 1280, 1366, 1440, 1536, 1680, 1920, 2560];
  const heights = [320, 360, 390, 430, 480, 568, 640, 700, 740, 800, 844, 932, 1024, 1180, 1366];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/?debug=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__ambang, null, { timeout: 5000 });
  await page.evaluate(() => window.__ambang.rig.debugSettle(false));
  await page.waitForTimeout(2600);
  let tested = 0;
  const bad = [];
  for (const h of heights) {
    for (const w of widths) {
      const ratio = w / h;
      if (ratio > 3.6 || ratio < 0.42) continue; // bukan bentuk layar nyata
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(260);
      await page.evaluate(() => window.__ambang.rig.debugSetCamera(0));
      await page.waitForTimeout(140);
      const res = await page.evaluate(pageAudit);
      tested++;
      if (res.issues.length) bad.push({ w, h, issues: res.issues });
    }
  }
  console.log(`landing diuji di ${tested} ukuran layar: ${bad.length} ukuran bermasalah`);
  for (const b of bad) {
    console.log(`  ${b.w}x${b.h}`);
    for (const m of [...new Set(b.issues)]) console.log(`     ${m}`);
  }
  await ctx.close();
  await browser.close();
  server.close();
  process.exit(bad.length ? 1 : 0);
}

/* ---------- sapuan nama brand: landing dengan nama lain ----------
   node scripts/audit-layout.mjs --brand-sweep
   Nama "Ambang" hanyalah placeholder; klien akan memakai nama lain. Teks di DOM diganti seperti yang
   dilakukan splitWordmark, ukuran huruf diukur ulang lewat peristiwa ambang:refit, lalu landing diaudit
   di tiap ukuran layar. Nama panjang, huruf lebar (M, W), nama sangat pendek, dan keterangan kosong. */
if (process.argv.includes('--brand-sweep')) {
  const names = [
    ['Ambang', 'Coffee House'],
    ['Kopi Kenangan', 'Specialty Coffee & Roastery'],
    ['Sekolah Kopi Nusantara', 'Roaster, Bar dan Kelas Seduh'],
    ['Mawar', 'Kopi'],
    ['Warung Wawan Mawi', 'Coffee House'],
    ['Ii', ''],
  ];
  const sizes = [[1920, 1080], [1440, 900], [1280, 600], [1024, 768], [768, 1024], [844, 390], [667, 375], [430, 932], [390, 844], [360, 640], [320, 568]];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/?debug=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__ambang, null, { timeout: 5000 });
  await page.evaluate(() => window.__ambang.rig.debugSettle(false));
  await page.waitForTimeout(2600);
  let tested = 0;
  const bad = [];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(260);
    await page.evaluate(() => window.__ambang.rig.debugSetCamera(0));
    for (const [name, desc] of names) {
      await page.evaluate(
        ([n, d, skipRefit]) => {
          const chars = Array.from(n.trim().toUpperCase());
          const mid = Math.ceil(chars.length / 2);
          const hero = document.querySelector('.hero');
          hero.querySelector('.hero__half--l').textContent = chars.slice(0, mid).join('');
          hero.querySelector('.hero__half--r').textContent = chars.slice(mid).join('');
          hero.querySelector('.hero__tag').textContent = d;
          const sr = hero.querySelector('.sr-only');
          if (sr) sr.textContent = `${n} ${d}`;
          const hn = document.querySelector('.hud__brand-name');
          if (hn) hn.textContent = n;
          const hs = document.querySelector('.hud__brand-sub');
          if (hs) hs.textContent = d;
          if (!skipRefit) hero.dispatchEvent(new Event('ambang:refit'));
        },
        [name, desc, process.argv.includes('--no-refit')],
      );
      await page.waitForTimeout(160);
      const res = await page.evaluate(pageAudit);
      tested++;
      if (res.issues.length) bad.push({ w, h, name, issues: res.issues });
    }
  }
  console.log(`nama brand diuji: ${names.length} nama x ${sizes.length} ukuran = ${tested} kombinasi, ${bad.length} bermasalah`);
  for (const b of bad) {
    console.log(`  ${b.w}x${b.h}  "${b.name}"`);
    for (const m of [...new Set(b.issues)]) console.log(`     ${m}`);
  }
  await ctx.close();
  await browser.close();
  server.close();
  process.exit(bad.length ? 1 : 0);
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: 1,
    hasTouch: !!vp.touch,
    isMobile: !!vp.touch,
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`);
  });
  await page.goto(`http://127.0.0.1:${port}/?debug=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__ambang, null, { timeout: 5000 });
  await page.evaluate(() => window.__ambang.rig.debugSettle(false));
  await page.waitForTimeout(1800);

  const report = [];
  const run = async (tag) => {
    const res = await page.evaluate(pageAudit);
    for (const m of res.issues) report.push(`${tag}: ${m}`);
    for (const m of res.clipped ?? []) report.push(`${tag}: (info) teks terpotong: ${m}`);
    for (const m of res.small ?? []) report.push(`${tag}: (info) target sentuh kecil: ${m}`);
  };

  const names = ['hero', 'menu1', 'menu2', 'menu3', 'menu4', 'menu5', 'detail', 'reviews'];
  for (let c = 0; c < 8; c++) {
    if (c === 6) continue; // detail diperiksa terpisah
    await page.evaluate((v) => window.__ambang.rig.debugSetCamera(v), c);
    await page.waitForTimeout(quick ? 250 : 450);
    await settleUi(page);
    await run(names[c]);
  }

  // detail: semua produk, dengan dan tanpa pratinjau pesanan
  await page.evaluate(() => window.__ambang.rig.debugSetCamera(6));
  await page.waitForTimeout(500);
  await settleUi(page);
  const items = await page.$$('.room[data-active] .rail__item');
  const count = quick ? Math.min(3, items.length) : items.length;
  for (let i = 0; i < count; i++) {
    const idx = quick ? [0, 3, 6][i] : i;
    await page.evaluate((k) => document.querySelectorAll('.room[data-active] .rail__item')[k]?.click(), idx);
    await page.waitForTimeout(900);
    await settleUi(page);
    await run(`detail#${idx + 1}`);
    // tambah jumlah, lalu buka pratinjau
    await page.evaluate(() => {
      const plus = document.querySelector('.room[data-active] .qty__btn[aria-label="Tambah jumlah"]');
      plus?.click();
      plus?.click();
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => document.querySelector('.room[data-active] .order')?.click());
    await page.waitForTimeout(800);
    await settleUi(page);
    await run(`detail#${idx + 1}+pratinjau`);
    await page.evaluate(() => document.querySelector('.room[data-active] .preview__clear')?.click());
  }

  const hard = report.filter((r) => !r.includes('(info)'));
  total += hard.length;
  summary.push(`${vp.w}x${vp.h}: ${hard.length} masalah, ${report.length - hard.length} info${logs.length ? `, ${logs.length} log konsol` : ''}`);
  console.log(`\n=== ${vp.w}x${vp.h}${vp.touch ? ' (sentuh)' : ''} ===`);
  const seen = new Set();
  for (const r of report) {
    if (seen.has(r)) continue;
    seen.add(r);
    console.log('  ' + r);
  }
  for (const l of logs) console.log('  ' + l);
  if (!report.length && !logs.length) console.log('  bersih');
  await ctx.close();
}

console.log('\n--- ringkasan ---');
for (const s of summary) console.log(s);
console.log(`total masalah keras: ${total}`);
await browser.close();
server.close();
process.exitCode = total ? 1 : 0;
