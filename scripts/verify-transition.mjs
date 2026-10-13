// Verifikasi transisi inti: pasangan kartu menu membesar SEREMPAK saat kamera maju,
// pasangan berikutnya muncul dari kedalaman (bukan tukar konten), tanpa lompatan/kedip.
//
//   node scripts/verify-transition.mjs [--only=desktop|mobile|reduced|scroll|interrupt] [--json=out.json]
//
// Perlu dist-check/ (node scripts/build-check.mjs --dev). Memakai pintu debug ?debug hanya untuk
// membaca status kamera (tweening); semua gerakan dipicu lewat UI nyata (klik tombol, roda, sentuh).
//
// CATATAN JUJUR: Chromium headless merender dengan software (tanpa GPU), jadi frame rate di sini
// pesimistis dan tidak mewakili perangkat nyata. Pemeriksaan di bawah sengaja tidak bergantung pada
// jumlah frame: yang dinilai adalah kesinambungan nilai terhadap WAKTU, bukan terhadap nomor frame.
import { launchBrowser } from './browser.mjs';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').split('=')[1] ?? '';
const jsonOut = (process.argv.find((a) => a.startsWith('--json=')) ?? '').split('=')[1] ?? '';

/* ------------------------------------------------------------------ */
/* Sisi halaman: perekam per-frame                                     */
/* ------------------------------------------------------------------ */

const RECORDER = `
(() => {
  const roomEl = (id) => document.querySelector('.room[data-room="' + id + '"]');
  const effOpacity = (el) => {
    let o = 1;
    for (let n = el; n && !(n.classList && n.classList.contains('stage')); n = n.parentElement) {
      o *= parseFloat(getComputedStyle(n).opacity);
    }
    return o;
  };
  const localBlur = (el) => {
    let b = 0;
    for (let n = el; n && !(n.classList && n.classList.contains('stage')); n = n.parentElement) {
      const f = getComputedStyle(n).filter;
      const m = /blur\\(([-\\d.]+)px\\)/.exec(f || '');
      if (m) b += parseFloat(m[1]);
    }
    return b;
  };
  const state = { watch: [], samples: [], running: false, mutations: 0, mutationNotes: [], stamp: new Map(), t0: 0 };
  let mo = null;

  const read = (id) => {
    const room = roomEl(id);
    if (!room) return null;
    const cards = [...room.querySelectorAll('.card__frame')];
    const frames = cards.length ? cards : [...room.querySelectorAll('.detail__frame')];
    return {
      visible: room.dataset.visible,
      cards: frames.map((f) => {
        const r = f.getBoundingClientRect();
        const img = f.querySelector('img');
        return {
          w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2,
          o: effOpacity(f), blur: localBlur(f),
          src: img ? img.currentSrc : '', ok: img ? (img.complete && img.naturalWidth > 0) : true,
          same: img ? state.stamp.get(img) === img.getAttribute('src') : true,
          node: img ? (img.__vid ?? (img.__vid = ++state.seq)) : 0,
        };
      }),
    };
  };
  state.seq = 0;

  // Sampel dibaca SETELAH semua callback rAF frame ini selesai (setTimeout 0 dijalankan sesudah frame),
  // dan diberi cap waktu frame itu sendiri. Dengan begitu nilai yang dibaca = nilai yang dipaint pada cap waktu tsb,
  // sehingga kecepatan (selisih nilai / selisih waktu) tidak terdistorsi oleh frame yang tersendat.
  const sample = (t) => {
    if (!state.running) return;
    const rec = { t: t - state.t0, cam: window.__ambang ? window.__ambang.rig.snapshot().c : NaN, rooms: {} };
    for (const id of state.watch) rec.rooms[id] = read(id);
    state.samples.push(rec);
  };
  const tick = (t) => {
    if (!state.running) return;
    setTimeout(() => sample(t), 0);
    requestAnimationFrame(tick);
  };

  window.__rec = {
    start(watch) {
      state.watch = watch; state.samples = []; state.mutations = 0; state.mutationNotes = [];
      state.stamp = new Map();
      for (const img of document.querySelectorAll('.card__frame img, .detail__frame img')) {
        state.stamp.set(img, img.getAttribute('src'));
        img.__vid = img.__vid ?? ++state.seq;
      }
      mo = new MutationObserver((list) => {
        for (const m of list) {
          if (m.type === 'childList') {
            const touched = [...m.addedNodes, ...m.removedNodes].filter((n) => n.nodeType === 1);
            // pergantian lapisan foto detail disengaja; yang dilarang: simpul kartu/gambar menu terpasang ulang
            const bad = touched.some((n) => n.matches && (n.matches('.card, .card__frame, .card__img') || (n.querySelector && n.querySelector('.card__img'))));
            if (bad) { state.mutations++; state.mutationNotes.push('childList ' + (m.target.className || m.target.tagName)); }
          } else if (m.type === 'attributes' && (m.attributeName === 'src' || m.attributeName === 'srcset') && m.target.closest && m.target.closest('.menu')) {
            state.mutations++; state.mutationNotes.push('attr ' + m.attributeName);
          }
        }
      });
      mo.observe(document.querySelector('.world'), { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] });
      state.running = true;
      state.t0 = performance.now();
      requestAnimationFrame(tick);
    },
    stop() {
      state.running = false; // sampel yang masih menunggu setTimeout ikut dibuang (sample memeriksa running)
      if (mo) { mo.disconnect(); mo = null; }
      const nodesNow = [...document.querySelectorAll('.card__frame img')].every((img) => state.stamp.has(img));
      return { samples: state.samples, mutations: state.mutations, notes: state.mutationNotes, sameNodes: nodesNow };
    },
    snap() { return window.__ambang ? window.__ambang.rig.snapshot() : null; },
  };
})();
`;

