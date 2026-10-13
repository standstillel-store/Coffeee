// Meluncurkan Chromium untuk skrip uji.
// Urutan pilihan: CHROMIUM_PATH (jika diset) -> /opt/pw-browsers/chromium (lingkungan tempat proyek ini
// diverifikasi) -> Chromium bawaan Playwright (npx playwright install chromium).
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

export async function launchBrowser() {
  const executablePath = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium'].filter(Boolean).find((p) => existsSync(p));
  // sandbox Chromium tidak bisa jalan sebagai root (mis. di dalam kontainer); selain itu biarkan aktif
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  return chromium.launch({ ...(executablePath ? { executablePath } : {}), args: asRoot ? ['--no-sandbox'] : [] });
}
