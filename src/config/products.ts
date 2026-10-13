/**
 * Satu-satunya tempat data produk.
 *
 * - Foto: letakkan file di public/images/ lalu ubah `image` di bawah. Nama
 *   default (product-01.jpg ... product-10.jpg) sengaja mengikuti urutan menu.
 * - Jumlah ruang menu mengikuti jumlah produk (dua produk per ruang), jadi
 *   menambah atau mengurangi produk tidak memerlukan perubahan komponen.
 * - Semua nama, harga, dan deskripsi adalah DATA DEMO.
 */

export type Category = 'signature' | 'susu' | 'hitam' | 'panas' | 'sampler';

export const categoryLabels: Record<Category, string> = {
  signature: 'Signature',
  susu: 'Susu',
  hitam: 'Hitam',
  panas: 'Panas',
  sampler: 'Sampler',
};

export interface OptionChoice {
  id: string;
  label: string;
  /** Selisih harga dalam rupiah terhadap harga dasar. */
  priceDelta: number;
}

export interface OptionGroup {
  id: string;
  label: string;
  choices: readonly OptionChoice[];
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  description: string;
  /** Catatan rasa singkat, ditampilkan di ruang detail. */
  notes: readonly string[];
  /** Harga dasar dalam rupiah (bilangan bulat). */
  price: number;
  /** Path relatif terhadap index.html, mis. "images/product-01.jpg". */
  image: string;
  imageAlt: string;
  /**
   * Titik fokus pemotongan (object-position, persen). Foto sumber memiliki
   * rasio berbeda-beda; kartu memakai rasio tetap 3:4 sehingga sebagian tepi
   * terpotong. Atur ini agar bagian terpenting tetap terlihat.
   */
  focus: { x: number; y: number };
  /**
   * 0..1. Seberapa kuat latar terang foto dihangatkan (multiply krem) agar
   * tidak menjadi persegi putih di ruang gelap. 0 = foto apa adanya.
   */
  tint: number;
  options: readonly OptionGroup[];
}

const size = (large: number, small = '12 oz', big = '16 oz'): OptionGroup => ({
  id: 'ukuran',
  label: 'Ukuran',
  choices: [
    { id: 'reguler', label: `Reguler ${small}`, priceDelta: 0 },
    { id: 'large', label: `Large ${big}`, priceDelta: large },
  ],
});

const milk: OptionGroup = {
  id: 'susu',
  label: 'Susu',
  choices: [
    { id: 'sapi', label: 'Susu sapi', priceDelta: 0 },
    { id: 'oat', label: 'Oat', priceDelta: 8000 },
  ],
};

const sweet: OptionGroup = {
  id: 'manis',
  label: 'Manis',
  choices: [
    { id: 'normal', label: 'Normal', priceDelta: 0 },
    { id: 'kurang', label: 'Kurang', priceDelta: 0 },
    { id: 'tanpa', label: 'Tanpa gula', priceDelta: 0 },
  ],
};

