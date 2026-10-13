import type { Product } from '../config/products';

/**
 * Logika harga dan ringkasan pesanan DEMO. Tidak ada pesanan yang dikirim ke
 * mana pun; fungsi ini hanya menghitung apa yang ditampilkan di pratinjau.
 */

/** groupId -> choiceId */
export type Selection = Record<string, string>;

export const MAX_QTY = 20;

export function defaultSelection(product: Product): Selection {
  const sel: Selection = {};
  for (const group of product.options) {
    const first = group.choices[0];
    if (first) sel[group.id] = first.id;
  }
  return sel;
}

/** Pilihan yang tidak dikenal diganti ke pilihan pertama grupnya. */
export function normalizeSelection(product: Product, sel: Selection): Selection {
  const out: Selection = {};
  for (const group of product.options) {
    const wanted = sel[group.id];
    const found = group.choices.find((c) => c.id === wanted) ?? group.choices[0];
    if (found) out[group.id] = found.id;
  }
  return out;
}

export function unitPrice(product: Product, sel: Selection): number {
  const s = normalizeSelection(product, sel);
  let total = product.price;
  for (const group of product.options) {
    const choice = group.choices.find((c) => c.id === s[group.id]);
    if (choice) total += choice.priceDelta;
  }
  return total;
}

export function clampQty(qty: number): number {
  if (!Number.isFinite(qty)) return 1;
  return Math.min(MAX_QTY, Math.max(1, Math.round(qty)));
}

export function lineTotal(product: Product, sel: Selection, qty: number): number {
  return unitPrice(product, sel) * clampQty(qty);
}

/** Label pilihan yang dipilih, mis. ["Large 16 oz", "Oat", "Normal"]. */
export function selectionLabels(product: Product, sel: Selection): string[] {
  const s = normalizeSelection(product, sel);
  const labels: string[] = [];
  for (const group of product.options) {
    const choice = group.choices.find((c) => c.id === s[group.id]);
    if (choice) labels.push(choice.label);
  }
  return labels;
}