/* ------------------------------------------------------------------ */
/* Sisi Node: analisis                                                 */
/* ------------------------------------------------------------------ */

const fmt = (n, d = 3) => (Number.isFinite(n) ? n.toFixed(d) : 'NaN');
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

/** Kecepatan ternormalisasi maksimum: (|dv| / rentang) / (dt / durasi). Ease-in-out cubic puncaknya 3. */
function maxNormSpeed(ts, vs, durationMs) {
  const range = Math.max(1e-9, Math.abs(vs[vs.length - 1] - vs[0]));
  let worst = 0;
  for (let i = 1; i < vs.length; i++) {
    const dt = Math.max(1, ts[i] - ts[i - 1]);
    const speed = (Math.abs(vs[i] - vs[i - 1]) / range) / (dt / durationMs);
    if (speed > worst) worst = speed;
  }
  return worst;
}

function isMonotone(vs, dir, eps) {
  for (let i = 1; i < vs.length; i++) {
    const d = (vs[i] - vs[i - 1]) * dir;
    if (d < -eps) return false;
  }
  return true;
}

/**
 * Menganalisis satu perjalanan.
 * @param rec hasil perekam
 * @param from id ruang asal (null bila tanpa kartu), to id ruang tujuan
 */
function analyse(rec, fromId, toId, durationMs, label, opts = {}) {
  // Batas kecepatan ternormalisasi (nilai / rentang per durasi) untuk skala dan opacity. 4.5 cocok untuk tween
  // berdurasi (puncak ease-in-out cubic = 3). Gestur scroll yang tiba sekaligus memakai batas lebih longgar:
  // kamera mengikuti dengan laju awal = celah / tau (lihat catatan di pemanggilnya), bukan profil tween.
  const speedLimit = opts.speedLimit ?? 4.5;
  const out = { label, checks: [], info: {} };
  const check = (name, ok, detail) => out.checks.push({ name, ok, detail });
  const S = rec.samples;
  if (S.length < 6) {
    check('cukup sampel frame', false, `hanya ${S.length} sampel`);
    return out;
  }
  // hanya sampel selama bergerak (kamera berubah) + sedikit ekor
  const cams = S.map((s) => s.cam);
  const first = cams.findIndex((c, i) => i > 0 && Math.abs(c - cams[0]) > 1e-4);
  let last = cams.length - 1;
  while (last > 0 && Math.abs(cams[last] - cams[last - 1]) < 1e-6) last--;
  const A = S.slice(Math.max(0, first - 1), Math.min(S.length, last + 3));
  const ts = A.map((s) => s.t);
  const dts = ts.slice(1).map((t, i) => t - ts[i]);
  out.info.frames = A.length;
  out.info.medianFrameMs = median(dts);
  out.info.p95FrameMs = [...dts].sort((a, b) => a - b)[Math.floor(dts.length * 0.95)] ?? NaN;
  out.info.travelMs = ts[ts.length - 1] - ts[0];

  const cardsOf = (id) => A.map((s) => s.rooms[id]?.cards ?? []);

  /* ---------- pasangan yang tiba (incoming) ---------- */
  if (toId) {
    const C = cardsOf(toId);
    const n = C[0].length;
    const endW = C[C.length - 1].map((c) => c.w);
    const endH = C[C.length - 1].map((c) => c.h);
    const sW = C.map((cs) => cs.map((c, i) => c.w / endW[i]));
    const sH = C.map((cs) => cs.map((c, i) => c.h / endH[i]));
    if (n === 2) {
      const dsync = Math.max(...sW.map(([a, b]) => Math.abs(a - b)));
      check('dua kartu membesar serempak (lebar)', dsync < 0.004, `selisih skala maks ${fmt(dsync, 5)}`);
      const hsync = Math.max(...sH.map(([a, b]) => Math.abs(a - b)));
      check('dua kartu membesar serempak (tinggi)', hsync < 0.004, `selisih skala maks ${fmt(hsync, 5)}`);
      // jarak antar pusat harus ikut berskala (bukti satu bidang 3D, bukan dua animasi terpisah)
      const dist = C.map(([a, b]) => Math.hypot(a.cx - b.cx, a.cy - b.cy));
      const endDist = dist[dist.length - 1];
      const dev = Math.max(...dist.map((d, i) => Math.abs(d / endDist - (sW[i][0] + sW[i][1]) / 2)));
      check('jarak antar kartu berskala sama dengan kartunya', dev < 0.01, `deviasi maks ${fmt(dev, 5)}`);
    }
    const s0 = sW.map((r) => (r[0] + (r[1] ?? r[0])) / 2);
    check('skala awal kecil (muncul dari kedalaman)', s0[0] < 0.78 && s0[0] > 0.3, `skala awal ${fmt(s0[0])}`);
    check('skala tiba tepat 1', Math.abs(s0[s0.length - 1] - 1) < 0.0005, `skala akhir ${fmt(s0[s0.length - 1], 5)}`);
    check('skala naik monoton (tidak ada mundur/kedip)', isMonotone(s0, +1, 0.003), `rentang ${fmt(s0[0])} → ${fmt(s0[s0.length - 1])}`);
    const o = C.map((cs) => cs.reduce((a, c) => a + c.o, 0) / cs.length);
    check('opacity naik monoton', isMonotone(o, +1, 0.012), `opacity ${fmt(o[0])} → ${fmt(o[o.length - 1])}`);
    check('opacity akhir 1', Math.abs(o[o.length - 1] - 1) < 0.01, `akhir ${fmt(o[o.length - 1])}`);
    const b = C.map((cs) => cs.reduce((a, c) => a + c.blur, 0) / cs.length);
    check('blur menurun monoton ke 0', isMonotone(b, -1, 0.05) && b[b.length - 1] < 0.02, `blur ${fmt(b[0], 2)} → ${fmt(b[b.length - 1], 2)}`);
    const vS = maxNormSpeed(ts, s0, durationMs);
    check(`tanpa lompatan skala (kecepatan ternormalisasi maks <= ${speedLimit})`, vS <= speedLimit, `maks ${fmt(vS, 2)} (ease-in-out cubic: ~3)`);
    const vO = maxNormSpeed(ts, o, durationMs);
    check(`tanpa kedip opacity (kecepatan ternormalisasi maks <= ${speedLimit})`, vO <= speedLimit, `maks ${fmt(vO, 2)}`);
    const allOk = C.every((cs) => cs.every((c) => c.ok));
    check('gambar sudah termuat di setiap frame (tidak ada frame kosong)', allOk, allOk ? 'semua sampel' : 'ada frame dengan gambar belum siap');
    const same = C.every((cs) => cs.every((c) => c.same));
    check('atribut src gambar tidak berubah', same, same ? 'tetap' : 'src berubah');
    const nodes = new Set(C.flatMap((cs) => cs.map((c) => c.node)));
    check('simpul gambar tetap sama (tidak dipasang ulang)', nodes.size === n, `${nodes.size} simpul unik untuk ${n} kartu`);
    out.info.incoming = { start: s0[0], end: s0[s0.length - 1], o0: o[0] };
  }

  /* ---------- pasangan yang berangkat (outgoing) ---------- */
  if (fromId) {
    const C = cardsOf(fromId);
    const n = C[0]?.length ?? 0;
    if (n > 0) {
      const w0 = C[0].map((c) => c.w);
      const s = C.map((cs) => cs.map((c, i) => c.w / w0[i]));
      if (n === 2) {
        const dsync = Math.max(...s.map(([a, b]) => Math.abs(a - b)));
        check('pasangan yang berangkat juga serempak', dsync < 0.004, `selisih skala maks ${fmt(dsync, 5)}`);
      }
      const sm = s.map((r) => (r[0] + (r[1] ?? r[0])) / 2);
      check('skala berangkat naik monoton (lewat di depan kamera)', isMonotone(sm, +1, 0.003), `${fmt(sm[0])} → ${fmt(Math.max(...sm))}`);
      const o = C.map((cs) => cs.reduce((a, c) => a + c.o, 0) / cs.length);
      check('opacity berangkat turun monoton', isMonotone(o, -1, 0.012), `${fmt(o[0])} → ${fmt(o[o.length - 1])}`);
      const blown = A.findIndex((_, i) => sm[i] > 2.5);
      const oAtBlown = blown >= 0 ? o[blown] : 0;
      check('sudah hampir transparan sebelum menjadi raksasa (skala > 2.5)', oAtBlown < 0.04, blown >= 0 ? `opacity ${fmt(oAtBlown)} saat skala ${fmt(sm[blown], 2)}` : 'tidak pernah melewati 2.5');
      const nodes = new Set(C.flatMap((cs) => cs.map((c) => c.node)));
      check('simpul gambar berangkat tetap sama', nodes.size === n, `${nodes.size} simpul unik`);
    }
  }

  check('tidak ada pemasangan ulang kartu/gambar (MutationObserver)', rec.mutations === 0, rec.mutations ? rec.notes.slice(0, 3).join('; ') : '0 mutasi');
  check('semua gambar kartu adalah simpul yang sama sebelum dan sesudah', rec.sameNodes, '');
  return out;
}

