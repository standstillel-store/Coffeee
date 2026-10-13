// Build verifikasi memakai esbuild (pengganti `vite build` di lingkungan tanpa akses npm).
// Hasil: dist-check/ (halaman statis yang dapat dibuka di browser).
//
//   node scripts/build-check.mjs            -> bundel minify
//   node scripts/build-check.mjs --dev      -> tanpa minify (lebih mudah dibaca)
//
// Skrip ini BUKAN pengganti `npm run build` (Vite) untuk produksi; ia ada
// agar proyek dapat dikompilasi dan diuji di sini.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-check');
const dev = process.argv.includes('--dev');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'assets'), { recursive: true });

const result = await build({
  absWorkingDir: root,
  entryPoints: { app: 'src/main.tsx' },
  outdir: join(out, 'assets'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
  metafile: true,
  logLevel: 'info',
});

cpSync(join(root, 'public'), out, { recursive: true });

let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html
  .replace('</head>', '    <link rel="stylesheet" href="assets/app.css" />\n  </head>')
  .replace('<script type="module" src="/src/main.tsx"></script>', '<script type="module" src="assets/app.js"></script>');
writeFileSync(join(out, 'index.html'), html);

const size = (p) => (statSync(join(out, p)).size / 1024).toFixed(1) + ' KB';
console.log('\nBundel:');
for (const f of readdirSync(join(out, 'assets'))) console.log('  assets/' + f, size('assets/' + f));
console.log('Aset gambar:');
for (const f of readdirSync(join(out, 'images'))) console.log('  images/' + f, size('images/' + f));
void result;
