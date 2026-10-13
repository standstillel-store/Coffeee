// Tangkapan layar ruang detail dengan pratinjau pesanan terbuka.
//   node scripts/shot-preview.mjs <outDir> <WxH> [productIndex=0] [--touch] [--dpr=N]
import { launchBrowser } from './browser.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [outDir, size, idxRaw = '0', ...flags] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const idx = Number(idxRaw);
const touch = flags.includes('--touch');
const dpr = Number((flags.find((f) => f.startsWith('--dpr=')) ?? '--dpr=1').split('=')[1]);
mkdirSync(outDir, { recursive: true });

const { server, port } = await serve(join(root, 'dist-check'));
const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/?debug=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__ambang, null, { timeout: 5000 });
await page.evaluate(() => window.__ambang.rig.debugSettle(false));
await page.waitForTimeout(1500);
await page.evaluate(() => window.__ambang.rig.debugSetCamera(6));
await page.waitForTimeout(500);
await page.evaluate((k) => document.querySelectorAll('.room[data-active] .rail__item')[k]?.click(), idx);
await page.waitForTimeout(900);
await page.screenshot({ path: join(outDir, `${w}x${h}-detail${idx + 1}.png`) });
await page.evaluate(() => {
  const plus = document.querySelector('.room[data-active] .qty__btn[aria-label="Tambah jumlah"]');
  plus?.click();
  plus?.click();
});
await page.waitForTimeout(150);
await page.evaluate(() => document.querySelector('.room[data-active] .order')?.click());
await page.waitForTimeout(900);
await page.screenshot({ path: join(outDir, `${w}x${h}-detail${idx + 1}-preview.png`) });
console.log('ok');
await browser.close();
server.close();
