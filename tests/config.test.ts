import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { brand } from '../src/config/brand';
import { motion } from '../src/config/motion';
import { categoryLabels, findProduct, products, type Product } from '../src/config/products';
import { reviews, reviewsAreDemo } from '../src/config/reviews';
import { buildRooms, PRODUCTS_PER_ROOM, roomIndexOf, rooms } from '../src/config/rooms';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = (rel: string) => join(root, 'public', rel);

/** emoji / piktograf (aturan desain: tanpa emoji). */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;

describe('produk', () => {
  it('ada sepuluh produk dengan id unik', () => {
    assert.equal(products.length, 10);
    assert.equal(new Set(products.map((p) => p.id)).size, products.length);
    assert.equal(new Set(products.map((p) => p.name)).size, products.length);
  });

  it('gambar menu adalah product-01..10.jpg sesuai urutan, tanpa URL luar', () => {
    products.forEach((p, i) => {
      assert.equal(p.image, `images/product-${String(i + 1).padStart(2, '0')}.jpg`);
      assert.ok(!/^[a-z]+:\/\//i.test(p.image), 'gambar tidak boleh dari URL luar');
    });
    assert.equal(new Set(products.map((p) => p.image)).size, products.length);
  });

  it('berkas gambar benar-benar ada, JPEG/PNG sungguhan, dan ukurannya wajar', () => {
    for (const p of products) {
      const file = pub(p.image);
      assert.ok(existsSync(file), `${p.image} tidak ada`);
      const buf = readFileSync(file);
      assert.ok(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff, `${p.image} bukan JPEG`);
      assert.ok(statSync(file).size < 300 * 1024, `${p.image} terlalu besar (${statSync(file).size} B)`);
    }
    const hero = pub(brand.heroImage);
    assert.ok(existsSync(hero), 'coffee-hero.png tidak ada');
    const png = readFileSync(hero);
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'hero bukan PNG');
    assert.ok(statSync(hero).size < 900 * 1024, 'hero terlalu besar untuk dimuat pertama');
  });

  it('data tiap produk lengkap dan masuk akal', () => {
    for (const p of products) {
      assert.ok(p.name.trim().length > 0, `${p.id}: nama kosong`);
      assert.ok(p.description.trim().length >= 40 && p.description.length <= 140, `${p.id}: deskripsi ${p.description.length} karakter (harus singkat)`);
      assert.ok(p.imageAlt.trim().length >= 20, `${p.id}: alt gambar terlalu pendek`);
      assert.ok(Number.isInteger(p.price) && p.price >= 10000 && p.price <= 500000, `${p.id}: harga ${p.price}`);
      assert.ok(p.category in categoryLabels, `${p.id}: kategori ${p.category}`);
      assert.ok(p.focus.x >= 0 && p.focus.x <= 100 && p.focus.y >= 0 && p.focus.y <= 100, `${p.id}: focus di luar 0..100`);
      assert.ok(p.tint >= 0 && p.tint <= 1, `${p.id}: tint di luar 0..1`);
      assert.ok(p.notes.length >= 2 && p.notes.length <= 4, `${p.id}: jumlah catatan rasa`);
      assert.ok(p.options.length >= 1, `${p.id}: tanpa opsi ukuran/varian`);
    }
  });

  it('opsi: id unik per grup, pilihan pertama bebas biaya tambahan, selisih bilangan bulat', () => {
    for (const p of products) {
      assert.equal(new Set(p.options.map((o) => o.id)).size, p.options.length, `${p.id}: id grup ganda`);
      for (const g of p.options) {
        assert.ok(g.choices.length >= 2, `${p.id}/${g.id}: pilihan kurang dari dua`);
        assert.equal(new Set(g.choices.map((c) => c.id)).size, g.choices.length, `${p.id}/${g.id}: id pilihan ganda`);
        assert.equal(g.choices[0]!.priceDelta, 0, `${p.id}/${g.id}: pilihan default harus tanpa tambahan`);
        for (const c of g.choices) assert.ok(Number.isInteger(c.priceDelta) && c.priceDelta >= 0, `${p.id}/${c.id}: selisih harga`);
      }
    }
  });

  it('semua produk memuat ukuran atau porsi', () => {
    for (const p of products) {
      assert.ok(p.options.some((o) => o.id === 'ukuran' || o.id === 'porsi'), `${p.id}: tanpa pilihan ukuran/porsi`);
    }
  });

  it('findProduct', () => {
    assert.equal(findProduct('noir-latte')?.name, 'Noir Latte');
    assert.equal(findProduct('tidak-ada'), undefined);
  });
});

