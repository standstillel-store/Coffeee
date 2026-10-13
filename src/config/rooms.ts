import { motion, type PathConfig } from './motion';
import { products as defaultProducts, type Product } from './products';

/**
 * Susunan ruang dibangun dari data produk:
 *   ruang 1            : landing page
 *   ruang 2..n         : menu, dua produk per ruang
 *   ruang n+1          : detail produk, harga, pemesanan
 *   ruang n+2          : ulasan dan penutup
 * Dengan 10 produk ini menghasilkan 8 ruang.
 */

export type RoomKind = 'hero' | 'menu' | 'detail' | 'reviews';

export interface RoomDef {
  id: string;
  index: number;
  kind: RoomKind;
  /** Label lengkap (untuk pembaca layar dan navigasi). */
  label: string;
  /** Label singkat (untuk rel navigasi). */
  short: string;
  productIds: readonly string[];
  /** Posisi ruang pada jalur kamera, dalam fraksi viewport. */
  offset: { x: number; y: number };
  /** Pengali opacity saat ruang masih jauh di depan kamera (1 = tanpa redaman tambahan). */
  veil: number;
}

export const PRODUCTS_PER_ROOM = 2;

const pad = (n: number) => String(n).padStart(2, '0');

export function buildRooms(
  list: readonly Product[] = defaultProducts,
  path: PathConfig = motion.path,
): RoomDef[] {
  const rooms: RoomDef[] = [];
  rooms.push({
    id: 'hero',
    index: 0,
    kind: 'hero',
    label: 'Beranda',
    short: 'Beranda',
    productIds: [],
    offset: { x: 0, y: 0 },
    veil: 1,
  });

  const menuCount = Math.ceil(list.length / PRODUCTS_PER_ROOM);
  for (let k = 0; k < menuCount; k++) {
    const chunk = list.slice(k * PRODUCTS_PER_ROOM, (k + 1) * PRODUCTS_PER_ROOM);
    const first = k * PRODUCTS_PER_ROOM + 1;
    const last = first + chunk.length - 1;
    const range = first === last ? pad(first) : `${pad(first)}–${pad(last)}`;
    const dir = k % 2 === 0 ? 1 : -1;
    rooms.push({
      id: `menu-${k + 1}`,
      index: rooms.length,
      kind: 'menu',
      label: `Menu ${range}`,
      short: range,
      productIds: chunk.map((p) => p.id),
      offset: { x: dir * path.zigzag, y: -dir * path.lift },
      // Sampul (landing) dijaga tetap bersih: ruang menu pertama baru "menyala" saat kamera mendekat.
      veil: k === 0 ? motion.pose.ahead.veil.afterHero : 1,
    });
  }

  rooms.push({
    id: 'detail',
    index: rooms.length,
    kind: 'detail',
    label: 'Detail, harga, dan pemesanan',
    short: 'Detail',
    productIds: [],
    offset: { x: 0, y: 0 },
    veil: motion.pose.ahead.veil.detail,
  });
  rooms.push({
    id: 'reviews',
    index: rooms.length,
    kind: 'reviews',
    label: 'Ulasan dan penutup',
    short: 'Ulasan',
    productIds: [],
    offset: { x: 0, y: 0 },
    veil: motion.pose.ahead.veil.reviews,
  });
  return rooms;
}

export const rooms: readonly RoomDef[] = buildRooms();

export function roomIndexOf(kind: RoomKind, list: readonly RoomDef[] = rooms): number {
  return list.findIndex((r) => r.kind === kind);
}
