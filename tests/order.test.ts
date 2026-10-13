import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { findProduct, products, type OptionGroup, type Product } from '../src/config/products';
import { formatIDR, pad2 } from '../src/lib/money';
import {
  clampQty,
  defaultSelection,
  lineTotal,
  MAX_QTY,
  normalizeSelection,
  selectionLabels,
  unitPrice,
  type Selection,
} from '../src/lib/order';

const get = (id: string): Product => {
  const p = findProduct(id);
  assert.ok(p, `produk ${id} tidak ditemukan`);
  return p;
};

/** semua kombinasi pilihan sebuah produk (hasil kali kartesius grup opsi) */
function everySelection(options: readonly OptionGroup[]): Selection[] {
  let acc: Selection[] = [{}];
  for (const group of options) {
    const next: Selection[] = [];
    for (const base of acc) for (const c of group.choices) next.push({ ...base, [group.id]: c.id });
    acc = next;
  }
  return acc;
}

/** Intl memakai spasi tak terputus (NBSP) antara "Rp" dan angka; bandingkan tanpa spasi. */
const squash = (s: string) => s.replace(/\s/g, '');

describe('defaultSelection', () => {
  it('memilih pilihan pertama di setiap grup', () => {
    assert.deepEqual(defaultSelection(get('mocha-swirl')), { ukuran: 'reguler', susu: 'sapi', manis: 'normal' });
    assert.deepEqual(defaultSelection(get('tasting-flight')), { porsi: 'berdua' });
    assert.deepEqual(defaultSelection(get('cold-brew')), { ukuran: 'reguler' });
  });

  it('satu entri per grup dan selalu menunjuk pilihan yang ada, untuk semua produk', () => {
    for (const p of products) {
      const sel = defaultSelection(p);
      assert.equal(Object.keys(sel).length, p.options.length, `${p.id}: jumlah grup`);
      for (const g of p.options) assert.ok(g.choices.some((c) => c.id === sel[g.id]), `${p.id}/${g.id}`);
    }
  });

  it('harga pilihan bawaan sama dengan harga dasar (harga "mulai dari" tidak bohong)', () => {
    for (const p of products) assert.equal(unitPrice(p, defaultSelection(p)), p.price, p.id);
  });
});

describe('unitPrice', () => {
  it('menjumlahkan selisih harga setiap grup ke harga dasar', () => {
    const mocha = get('mocha-swirl');
    assert.equal(unitPrice(mocha, { ukuran: 'large', susu: 'sapi', manis: 'normal' }), 38000 + 6000);
    assert.equal(unitPrice(mocha, { ukuran: 'reguler', susu: 'oat', manis: 'normal' }), 38000 + 8000);
    assert.equal(unitPrice(mocha, { ukuran: 'large', susu: 'oat', manis: 'tanpa' }), 38000 + 6000 + 8000);
    const flat = get('flat-white');
    assert.equal(unitPrice(flat, { ukuran: 'large', susu: 'oat' }), 34000 + 5000 + 8000);
    assert.equal(unitPrice(get('tasting-flight'), { porsi: 'bertiga' }), 95000 + 20000);
    assert.equal(unitPrice(get('cold-brew'), { ukuran: 'large' }), 30000 + 6000);
  });

  it('tingkat kemanisan tidak mengubah harga', () => {
    const mocha = get('mocha-swirl');
    const base = { ukuran: 'reguler', susu: 'sapi' };
    const prices = ['normal', 'kurang', 'tanpa'].map((manis) => unitPrice(mocha, { ...base, manis }));
    assert.deepEqual(prices, [38000, 38000, 38000]);
  });

  it('pilihan kosong atau tidak dikenal jatuh ke pilihan bawaan, bukan NaN atau harga salah', () => {
    const mocha = get('mocha-swirl');
    assert.equal(unitPrice(mocha, {}), 38000);
    assert.equal(unitPrice(mocha, { ukuran: 'jumbo', susu: 'almond', manis: '???' }), 38000);
    assert.equal(unitPrice(mocha, { ukuran: 'large', susu: 'tidak-ada' }), 38000 + 6000);
  });

  it('semua kombinasi di semua produk: bilangan bulat, tidak di bawah harga dasar, tidak lebih dari +50%', () => {
    let combos = 0;
    for (const p of products) {
      for (const sel of everySelection(p.options)) {
        const price = unitPrice(p, sel);
        combos++;
        assert.ok(Number.isInteger(price), `${p.id}: ${price} bukan bilangan bulat`);
        assert.ok(price >= p.price, `${p.id}: harga ${price} di bawah harga dasar ${p.price}`);
        assert.ok(price <= p.price * 1.5, `${p.id}: tambahan ${price - p.price} terlalu besar untuk sebuah varian`);
      }
    }
    assert.ok(combos >= products.length, 'ada kombinasi yang diuji');
  });
});

describe('normalizeSelection', () => {
  const mocha = get('mocha-swirl');

  it('mempertahankan pilihan yang sah', () => {
    const sel = { ukuran: 'large', susu: 'oat', manis: 'kurang' };
    assert.deepEqual(normalizeSelection(mocha, sel), sel);
  });

  it('mengganti pilihan tidak dikenal dan mengisi grup yang hilang dengan pilihan pertama', () => {
    assert.deepEqual(normalizeSelection(mocha, { ukuran: 'jumbo', manis: 'tanpa' }), {
      ukuran: 'reguler',
      susu: 'sapi',
      manis: 'tanpa',
    });
  });

  it('membuang grup asing dan tidak mengubah masukan', () => {
    const input: Selection = { ukuran: 'large', topping: 'boba' };
    const copy = { ...input };
    const out = normalizeSelection(mocha, input);
    assert.ok(!('topping' in out));
    assert.deepEqual(input, copy);
  });
});

