import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { brand } from '../src/config/brand';
import { splitWordmark } from '../src/lib/wordmark';

describe('splitWordmark', () => {
  it('membagi nama genap menjadi dua bagian sama panjang, huruf kapital', () => {
    assert.deepEqual(splitWordmark('Ambang'), ['AMB', 'ANG']);
    assert.deepEqual(splitWordmark('kopi'), ['KO', 'PI']);
  });

  it('nama ganjil: bagian kiri mendapat satu huruf lebih banyak', () => {
    assert.deepEqual(splitWordmark('Senja'), ['SEN', 'JA']);
    assert.deepEqual(splitWordmark('Lor'), ['LO', 'R']);
  });

  it('nama sangat pendek atau kosong tidak error', () => {
    assert.deepEqual(splitWordmark('ab'), ['A', 'B']);
    assert.deepEqual(splitWordmark('a'), ['A', '']);
    assert.deepEqual(splitWordmark(''), ['', '']);
    assert.deepEqual(splitWordmark('   '), ['', '']);
  });

  it('spasi di tepi dibuang', () => {
    assert.deepEqual(splitWordmark('  Ambang  '), ['AMB', 'ANG']);
  });

  it('huruf bertanda diacritic tidak terbelah di tengah', () => {
    assert.deepEqual(splitWordmark('Café'), ['CA', 'FÉ']);
  });

  it('gabungan kedua bagian selalu sama dengan nama kapital', () => {
    for (const name of ['Ambang', 'Senja', 'Kopi Kenangan', 'X', 'Æther']) {
      const [l, r] = splitWordmark(name);
      assert.equal(l + r, name.trim().toUpperCase(), name);
      assert.ok(l.length >= r.length, `${name}: kiri tidak lebih pendek dari kanan`);
    }
  });

  it('nama brand di konfigurasi menghasilkan dua bagian yang tidak kosong', () => {
    const [l, r] = splitWordmark(brand.name);
    assert.ok(l.length > 0 && r.length > 0, `${brand.name} -> "${l}" + "${r}"`);
  });
});
