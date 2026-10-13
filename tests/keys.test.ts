import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { roomKeyAction, type KeyContext, type KeyLike } from '../src/lib/keys';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

const ctx = (over: Partial<KeyContext> = {}): KeyContext => ({ editable: false, interactive: false, roomkeys: null, ...over });

const NAV_KEYS = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End', ' '];

describe('roomKeyAction: tombol dasar', () => {
  it('panah bawah dan PageDown maju; panah atas dan PageUp mundur', () => {
    assert.equal(roomKeyAction(key('ArrowDown'), ctx()), 'next');
    assert.equal(roomKeyAction(key('PageDown'), ctx()), 'next');
    assert.equal(roomKeyAction(key('ArrowUp'), ctx()), 'prev');
    assert.equal(roomKeyAction(key('PageUp'), ctx()), 'prev');
  });

  it('Home ke ruang pertama, End ke ruang terakhir', () => {
    assert.equal(roomKeyAction(key('Home'), ctx()), 'first');
    assert.equal(roomKeyAction(key('End'), ctx()), 'last');
  });

  it('panah kanan/kiri juga maju/mundur di luar widget yang memakainya', () => {
    assert.equal(roomKeyAction(key('ArrowRight'), ctx()), 'next');
    assert.equal(roomKeyAction(key('ArrowLeft'), ctx()), 'prev');
  });

  it('tombol lain tidak dicegat (Tab, Enter, Escape, huruf)', () => {
    for (const k of ['Tab', 'Enter', 'Escape', 'a', 'j', '1', 'Shift', 'F5']) {
      assert.equal(roomKeyAction(key(k), ctx()), null, k);
    }
  });
});

describe('roomKeyAction: Spasi', () => {
  it('Spasi maju, Shift+Spasi mundur (seperti halaman biasa)', () => {
    assert.equal(roomKeyAction(key(' '), ctx()), 'next');
    assert.equal(roomKeyAction(key(' ', { shiftKey: true }), ctx()), 'prev');
    assert.equal(roomKeyAction(key('Spacebar'), ctx()), 'next');
  });

  it('Spasi pada tombol, tautan, atau radio dibiarkan untuk elemen itu sendiri', () => {
    assert.equal(roomKeyAction(key(' '), ctx({ interactive: true })), null);
    assert.equal(roomKeyAction(key(' ', { shiftKey: true }), ctx({ interactive: true })), null);
  });

  it('panah dan Home/End tetap bekerja walau fokus ada di tombol', () => {
    assert.equal(roomKeyAction(key('ArrowDown'), ctx({ interactive: true })), 'next');
    assert.equal(roomKeyAction(key('End'), ctx({ interactive: true })), 'last');
  });
});

describe('roomKeyAction: data-roomkeys', () => {
  it('"horizontal" (karusel): panah kiri/kanan dan Home/End milik widget; panah atas/bawah dan Page tetap berpindah ruang', () => {
    const c = ctx({ roomkeys: 'horizontal' });
    assert.equal(roomKeyAction(key('ArrowRight'), c), null);
    assert.equal(roomKeyAction(key('ArrowLeft'), c), null);
    assert.equal(roomKeyAction(key('Home'), c), null);
    assert.equal(roomKeyAction(key('End'), c), null);
    assert.equal(roomKeyAction(key('ArrowDown'), c), 'next');
    assert.equal(roomKeyAction(key('ArrowUp'), c), 'prev');
    assert.equal(roomKeyAction(key('PageDown'), c), 'next');
    assert.equal(roomKeyAction(key('PageUp'), c), 'prev');
    assert.equal(roomKeyAction(key(' '), c), 'next');
  });

  it('"off" (radiogroup): semua panah dan Home/End milik widget; PageUp/PageDown tetap berpindah ruang', () => {
    const c = ctx({ roomkeys: 'off' });
    for (const k of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      assert.equal(roomKeyAction(key(k), c), null, k);
    }
    assert.equal(roomKeyAction(key('PageDown'), c), 'next');
    assert.equal(roomKeyAction(key('PageUp'), c), 'prev');
  });

  it('Spasi pada radio di dalam widget tetap milik radio itu', () => {
    assert.equal(roomKeyAction(key(' '), ctx({ roomkeys: 'off', interactive: true })), null);
  });

  it('nilai yang tidak dikenal diperlakukan seperti tanpa atribut', () => {
    const c = ctx({ roomkeys: 'sembarang' });
    assert.equal(roomKeyAction(key('ArrowRight'), c), 'next');
    assert.equal(roomKeyAction(key('ArrowDown'), c), 'next');
    assert.equal(roomKeyAction(key('Home'), c), 'first');
  });
});

describe('roomKeyAction: tidak merebut tombol yang bukan miliknya', () => {
  it('di dalam input/textarea/select semua tombol dilepas (kursor, pilihan teks)', () => {
    for (const k of NAV_KEYS) {
      assert.equal(roomKeyAction(key(k), ctx({ editable: true })), null, k);
      assert.equal(roomKeyAction(key(k, { ctrlKey: true }), ctx({ editable: true })), null, `Ctrl+${k}`);
    }
  });

  it('kombinasi Alt/Ctrl/Cmd dengan panah, Page, dan Spasi dibiarkan untuk browser (kembali, zoom, loncat kata)', () => {
    for (const k of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', ' ']) {
      assert.equal(roomKeyAction(key(k, { altKey: true }), ctx()), null, `Alt+${k}`);
      assert.equal(roomKeyAction(key(k, { ctrlKey: true }), ctx()), null, `Ctrl+${k}`);
      assert.equal(roomKeyAction(key(k, { metaKey: true }), ctx()), null, `Meta+${k}`);
    }
  });

  it('Ctrl/Cmd + Home/End berarti awal/akhir halaman: ruang pertama/terakhir; Alt + Home/End dibiarkan', () => {
    assert.equal(roomKeyAction(key('Home', { ctrlKey: true }), ctx()), 'first');
    assert.equal(roomKeyAction(key('End', { ctrlKey: true }), ctx()), 'last');
    assert.equal(roomKeyAction(key('Home', { metaKey: true }), ctx()), 'first');
    assert.equal(roomKeyAction(key('End', { metaKey: true }), ctx()), 'last');
    assert.equal(roomKeyAction(key('Home', { altKey: true }), ctx()), null);
    assert.equal(roomKeyAction(key('End', { altKey: true, ctrlKey: true }), ctx()), null);
    // widget yang memakai Home/End tetap memilikinya
    assert.equal(roomKeyAction(key('End', { ctrlKey: true }), ctx({ roomkeys: 'off' })), null);
  });

  it('tombol yang sudah ditangani pendengar lain (defaultPrevented) tidak ditangani dua kali', () => {
    for (const k of NAV_KEYS) {
      assert.equal(roomKeyAction(key(k, { defaultPrevented: true }), ctx()), null, k);
    }
    assert.equal(roomKeyAction(key('ArrowDown', { defaultPrevented: false }), ctx()), 'next');
  });
});