describe('clampQty', () => {
  it('membulatkan dan membatasi ke 1..MAX_QTY', () => {
    assert.equal(MAX_QTY, 20);
    assert.equal(clampQty(1), 1);
    assert.equal(clampQty(7), 7);
    assert.equal(clampQty(0), 1);
    assert.equal(clampQty(-5), 1);
    assert.equal(clampQty(1.4), 1);
    assert.equal(clampQty(2.6), 3);
    assert.equal(clampQty(MAX_QTY), MAX_QTY);
    assert.equal(clampQty(MAX_QTY + 1), MAX_QTY);
    assert.equal(clampQty(10_000), MAX_QTY);
  });

  it('masukan yang bukan angka hingga kembali ke 1', () => {
    assert.equal(clampQty(Number.NaN), 1);
    assert.equal(clampQty(Number.POSITIVE_INFINITY), 1);
    assert.equal(clampQty(Number.NEGATIVE_INFINITY), 1);
  });
});

describe('lineTotal', () => {
  const mocha = get('mocha-swirl');
  const sel = { ukuran: 'large', susu: 'oat', manis: 'normal' };

  it('harga satuan dikali jumlah', () => {
    assert.equal(lineTotal(mocha, sel, 1), 52000);
    assert.equal(lineTotal(mocha, sel, 3), 156000);
  });

  it('jumlah di luar batas dikoreksi sebelum dikali', () => {
    assert.equal(lineTotal(mocha, sel, 0), 52000);
    assert.equal(lineTotal(mocha, sel, 999), 52000 * MAX_QTY);
    assert.equal(lineTotal(mocha, sel, Number.NaN), 52000);
  });

  it('total pesanan terbesar tetap bilangan bulat yang aman', () => {
    for (const p of products) {
      for (const s of everySelection(p.options)) {
        const t = lineTotal(p, s, MAX_QTY);
        assert.ok(Number.isSafeInteger(t) && t > 0, `${p.id}: ${t}`);
      }
    }
  });
});

describe('selectionLabels', () => {
  it('mengembalikan label pilihan sesuai urutan grup', () => {
    assert.deepEqual(selectionLabels(get('mocha-swirl'), { ukuran: 'large', susu: 'oat', manis: 'kurang' }), [
      'Large 16 oz',
      'Oat',
      'Kurang',
    ]);
    assert.deepEqual(selectionLabels(get('mocha-swirl'), defaultSelection(get('mocha-swirl'))), [
      'Reguler 12 oz',
      'Susu sapi',
      'Normal',
    ]);
    assert.deepEqual(selectionLabels(get('flat-white'), { ukuran: 'large', susu: 'sapi' }), ['Large 12 oz', 'Susu sapi']);
  });

  it('pilihan tidak dikenal ditampilkan sebagai pilihan bawaan (label selalu cocok dengan harga)', () => {
    const labels = selectionLabels(get('cold-brew'), { ukuran: 'raksasa' });
    assert.deepEqual(labels, ['Reguler 12 oz']);
    assert.equal(unitPrice(get('cold-brew'), { ukuran: 'raksasa' }), 30000);
  });

  it('jumlah label sama dengan jumlah grup, tanpa label kosong', () => {
    for (const p of products) {
      const labels = selectionLabels(p, defaultSelection(p));
      assert.equal(labels.length, p.options.length, p.id);
      for (const l of labels) assert.ok(l.trim().length > 0, `${p.id}: label kosong`);
    }
  });
});

describe('formatIDR', () => {
  it('rupiah tanpa desimal, titik sebagai pemisah ribuan', () => {
    assert.equal(squash(formatIDR(38000)), 'Rp38.000');
    assert.equal(squash(formatIDR(0)), 'Rp0');
    assert.equal(squash(formatIDR(1500)), 'Rp1.500');
    assert.equal(squash(formatIDR(1234567)), 'Rp1.234.567');
  });

  it('tidak pernah menampilkan desimal', () => {
    for (const v of [38000, 38000.4, 38000.5, 99999.99]) assert.ok(!/[.,]\d{1,2}$/.test(squash(formatIDR(v)).replace(/\.\d{3}/g, '')), String(v));
  });

  it('semua harga menu dan varian dapat diformat dan memuat angkanya', () => {
    for (const p of products) {
      for (const s of everySelection(p.options)) {
        const out = squash(formatIDR(unitPrice(p, s)));
        assert.match(out, /^Rp\d{1,3}(\.\d{3})*$/, `${p.id}: ${out}`);
      }
    }
  });

  it('menerima locale lain tanpa error', () => {
    assert.ok(formatIDR(38000, 'en-US').includes('38,000'));
  });
});

describe('pad2', () => {
  it('menambah nol di depan sampai dua digit', () => {
    assert.equal(pad2(0), '00');
    assert.equal(pad2(3), '03');
    assert.equal(pad2(10), '10');
    assert.equal(pad2(123), '123');
  });
});
