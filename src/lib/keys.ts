/**
 * Pemetaan tombol keyboard ke navigasi ruang. Murni dan mudah diuji.
 *
 * Widget komposit yang memakai tombol panah sendiri menandai dirinya dengan atribut:
 *   data-roomkeys="off"        -> widget memakai SEMUA panah dan Home/End (mis. radiogroup)
 *   data-roomkeys="horizontal" -> widget memakai panah kiri/kanan dan Home/End (mis. karusel);
 *                                 panah atas/bawah tetap berpindah ruang
 * PageUp/PageDown tidak pernah dipakai widget, jadi selalu berpindah ruang.
 */

export type RoomKeyAction = 'next' | 'prev' | 'first' | 'last';

export interface KeyLike {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  /** true bila pendengar lain sudah menangani tombol ini (mis. widget yang memakai panah). */
  defaultPrevented?: boolean;
}

export interface KeyContext {
  /** Fokus ada di input/textarea/select/contenteditable. */
  editable: boolean;
  /** Fokus ada di elemen yang memakai Spasi/Enter sendiri (tombol, tautan, ...). */
  interactive: boolean;
  /** Nilai atribut data-roomkeys terdekat, jika ada. */
  roomkeys: string | null;
}

export function roomKeyAction(e: KeyLike, ctx: KeyContext): RoomKeyAction | null {
  if (e.defaultPrevented) return null;
  if (ctx.editable) return null;

  // Alt, Ctrl, dan Cmd milik browser/OS (kembali, zoom, loncat kata, ...). Satu pengecualian:
  // Ctrl/Cmd + Home/End berarti "awal/akhir halaman" di mana-mana, yang di sini adalah ruang pertama/terakhir.
  const homeEnd = e.key === 'Home' || e.key === 'End';
  if (e.altKey || ((e.ctrlKey || e.metaKey) && !homeEnd)) return null;

  const widgetOwnsVertical = ctx.roomkeys === 'off';
  const widgetOwnsHorizontal = ctx.roomkeys === 'off' || ctx.roomkeys === 'horizontal';
  const widgetOwnsHomeEnd = widgetOwnsHorizontal;

  switch (e.key) {
    case 'ArrowDown':
      return widgetOwnsVertical ? null : 'next';
    case 'ArrowUp':
      return widgetOwnsVertical ? null : 'prev';
    case 'PageDown':
      return 'next';
    case 'PageUp':
      return 'prev';
    case ' ':
    case 'Spacebar':
      return ctx.interactive ? null : e.shiftKey ? 'prev' : 'next';
    case 'Home':
      return widgetOwnsHomeEnd ? null : 'first';
    case 'End':
      return widgetOwnsHomeEnd ? null : 'last';
    case 'ArrowRight':
      return widgetOwnsHorizontal ? null : 'next';
    case 'ArrowLeft':
      return widgetOwnsHorizontal ? null : 'prev';
    default:
      return null;
  }
}

/** Membaca konteks dari elemen target event (hanya dipakai di browser). */
export function keyContextFrom(target: EventTarget | null): KeyContext {
  const el = target instanceof Element ? target : null;
  if (!el) return { editable: false, interactive: false, roomkeys: null };
  const editable = !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  const interactive = !!el.closest('button, a[href], summary, [role="button"], [role="radio"], [role="tab"]');
  const marked = el.closest('[data-roomkeys]');
  return { editable, interactive, roomkeys: marked?.getAttribute('data-roomkeys') ?? null };
}