export const products: readonly Product[] = [
  {
    id: 'mocha-swirl',
    name: 'Mocha Swirl',
    category: 'signature',
    description:
      'Espresso dan susu dingin dengan pusaran saus cokelat pekat. Manisnya dalam, pahitnya tetap terasa.',
    notes: ['Cokelat pekat', 'Susu dingin', 'Espresso'],
    price: 38000,
    image: 'images/product-01.jpg',
    imageAlt: 'Kopi es cokelat dengan percikan susu dan pusaran saus cokelat di sekeliling gelas.',
    focus: { x: 50, y: 52 },
    tint: 0.55,
    options: [size(6000), milk, sweet],
  },
  {
    id: 'kopi-susu-gula-aren',
    name: 'Kopi Susu Gula Aren',
    category: 'susu',
    description:
      'Susu dituang pelan ke atas es dan espresso, membentuk pusaran krem. Gula aren memberi manis yang bulat.',
    notes: ['Gula aren', 'Susu', 'Espresso'],
    price: 32000,
    image: 'images/product-02.jpg',
    imageAlt: 'Susu dituang ke gelas tinggi berisi kopi dan es batu, membentuk pusaran krem.',
    focus: { x: 50, y: 56 },
    tint: 0,
    options: [size(6000), milk, sweet],
  },
  {
    id: 'noir-latte',
    name: 'Noir Latte',
    category: 'signature',
    description:
      'Latte dingin berwarna gelap: espresso yang kuat, susu secukupnya, dan es batu besar yang mencair lambat.',
    notes: ['Espresso kuat', 'Susu', 'Es batu besar'],
    price: 36000,
    image: 'images/product-03.jpg',
    imageAlt: 'Gelas bertutup bening melayang dengan percikan kopi susu dan biji kopi di latar gelap.',
    focus: { x: 50, y: 50 },
    tint: 0,
    options: [size(6000), milk, sweet],
  },
  {
    id: 'caramel-macchiato',
    name: 'Caramel Macchiato',
    category: 'susu',
    description:
      'Susu, espresso, dan karamel disusun berlapis. Jangan diaduk dulu; rasanya berubah di setiap tegukan.',
    notes: ['Karamel', 'Susu', 'Espresso'],
    price: 40000,
    image: 'images/product-04.jpg',
    imageAlt: 'Gelas bening berisi kopi es berlapis karamel dan susu, dengan biji kopi di atas meja.',
    focus: { x: 52, y: 50 },
    tint: 0.18,
    options: [size(6000), milk, sweet],
  },
  {
    id: 'flat-white',
    name: 'Flat White',
    category: 'panas',
    description:
      'Espresso ganda dengan susu mikro-foam yang halus. Panas dalam cangkir kertas, siap dibawa jalan.',
    notes: ['Espresso ganda', 'Mikro-foam', 'Hangat'],
    price: 34000,
    image: 'images/product-05.jpg',
    imageAlt: "Cangkir kertas hitam berlabel 'COFFEE' dengan uap tipis di atas meja kayu sebuah kafe.",
    focus: { x: 50, y: 60 },
    tint: 0,
    options: [size(5000, '8 oz', '12 oz'), milk],
  },
  {
    id: 'spanish-latte',
    name: 'Spanish Latte',
    category: 'susu',
    description:
      'Espresso dan susu kental manis di atas es. Manisnya pekat, dengan nada karamel yang lembut di ujung.',
    notes: ['Susu kental manis', 'Espresso', 'Karamel'],
    price: 38000,
    image: 'images/product-06.jpg',
    imageAlt: 'Kopi es berlapis, gelap di bawah dan krem di atas, dengan biji kopi dan percikan karamel melayang.',
    focus: { x: 50, y: 56 },
    tint: 0.18,
    options: [size(6000), milk, sweet],
  },
  {
    id: 'tasting-flight',
    name: 'Tasting Flight',
    category: 'sampler',
    description:
      'Lima gelas kecil kopi dingin dari menu kami dalam satu sajian, untuk dicicipi berdua atau bertiga.',
    notes: ['Lima gelas', 'Pilihan barista', 'Untuk berbagi'],
    price: 95000,
    image: 'images/product-07.jpg',
    imageAlt: 'Lima gelas kopi es dengan isi berbeda disusun dalam satu komposisi di latar putih.',
    focus: { x: 50, y: 70 },
    tint: 0.55,
    options: [
      {
        id: 'porsi',
        label: 'Porsi',
        choices: [
          { id: 'berdua', label: 'Berdua · 5 × 100 ml', priceDelta: 0 },
          { id: 'bertiga', label: 'Bertiga · 5 × 150 ml', priceDelta: 20000 },
        ],
      },
    ],
  },
  {
    id: 'cold-brew',
    name: 'Cold Brew',
    category: 'hitam',
    description:
      'Kopi yang diseduh dingin berjam-jam. Bersih, pahit yang lembut, tanpa susu dan tanpa tambahan gula.',
    notes: ['Pahit lembut', 'Bersih', 'Tanpa gula'],
    price: 30000,
    image: 'images/product-08.jpg',
    imageAlt: 'Segelas kopi hitam dingin dengan es batu dalam gelas plastik bening.',
    focus: { x: 50, y: 46 },
    tint: 0.4,
    options: [size(6000)],
  },
  {
    id: 'caramel-cream',
    name: 'Caramel Cream',
    category: 'signature',
    description:
      'Kopi dingin dengan krim kocok dan saus karamel di atasnya, disajikan di atas alas kayu.',
    notes: ['Krim kocok', 'Karamel', 'Kopi dingin'],
    price: 42000,
    image: 'images/product-09.jpg',
    imageAlt: 'Gelas kopi es dengan krim kocok, saus karamel, dan sedotan di atas alas kayu.',
    focus: { x: 50, y: 50 },
    tint: 0,
    options: [size(6000), milk, sweet],
  },
  {
    id: 'brown-sugar-latte',
    name: 'Brown Sugar Latte',
    category: 'susu',
    description:
      'Latte dingin dengan sirup gula cokelat yang dikocok bersama espresso sampai berbusa tipis.',
    notes: ['Gula cokelat', 'Susu', 'Espresso'],
    price: 36000,
    image: 'images/product-10.jpg',
    imageAlt: 'Kopi susu es dengan percikan dan sepotong es batu besar di latar cokelat.',
    focus: { x: 50, y: 48 },
    tint: 0,
    options: [size(6000), milk, sweet],
  },
];

export function findProduct(id: string, list: readonly Product[] = products): Product | undefined {
  return list.find((p) => p.id === id);
}