/* ------------------------------------------------------------------ */
/* Pelari                                                              */
/* ------------------------------------------------------------------ */

const { server, port } = await serve(join(root, 'dist-check'));
const browser = await launchBrowser();
const results = [];
let failures = 0;

async function open(opts) {
  const ctx = await browser.newContext({
    viewport: { width: opts.w, height: opts.h },
    deviceScaleFactor: 1,
    hasTouch: !!opts.touch,
    isMobile: !!opts.touch,
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/?debug=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__ambang, null, { timeout: 5000 });
  await page.evaluate(RECORDER);
  await page.waitForTimeout(2200); // animasi pembuka
  return { ctx, page, logs };
}

async function waitIdle(page, timeout = 6000) {
  const t0 = Date.now();
  // tunggu kamera berhenti: tidak sedang tween dan c == target
  for (;;) {
    const s = await page.evaluate(() => window.__rec.snap());
    if (s && !s.tweening && Math.abs(s.c - s.target) < 1e-4) return s;
    if (Date.now() - t0 > timeout) throw new Error('kamera tidak berhenti dalam ' + timeout + ' ms');
    await page.waitForTimeout(40);
  }
}

/**
 * Tunggu sampai kamera BENAR-BENAR diam setelah gestur scroll native: beberapa pembacaan berturut-turut tanpa tween
 * dan c == target. Perapian baru menyala setelah jeda hening 150 ms + satu frame, jadi satu pembacaan "diam"
 * tepat setelah roda/sentuh bisa berarti "belum mulai", bukan "sudah selesai". (waitIdle cukup untuk tombol,
 * yang memulai tween seketika.)
 */
async function waitSettled(page, timeout = 9000, polls = 6) {
  const t0 = Date.now();
  let stable = 0;
  for (;;) {
    const s = await page.evaluate(() => window.__rec.snap());
    if (s && !s.tweening && Math.abs(s.c - s.target) < 1e-4) {
      if (++stable >= polls) return s;
    } else stable = 0;
    if (Date.now() - t0 > timeout) throw new Error('kamera tidak berhenti dalam ' + timeout + ' ms');
    await page.waitForTimeout(100);
  }
}

/**
 * Kirim `n` klik roda mouse sekaligus lewat CDP, TANPA menunggu balasan tiap klik. `page.mouse.wheel` menunggu
 * frame berikutnya per klik; di Chromium tanpa GPU satu frame bisa 200-300 ms, sehingga klik tiba lebih
 * renggang dari jeda perapian (150 ms) dan tiap klik dianggap gestur baru (bukan putaran roda cepat).
 */
function wheelBurst(cdp, x, y, deltaY, n) {
  const sends = [];
  for (let i = 0; i < n; i++) sends.push(cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY }));
  return Promise.all(sends);
}

