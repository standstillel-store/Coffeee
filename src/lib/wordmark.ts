/**
 * Membagi nama brand menjadi dua bagian untuk layout hero: bagian kiri dan
 * kanan cangkir. "Ambang" -> ["AMB", "ANG"]. Nama dengan jumlah huruf ganjil
 * memberi bagian kiri satu huruf lebih banyak.
 */
export function splitWordmark(name: string): [string, string] {
  const chars = Array.from(name.trim().toUpperCase());
  const mid = Math.ceil(chars.length / 2);
  return [chars.slice(0, mid).join(''), chars.slice(mid).join('')];
}
