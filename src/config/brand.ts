/**
 * Identitas dan teks utama situs.
 *
 * SEMUA nilai di sini adalah placeholder demo. "Ambang" bukan merek nyata;
 * ganti nama, headline, dan deskripsi sesuai coffee house sebenarnya.
 */
export const brand = {
  name: 'Ambang',
  descriptor: 'Coffee House',
  headline: 'Lima ruang, sepuluh seduhan.',
  description: 'Menu kami disajikan berpasangan, ruang demi ruang. Gulir untuk melangkah masuk.',
  scrollCue: 'Gulir untuk masuk',
  heroAlt: 'Segelas kopi susu karamel dingin dalam gelas bening berisi es batu.',
  /** Gambar utama landing page (potongan transparan dari foto yang Anda berikan). */
  heroImage: 'images/coffee-hero.png',
  closing: {
    title: 'Sampai jumpa di ambang pintu.',
    restart: 'Kembali ke awal',
  },
  /** Ditampilkan di ruang ulasan/penutup dan pada pratinjau pesanan. */
  demoNotice: 'Situs demo. Nama, menu, harga, dan ulasan di sini hanyalah contoh, bukan toko atau pelanggan sungguhan.',
  locale: 'id-ID',
  currency: 'IDR',
} as const;

export type Brand = typeof brand;
