// Tangkapan layar pada posisi kamera tertentu (membutuhkan dist-check/ dari build-check.mjs).
//
//   node scripts/shots.mjs <outDir> <width>x<height> <c1,c2,...> [--dpr=1] [--touch]
//
// Contoh: node scripts/shots.mjs /tmp/shots 1440x900 0,1,1.5,2
import { launchBrowser } from './browser.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [outDir, size, camList, ...flags] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const dpr = Number((flags.find((f) => f.startsWith('--dpr=')) ?? '--dpr=1').split('=')[1]);
const touch = flags.includes('--touch');
const reduced = flags.includes('--reduced');
mkdirSync(outDir, { recursive: true });

const { server, port } = await serve(join(root, 'dist-check'));
const browser = await launchBrowser();
const ctx = await browser.newContext({
  viewport: { width: w, height: h },
  deviceScaleFactor: dpr,
  hasTouch: touch,
  isMobile: touch,
  reducedMotion: reduced ? 'reduce' : 'no-preference',
});
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/?debug=1`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__ambang, null, { timeout: 5000 });
await page.evaluate(() => window.__ambang.rig.debugSettle(false));
await page.waitForTimeout(2400); // biarkan animasi pembuka selesai

for (const raw of camList.split(',')) {
  const c = Number(raw);
  await page.evaluate((v) => window.__ambang.rig.debugSetCamera(v), c);
  await page.waitForTimeout(500);
  const name = `${w}x${h}-c${String(c).replace('.', '_')}.png`;
  await page.screenshot({ path: join(outDir, name) });
  console.log('shot', name);
}
if (logs.length) console.log('--- konsol ---\n' + logs.join('\n'));
await browser.close();
server.close();