function report(title, list) {
  console.log(`\n=== ${title} ===`);
  for (const r of list) {
    const bad = r.checks.filter((c) => !c.ok);
    failures += bad.length;
    console.log(
      `\n  ${r.label}  [${r.info.frames ?? '?'} frame, median ${fmt(r.info.medianFrameMs ?? NaN, 1)} ms, p95 ${fmt(r.info.p95FrameMs ?? NaN, 1)} ms, ${fmt(r.info.travelMs ?? NaN, 0)} ms]`,
    );
    for (const c of r.checks) console.log(`    ${c.ok ? 'OK   ' : 'GAGAL'} ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
  }
  results.push({ title, list });
}

const ROOM_IDS = ['hero', 'menu-1', 'menu-2', 'menu-3', 'menu-4', 'menu-5', 'detail', 'reviews'];

/** Satu perjalanan lewat tombol "Lanjut" HUD (klik nyata). */
async function hopNext(page, fromIdx, durationMs) {
  const fromId = ROOM_IDS[fromIdx];
  const toId = ROOM_IDS[fromIdx + 1];
  await page.evaluate((ids) => window.__rec.start(ids), [fromId, toId]);
  await page.waitForTimeout(60);
  // HUD bawah disembunyikan di landing; dari sana ruang pertama dimasuki dengan keyboard (ArrowDown)
  const via = fromIdx === 0 ? 'keyboard ArrowDown' : 'tombol Lanjut';
  if (fromIdx === 0) await page.keyboard.press('ArrowDown');
  else await page.click('.hud__bar .hud__btn:last-child');
  await page.waitForTimeout(80);
  await waitIdle(page);
  await page.waitForTimeout(120);
  const rec = await page.evaluate(() => window.__rec.stop());
  const hasCards = (id) => id.startsWith('menu');
  return analyse(rec, hasCards(fromId) ? fromId : null, hasCards(toId) ? toId : null, durationMs, `${fromId} → ${toId} (${via})`);
}

async function suiteSteps(title, opts) {
  const { ctx, page, logs } = await open(opts);
  const list = [];
  // hero -> menu-1 -> menu-2 -> menu-3 -> menu-4 -> menu-5 -> detail -> reviews
  for (let i = 0; i < ROOM_IDS.length - 1; i++) list.push(await hopNext(page, i, 1200));
  report(title, list);
  if (logs.length) {
    failures += logs.length;
    console.log('  konsol:', logs.join(' | '));
  } else console.log('\n  konsol: tanpa error/peringatan');
  // dan kembali (mundur) satu langkah: menu-3 -> menu-2 harus simetris
  await ctx.close();
}

const want = (k) => !only || only === k;

if (want('desktop')) await suiteSteps('DESKTOP 1440x900: setiap perpindahan ruang (klik tombol Lanjut)', { w: 1440, h: 900 });
if (want('mobile')) await suiteSteps('PONSEL 390x844 (sentuh): setiap perpindahan ruang', { w: 390, h: 844, touch: true });

/* ----------------- mundur + lompat jauh (rel navigasi) ----------------- */
if (want('desktop')) {
  const { ctx, page } = await open({ w: 1440, h: 900 });
  const list = [];
  await page.evaluate(() => window.__ambang.rig.debugSetCamera(3));
  await waitIdle(page);
  // mundur satu ruang lewat tombol Kembali
  await page.evaluate(() => window.__rec.start(['menu-2', 'menu-3']));
  await page.click('.hud__bar .hud__btn:first-child');
  await page.waitForTimeout(80);
  await waitIdle(page);
  await page.waitForTimeout(120);
  let rec = await page.evaluate(() => window.__rec.stop());
  const back = analyse(rec, null, null, 1200, 'menu-3 → menu-2 (tombol Kembali)');
  // pasangan yang kembali (menu-2) tiba tepat 1 dan serempak; menu-3 mundur ke kedalaman
  {
    const S = rec.samples;
    const c2 = S.map((s) => s.rooms['menu-2']?.cards ?? []);
    const endW = c2[c2.length - 1].map((c) => c.w);
    const sS = c2.map((cs) => cs.map((c, i) => c.w / endW[i]));
    const dsync = Math.max(...sS.map(([a, b]) => Math.abs(a - b)));
    back.checks.push({ name: 'pasangan tujuan membesar serempak saat mundur', ok: dsync < 0.004, detail: `selisih maks ${fmt(dsync, 5)}` });
    const sm = sS.map((r) => (r[0] + r[1]) / 2);
    const nonMono = !isMonotone(sm.slice(sm.findIndex((v, i) => i && Math.abs(v - sm[0]) > 1e-4)), -1, 0.01);
    back.checks.push({ name: 'skala pasangan tujuan menurun monoton ke 1 (dari lebih besar)', ok: !nonMono, detail: `${fmt(sm[0])} → ${fmt(sm[sm.length - 1])}` });
    const c3 = S.map((s) => s.rooms['menu-3']?.cards ?? []);
    const w3 = c3[0].map((c) => c.w);
    const s3 = c3.map((cs) => cs.map((c, i) => c.w / w3[i]));
    back.checks.push({ name: 'pasangan yang ditinggalkan mengecil monoton', ok: isMonotone(s3.map((r) => (r[0] + r[1]) / 2), -1, 0.004), detail: '' });
  }
  list.push(back);

  // lompat jauh: dari menu-1 ke reviews lewat tick rel (durasi lebih panjang), lalu pastikan tiba
  await page.evaluate(() => window.__ambang.rig.debugSetCamera(1));
  await waitIdle(page);
  await page.evaluate(() => window.__rec.start(['menu-1', 'menu-2', 'menu-3', 'menu-4', 'menu-5']));
  await page.click('.hud__tick[aria-label^="Ruang 8"]');
  await page.waitForTimeout(100);
  const t0 = Date.now();
  await waitIdle(page, 9000);
  const tookMs = Date.now() - t0;
  rec = await page.evaluate(() => window.__rec.stop());
  const jump = { label: 'menu-1 → ulasan (klik rel ruang 8, lompat 6 ruang)', checks: [], info: { frames: rec.samples.length, medianFrameMs: NaN, p95FrameMs: NaN, travelMs: tookMs } };
  const snap = await page.evaluate(() => window.__rec.snap());
  jump.checks.push({ name: 'tiba di ruang 8 dan berhenti tepat', ok: snap.active === 7 && Math.abs(snap.c - 7) < 1e-6, detail: `aktif ${snap.active}, c=${fmt(snap.c, 5)}` });
  jump.checks.push({ name: 'durasi lompat jauh dibatasi (<= 2800 ms + toleransi)', ok: tookMs <= 3400, detail: `${tookMs} ms` });
  // kamera monoton naik selama perjalanan
  const cams = rec.samples.map((s) => s.cam).filter((c) => Number.isFinite(c));
  jump.checks.push({ name: 'posisi kamera naik monoton selama lompat jauh', ok: isMonotone(cams, +1, 1e-6), detail: `${fmt(cams[0])} → ${fmt(cams[cams.length - 1])}` });
  // tidak ada ruang yang "berkedip": opacity efektif tiap pasangan hanya naik lalu turun satu kali (unimodal)
  const unimodal = ['menu-1', 'menu-2', 'menu-3', 'menu-4', 'menu-5'].every((id) => {
    const o = rec.samples.map((s) => (s.rooms[id]?.cards ?? []).reduce((a, c) => a + c.o, 0) / 2);
    let phase = 0; // 0 naik, 1 turun
    for (let i = 1; i < o.length; i++) {
      const d = o[i] - o[i - 1];
      if (phase === 0 && d < -0.015) phase = 1;
      else if (phase === 1 && d > 0.015) return false;
    }
    return true;
  });
  jump.checks.push({ name: 'tiap pasangan menu hanya muncul-lalu-memudar satu kali (tanpa kedip)', ok: unimodal, detail: '' });
  jump.checks.push({ name: 'tidak ada pemasangan ulang kartu/gambar', ok: rec.mutations === 0, detail: `${rec.mutations} mutasi` });
  list.push(jump);
  report('DESKTOP 1440x900: mundur dan lompat jauh', list);
  await ctx.close();
}

/* ----------------- scroll native (roda) ----------------- */
if (want('scroll')) {
  const { ctx, page } = await open({ w: 1440, h: 900 });
  const list = [];
  // dari menu-1: roda ke bawah ~ 60% ruang, lalu lepas -> harus merapikan ke menu-2 dengan mulus
  await page.evaluate(() => window.__ambang.rig.debugSettle(true));
  await page.evaluate(() => window.__ambang.rig.debugSetCamera(1));
  await page.evaluate(() => window.__ambang.rig.debugSettle(true));
  await page.mouse.move(720, 450);
  const cdp = await ctx.newCDPSession(page);
  await page.evaluate(() => window.__rec.start(['menu-1', 'menu-2']));
  await wheelBurst(cdp, 720, 450, 90, 6); // putaran roda cepat: 540 px = 0.67 ruang
  await page.waitForTimeout(150);
  await waitSettled(page, 9000);
  await page.waitForTimeout(120);
  const rec = await page.evaluate(() => window.__rec.stop());
  const snap = await page.evaluate(() => window.__rec.snap());
  // Batas 9 (bukan 4.5): 540 px tiba dalam satu frame, jadi kamera mengejar dengan laju awal celah/tau =
  // 0.667 ruang / 0.09 dtk = 7.4 ruang/dtk (dibaca di frame pertama: opacity berubah 11% rentang dalam 16.7 ms
  // => 6.2). Itu laju pengikutan eksponensial yang disengaja, bukan kedip: kamera, skala, dan opacity tetap diperiksa
  // monoton di bawah. Putaran roda sungguhan tiba dalam beberapa ratus ms, jadi lajunya lebih rendah dari ini.
  const res = analyse(rec, 'menu-1', 'menu-2', 900, 'menu-1 → menu-2 (roda mouse 6 x 90 px sekaligus lalu dilepas)', { speedLimit: 9 });
  res.checks.push({ name: 'perapian berhenti tepat di ruang 3 (indeks 2)', ok: snap.active === 2 && Math.abs(snap.c - 2) < 1e-6, detail: `aktif ${snap.active}, c=${fmt(snap.c, 5)}` });
  const sy = await page.evaluate(() => ({ y: window.scrollY, R: window.__rec.snap().metrics.R }));
  res.checks.push({ name: 'posisi scroll native sinkron dengan kamera', ok: Math.abs(sy.y - 2 * sy.R) < 1.5, detail: `scrollY ${fmt(sy.y, 1)} vs ${2 * sy.R}` });
  list.push(res);

  // gerakan kecil (di bawah ambang) harus kembali ke ruang semula, tidak berpindah
  await page.evaluate(() => window.__ambang.rig.debugSetCamera(3));
  await waitSettled(page);
  await wheelBurst(cdp, 720, 450, 40, 1);
  await page.waitForTimeout(150);
  await waitSettled(page, 9000);
  const snap2 = await page.evaluate(() => window.__rec.snap());
  list.push({
    label: 'gestur kecil tidak berpindah ruang',
    info: {},
    checks: [{ name: 'roda 40 px dari ruang 4 kembali ke ruang 4', ok: snap2.active === 3 && Math.abs(snap2.c - 3) < 1e-6, detail: `aktif ${snap2.active}, c=${fmt(snap2.c, 5)}` }],
  });
  report('DESKTOP 1440x900: scroll native (roda mouse)', list);
  await ctx.close();
}

/* ----------------- SATU klik roda = satu ruang, di tinggi jendela mana pun ----------------- */
// Regresi: ambang komit dulu hanya 12% ruang, yaitu 117 px di 1080p dan 156 px di 1440p. Satu klik roda
// Chrome (100 px) kalah dari ambang itu: kamera bergeser sedikit lalu memantul kembali, dan pengguna roda
// bergerigi di monitor besar tidak bisa maju satu klik demi satu klik.
if (want('scroll')) {
  const list = [];
  for (const [w, h] of [[1366, 768], [1440, 900], [1920, 1080], [2560, 1440]]) {
    const { ctx, page } = await open({ w, h });
    const cdp = await ctx.newCDPSession(page);
    await page.mouse.move(w / 2, h / 2);
    const R = (await page.evaluate(() => window.__rec.snap())).metrics.R;
    const gesture = async (startRoom, deltaY, n) => {
      await page.evaluate((s) => {
        window.__ambang.rig.debugSettle(true);
        window.__ambang.rig.debugSetCamera(s);
      }, startRoom);
      await waitSettled(page);
      await wheelBurst(cdp, w / 2, h / 2, deltaY, n);
      await page.waitForTimeout(250);
      return waitSettled(page, 12000);
    };
    const checks = [];
    const want1 = (name, s, expect) => checks.push({ name, ok: s.active === expect && Math.abs(s.c - expect) < 1e-6, detail: `aktif ${s.active}, c=${fmt(s.c, 4)}, diharapkan ${expect}` });
    want1(`satu klik roda ke bawah (100 px = ${fmt(100 / R, 3)} ruang, R=${R}) maju satu ruang`, await gesture(3, 100, 1), 4);
    want1('satu klik roda ke atas (-100 px) mundur satu ruang', await gesture(3, -100, 1), 2);
    want1('klik roda kecil ala Firefox (57 px) juga maju satu ruang', await gesture(3, 57, 1), 4);
    want1('geseran tak sengaja 40 px kembali ke ruang semula', await gesture(3, 40, 1), 3);
    want1('geseran tak sengaja -40 px kembali ke ruang semula', await gesture(3, -40, 1), 3);
    want1('dua klik cepat (2 x 100 px) tetap hanya satu ruang', await gesture(3, 100, 2), 4);
    want1('klik roda ke bawah di ruang terakhir tetap di ruang terakhir', await gesture(7, 100, 1), 7);
    want1('klik roda ke atas di ruang pertama tetap di ruang pertama', await gesture(0, -100, 1), 0);
    list.push({ label: `satu klik roda di ${w}x${h}`, info: {}, checks });
    await ctx.close();
  }
  report('SATU KLIK RODA = SATU RUANG (tinggi jendela 768 sampai 1440)', list);
}

/* ----------------- sentuh: gulir native lewat CDP ----------------- */
if (want('mobile')) {
  const { ctx, page } = await open({ w: 390, h: 844, touch: true });
  const list = [];
  await page.evaluate(() => window.__ambang.rig.debugSettle(true));
  await page.evaluate(() => window.__ambang.rig.debugSetCamera(1));
  const cdp = await ctx.newCDPSession(page);
  // (Input.synthesizeScrollGesture tidak berfungsi di Chromium headless ini, bahkan pada halaman kosong;
  //  rangkaian Input.dispatchTouchEvent menghasilkan gestur sentuh sungguhan dan memicu scroll native.)
  const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 195, y }] });
  await page.evaluate(() => window.__rec.start(['menu-1', 'menu-2']));
  await touch('touchStart', 600);
  for (let y = 600; y >= 300; y -= 15) {
    await touch('touchMove', y);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', 300);
  await page.waitForTimeout(200);
  await waitIdle(page, 8000);
  await page.waitForTimeout(150);
  const rec = await page.evaluate(() => window.__rec.stop());
  const snap = await page.evaluate(() => window.__rec.snap());
  const res = analyse(rec, 'menu-1', 'menu-2', 900, 'menu-1 → menu-2 (seret jari ke atas 300 px lalu lepas)');
  res.checks.push({ name: 'swipe berakhir tepat di ruang 3 (indeks 2)', ok: snap.active === 2 && Math.abs(snap.c - 2) < 1e-6, detail: `aktif ${snap.active}, c=${fmt(snap.c, 5)}` });
  list.push(res);
  report('PONSEL 390x844: swipe sentuh native', list);
  await ctx.close();
}

/* ----------------- interupsi di tengah perjalanan ----------------- */
if (want('interrupt')) {
  const { ctx, page } = await open({ w: 1440, h: 900 });
  const list = [];
  await page.evaluate(() => window.__ambang.rig.debugSetCamera(2));
  await waitIdle(page);
  await page.evaluate(() => window.__rec.start(['menu-2', 'menu-3']));
  await page.click('.hud__bar .hud__btn:last-child');
  await page.waitForTimeout(500); // sekitar 40% perjalanan
  const before = await page.evaluate(() => window.__rec.snap().c);
  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, 30); // roda membatalkan tween
  await page.waitForTimeout(80);
  const after = await page.evaluate(() => window.__rec.snap().c);
  await waitIdle(page, 8000);
  const rec = await page.evaluate(() => window.__rec.stop());
  const snap = await page.evaluate(() => window.__rec.snap());
  const cams = rec.samples.map((s) => s.cam);
  const times = rec.samples.map((s) => s.t);
  // Kecepatan kamera (ruang per detik) dihitung terhadap WAKTU, bukan nomor frame: frame yang tersendat
  // di mesin tanpa GPU ini tidak boleh dianggap lompatan. Kecepatan puncak gerak yang sah:
  // ease-in-out cubic = 3 x jarak / durasi (perjalanan 1 ruang / 1200 ms = 2.5 ruang/dtk; perapian <= 3).
  const speedMax = (cs, ts) => Math.max(0, ...cs.slice(1).map((c, i) => Math.abs(c - cs[i]) / Math.max(0.001, (ts[i + 1] - ts[i]) / 1000)));
  const vMax = speedMax(cams, times);
  const SPEED_LIMIT = 3.4;
  list.push({
    label: 'perjalanan menu-2 → menu-3 diinterupsi roda di ~40%',
    info: { frames: rec.samples.length },
    checks: [
      { name: 'tidak ada lompatan posisi kamera (kecepatan maks <= 3.4 ruang/dtk)', ok: vMax <= SPEED_LIMIT, detail: `kecepatan maks ${fmt(vMax, 2)} ruang/dtk` },
      { name: 'kamera sempat bergerak sebelum diinterupsi dan tidak lompat ke tujuan', ok: before > 2.01 && before < 2.9 && after < 3, detail: `saat interupsi c=${fmt(before, 3)}` },
      { name: 'akhirnya berhenti rapi di satu ruang', ok: Number.isInteger(Math.round(snap.c)) && Math.abs(snap.c - Math.round(snap.c)) < 1e-6, detail: `c=${fmt(snap.c, 5)}, aktif ${snap.active}` },
      { name: 'tidak ada pemasangan ulang kartu/gambar', ok: rec.mutations === 0, detail: `${rec.mutations} mutasi` },
    ],
  });
  // klik ganda cepat pada "Lanjut"
  await page.evaluate(() => window.__ambang.rig.debugSetCamera(2));
  await waitIdle(page);
  await page.evaluate(() => window.__rec.start(['menu-2', 'menu-3', 'menu-4']));
  await page.click('.hud__bar .hud__btn:last-child');
  await page.waitForTimeout(120);
  await page.click('.hud__bar .hud__btn:last-child');
  await page.waitForTimeout(80);
  await waitIdle(page, 9000);
  const rec2 = await page.evaluate(() => window.__rec.stop());
  const snap2 = await page.evaluate(() => window.__rec.snap());
  const cams2 = rec2.samples.map((s) => s.cam);
  const times2 = rec2.samples.map((s) => s.t);
  const v2 = speedMax(cams2, times2);
  list.push({
    label: 'dua klik cepat pada Lanjut',
    info: { frames: rec2.samples.length },
    checks: [
      { name: 'tidak ada lompatan posisi kamera (kecepatan maks <= 3.4 ruang/dtk)', ok: v2 <= SPEED_LIMIT, detail: `kecepatan maks ${fmt(v2, 2)} ruang/dtk` },
      { name: 'klik ganda ke tujuan yang sama tidak menyalakan ulang gerakan (hanya satu ruang maju)', ok: snap2.active === 3, detail: `aktif ${snap2.active}` },
      { name: 'berhenti tepat di satu ruang (tidak di antara dua ruang)', ok: Math.abs(snap2.c - Math.round(snap2.c)) < 1e-6, detail: `c=${fmt(snap2.c, 5)}, aktif ${snap2.active}` },
      { name: 'posisi kamera monoton naik', ok: isMonotone(cams2, +1, 1e-5), detail: '' },
    ],
  });
  report('DESKTOP 1440x900: interupsi dan klik ganda', list);
  await ctx.close();
}

/* ----------------- gerak dikurangi ----------------- */
if (want('reduced')) {
  const { ctx, page, logs } = await open({ w: 1440, h: 900, reduced: true });
  const list = [];
  const info = await page.evaluate(() => ({
    perspective: getComputedStyle(document.querySelector('.stage')).perspective,
    worldTransform: getComputedStyle(document.querySelector('.world')).transform,
    motion: document.querySelector('.stage').dataset.motion,
  }));
  list.push({
    label: 'prefers-reduced-motion: reduce',
    info: {},
    checks: [
      { name: 'stage menandai mode gerak dikurangi', ok: info.motion === 'reduced', detail: info.motion },
      { name: 'tanpa perspektif dan tanpa transformasi dunia', ok: info.perspective === 'none' && (info.worldTransform === 'none'), detail: `perspective ${info.perspective}, world ${info.worldTransform}` },
    ],
  });
  await page.evaluate(() => window.__rec.start(['menu-1', 'menu-2']));
  await page.evaluate(() => window.__ambang.rig.debugSetCamera(1));
  await page.waitForTimeout(500);
  await page.click('.hud__bar .hud__btn:last-child');
  await page.waitForTimeout(700);
  const rec = await page.evaluate(() => window.__rec.stop());
  const widths = rec.samples.flatMap((s) => (s.rooms['menu-2']?.cards ?? []).map((c) => c.w)).filter((w) => w > 0);
  const spread = widths.length ? (Math.max(...widths) - Math.min(...widths)) / Math.max(...widths) : 0;
  const snap = await page.evaluate(() => window.__rec.snap());
  list.push({
    label: 'perpindahan menu-1 → menu-2 saat gerak dikurangi',
    info: { frames: rec.samples.length },
    checks: [
      { name: 'kartu tidak berskala selama perpindahan (tanpa zoom)', ok: spread < 0.002, detail: `variasi lebar ${fmt(spread, 5)}` },
      { name: 'tiba di ruang tujuan', ok: snap.active === 2, detail: `aktif ${snap.active}` },
    ],
  });
  report('GERAK DIKURANGI (prefers-reduced-motion)', list);
  if (logs.length) {
    failures += logs.length;
    console.log('  konsol:', logs.join(' | '));
  }
  await ctx.close();
}

console.log(`\n--- ringkasan --- ${failures ? `${failures} pemeriksaan GAGAL` : 'semua pemeriksaan lulus'}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));
await browser.close();
server.close();
process.exitCode = failures ? 1 : 0;