describe('ruang', () => {
  it('delapan ruang: landing, lima menu berpasangan, detail, ulasan', () => {
    assert.equal(rooms.length, 8);
    assert.deepEqual(
      rooms.map((r) => r.kind),
      ['hero', 'menu', 'menu', 'menu', 'menu', 'menu', 'detail', 'reviews'],
    );
    rooms.forEach((r, i) => assert.equal(r.index, i));
    assert.equal(new Set(rooms.map((r) => r.id)).size, rooms.length);
    assert.equal(roomIndexOf('detail'), 6);
    assert.equal(roomIndexOf('reviews'), 7);
  });

  it('pasangan menu 1-2, 3-4, 5-6, 7-8, 9-10', () => {
    const menus = rooms.filter((r) => r.kind === 'menu');
    assert.equal(PRODUCTS_PER_ROOM, 2);
    assert.deepEqual(
      menus.map((r) => r.productIds),
      [0, 2, 4, 6, 8].map((i) => [products[i]!.id, products[i + 1]!.id]),
    );
    assert.deepEqual(menus.map((r) => r.short), ['01–02', '03–04', '05–06', '07–08', '09–10']);
  });

  it('setiap produk ada di tepat satu ruang menu', () => {
    const all = rooms.flatMap((r) => r.productIds);
    assert.equal(all.length, products.length);
    assert.deepEqual([...all].sort(), products.map((p) => p.id).sort());
  });

  it('jalur kamera berkelok bergantian dan kembali ke tengah di detail dan ulasan', () => {
    const menus = rooms.filter((r) => r.kind === 'menu');
    menus.forEach((r, k) => {
      assert.ok(Math.sign(r.offset.x) === (k % 2 === 0 ? 1 : -1), `menu ${k + 1}: arah simpangan`);
      assert.ok(Math.abs(r.offset.x) <= 0.2, 'simpangan terlalu besar sehingga kartu keluar layar');
    });
    for (const r of rooms.filter((x) => x.kind !== 'menu')) assert.deepEqual(r.offset, { x: 0, y: 0 });
  });

  it('veil: sampul tetap bersih (menu pertama diredam) dan semua di 0..1', () => {
    const [hero, first, second, , , , detail, review] = rooms;
    assert.equal(hero!.veil, 1);
    assert.equal(first!.veil, motion.pose.ahead.veil.afterHero);
    assert.ok(first!.veil < 1, 'menu pertama harus diredam saat dilihat dari landing');
    assert.equal(second!.veil, 1, 'antar menu, pasangan berikutnya harus jelas terlihat');
    assert.equal(detail!.veil, motion.pose.ahead.veil.detail);
    assert.equal(review!.veil, motion.pose.ahead.veil.reviews);
    for (const r of rooms) assert.ok(r.veil >= 0 && r.veil <= 1);
  });

  it('susunan mengikuti jumlah produk (7 produk -> 1 + 4 menu + detail + ulasan)', () => {
    const seven: Product[] = products.slice(0, 7);
    const r = buildRooms(seven);
    assert.equal(r.length, 7);
    assert.equal(r.filter((x) => x.kind === 'menu').length, 4);
    assert.equal(r.filter((x) => x.kind === 'menu')[3]!.productIds.length, 1);
    assert.equal(r.filter((x) => x.kind === 'menu')[3]!.short, '07');
    assert.equal(buildRooms([]).length, 3);
  });
});

describe('brand dan salinan', () => {
  it('semua teks utama terisi dan jujur sebagai demo', () => {
    assert.ok(brand.name.length > 0 && brand.headline.length > 0 && brand.description.length > 0 && brand.scrollCue.length > 0);
    assert.match(brand.demoNotice, /demo/i);
    assert.match(brand.demoNotice, /bukan toko|contoh/i);
  });

  it('tidak ada emoji di teks yang tampil', () => {
    const texts = [
      ...Object.values(brand).flatMap((v) => (typeof v === 'string' ? [v] : typeof v === 'object' ? Object.values(v) : [])),
      ...products.flatMap((p) => [p.name, p.description, p.imageAlt, ...p.notes, ...p.options.flatMap((o) => [o.label, ...o.choices.map((c) => c.label)])]),
      ...reviews.flatMap((r) => [r.name, r.text, r.item]),
    ];
    for (const t of texts) assert.ok(!EMOJI.test(t), `emoji ditemukan: ${t}`);
  });

  it('tidak ada klaim yang menyesatkan di salinan (diskon, stok, pengiriman, rating total)', () => {
    const copy = [brand.headline, brand.description, brand.demoNotice, ...products.map((p) => p.description)].join(' ').toLowerCase();
    for (const bad of ['diskon', 'gratis ongkir', 'stok terbatas', 'terlaris', 'terbaik di', 'ribuan pelanggan', 'bersertifikat']) {
      assert.ok(!copy.includes(bad), `salinan memuat klaim yang tak terbukti: ${bad}`);
    }
  });
});

