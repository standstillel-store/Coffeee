// Mengukur kotak elemen di ruang aktif (untuk menyetel tata letak tanpa menebak).
//
//   node scripts/probe.mjs <WxH> <kamera> <selector> [<selector> ...] [--touch] [--product=N] [--preview]
//
// Contoh: node scripts/probe.mjs 667x375 7 .finale__head .review .reviews__controls .finale__close .hud__bar
import { launchBrowser } from './browser.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const pos = args.filter((a) => !a.startsWith('--'));
const [size, camRaw, ...selectors] = pos;
const [w, h] = size.split('x').map(Number);
const touch = flags.includes('--touch');
const preview = flags.includes('--preview');
const product = Number((flags.find((f) => f.startsWith('--product=')) ?? '--product=0').split('=')[1]);

const { server, port } = await serve(join(root, 'dist-check'));
const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/?debug=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__ambang, null, { timeout: 5000 });
await page.evaluate(() => window.__ambang.rig.debugSettle(false));
await page.waitForTimeout(1500);
await page.evaluate((v) => window.__ambang.rig.debugSetCamera(v), Number(camRaw));
await page.waitForTimeout(600);
if (Number(camRaw) === 6) {
  await page.evaluate((k) => document.querySelectorAll('.room[data-active] .rail__item')[k]?.click(), product);
  await page.waitForTimeout(900);
  if (preview) {
    await page.evaluate(() => document.querySelector('.room[data-active] .order')?.click());
    await page.waitForTimeout(800);
  }
}
const rows = await page.evaluate((sels) => {
  const out = [];
  for (const sel of sels) {
    const scope = sel.startsWith('.hud') ? document : (document.querySelector('.room[data-active]') ?? document);
    const els = [...scope.querySelectorAll(sel)].slice(0, 1);
    if (!els.length) out.push({ sel, none: true });
    for (const el of els) {
      const r = el.getBoundingClientRect();
      out.push({
        sel,
        top: +r.top.toFixed(1),
        bottom: +r.bottom.toFixed(1),
        left: +r.left.toFixed(1),
        right: +r.right.toFixed(1),
        w: +r.width.toFixed(1),
        h: +r.height.toFixed(1),
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
      });
    }
  }
  return out;
}, selectors);
console.log(`viewport ${w}x${h}, kamera ${camRaw}`);
for (const r of rows) {
  if (r.none) console.log(`  ${r.sel.padEnd(26)} (tidak ada)`);
  else
    console.log(
      `  ${r.sel.padEnd(26)} y ${String(r.top).padStart(6)} → ${String(r.bottom).padStart(6)}  (tinggi ${String(r.h).padStart(6)})  x ${String(r.left).padStart(6)} → ${String(r.right).padStart(6)}  scroll ${r.scrollH}/${r.clientH}`,
    );
}
await browser.close();
server.close();