describe('ulasan', () => {
  it('seluruh ulasan ditandai sebagai contoh/demo', () => {
    assert.equal(reviewsAreDemo, true);
    assert.ok(reviews.length >= 6);
  });

  it('data ulasan valid: id unik, rating 1..5 bulat, teks tidak kosong', () => {
    assert.equal(new Set(reviews.map((r) => r.id)).size, reviews.length);
    for (const r of reviews) {
      assert.ok(Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5, `${r.id}: rating`);
      assert.ok(r.text.trim().length >= 30 && r.text.length <= 160, `${r.id}: panjang teks ${r.text.length}`);
      assert.ok(r.name.trim().length > 0);
    }
  });

  it('setiap ulasan membahas menu yang memang ada', () => {
    const names = new Set(products.map((p) => p.name));
    for (const r of reviews) assert.ok(names.has(r.item), `${r.id}: menu "${r.item}" tidak ada di daftar`);
  });
});

describe('berkas proyek', () => {
  const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

  it('komponen dan konfigurasi yang diminta ada sebagai berkas terpisah', () => {
    for (const f of [
      'src/components/HeroSection.tsx',
      'src/components/RoomTransition.tsx',
      'src/components/ProductGrid.tsx',
      'src/components/ProductCard.tsx',
      'src/components/ProductDetail.tsx',
      'src/components/ReviewCarousel.tsx',
      'src/components/NavigationControls.tsx',
      'src/config/products.ts',
      'src/config/motion.ts',
      'public/images/coffee-hero.png',
      'index.html',
      'vite.config.ts',
    ]) {
      assert.ok(existsSync(join(root, f)), `${f} tidak ada`);
    }
  });

  it('ruang 3D memakai perspective, translate3d, dan preserve-3d sungguhan', () => {
    const stage = read('src/styles/stage.css');
    assert.match(stage, /perspective:\s*var\(--P/);
    assert.match(stage, /transform-style:\s*preserve-3d/);
    const rig = read('src/lib/rig.ts');
    assert.match(rig, /translate3d\(/);
  });

  it('menghormati prefers-reduced-motion di CSS dan di mesin kamera', () => {
    const css = ['stage', 'hero', 'detail', 'finale', 'hud'].map((n) => read(`src/styles/${n}.css`)).join('\n');
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(read('src/hooks/useReducedMotion.ts'), /prefers-reduced-motion/);
  });

  it('tidak ada panggilan jaringan di kode aplikasi (pesanan demo tidak mengirim apa pun)', () => {
    const files = [
      'src/main.tsx',
      'src/App.tsx',
      ...['HeroSection', 'RoomTransition', 'ProductGrid', 'ProductCard', 'ProductDetail', 'ReviewCarousel', 'ReviewsRoom', 'NavigationControls'].map((n) => `src/components/${n}.tsx`),
      'src/lib/order.ts',
      'src/lib/rig.ts',
    ];
    for (const f of files) {
      const src = read(f);
      for (const needle of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage', 'document.cookie']) {
        assert.ok(!src.includes(needle), `${f} memakai ${needle}`);
      }
    }
  });

  it('pratinjau pesanan dan ulasan diberi label demo yang jelas di komponen', () => {
    const detail = read('src/components/ProductDetail.tsx');
    assert.match(detail, /Pratinjau pesanan · demo/);
    assert.match(detail, /Tidak ada pesanan yang dikirim atau dibayar/);
    assert.match(detail, /Pesan \(demo\)/);
    const carousel = read('src/components/ReviewCarousel.tsx');
    assert.match(carousel, /Contoh · data demo/);
    assert.match(carousel, /\(contoh\)/);
    const room = read('src/components/ReviewsRoom.tsx');
    assert.match(room, /Bukan dari pelanggan sungguhan/);
  });

  it('tidak ada URL eksternal untuk aset (gambar/font/skrip) di HTML dan CSS', () => {
    const html = read('index.html');
    assert.ok(!/(src|href)=["']https?:\/\//i.test(html), 'index.html memuat aset dari URL luar');
    for (const n of ['tokens', 'stage', 'hero', 'menu', 'detail', 'finale', 'hud']) {
      const css = read(`src/styles/${n}.css`);
      assert.ok(!/url\(\s*["']?https?:/i.test(css), `${n}.css memuat url() eksternal`);
    }
  });

  it('font yang dipakai tersedia secara lokal beserta lisensinya', () => {
    for (const f of ['gloock-regular.woff', 'instrument-sans-regular.woff', 'instrument-sans-bold.woff', 'OFL-Gloock.txt', 'OFL-InstrumentSans.txt']) {
      assert.ok(existsSync(pub(`fonts/${f}`)), `fonts/${f} tidak ada`);
    }
  });
});
