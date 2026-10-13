/**
 * Ulasan CONTOH. Belum ada ulasan pelanggan nyata, jadi seluruh kartu
 * diberi label demo dan tidak boleh dipresentasikan sebagai data sungguhan.
 * Saat ulasan nyata tersedia: ganti isi `reviews` dan ubah `reviewsAreDemo`
 * menjadi false.
 */
export const reviewsAreDemo = true;

export interface Review {
  id: string;
  /** Nama contoh pelanggan. */
  name: string;
  /** 1..5 */
  rating: number;
  text: string;
  /** Nama menu yang dibicarakan. */
  item: string;
}

export const reviews: readonly Review[] = [
  {
    id: 'r1',
    name: 'Rani',
    rating: 5,
    text: 'Pusaran susunya cantik dan rasanya seimbang: manis gula aren tidak menutup pahit espresso.',
    item: 'Kopi Susu Gula Aren',
  },
  {
    id: 'r2',
    name: 'Bima',
    rating: 4,
    text: 'Flat white-nya halus, busanya tipis. Pas dibawa jalan di pagi hari.',
    item: 'Flat White',
  },
  {
    id: 'r3',
    name: 'Dewi',
    rating: 5,
    text: 'Cold brew yang bersih. Tidak asam, pahitnya lembut sampai tegukan terakhir.',
    item: 'Cold Brew',
  },
  {
    id: 'r4',
    name: 'Arga',
    rating: 5,
    text: 'Lapisannya rapi. Saya sengaja tidak mengaduknya di awal, dan memang berubah di tiap tegukan.',
    item: 'Caramel Macchiato',
  },
  {
    id: 'r5',
    name: 'Nadia',
    rating: 4,
    text: 'Enak untuk berbagi. Setiap gelas punya karakter sendiri, jadi bahan obrolan juga.',
    item: 'Tasting Flight',
  },
  {
    id: 'r6',
    name: 'Fajar',
    rating: 5,
    text: 'Pekat tapi tidak enek. Cokelatnya terasa jujur dan tidak menutupi kopinya.',
    item: 'Mocha Swirl',
  },
  {
    id: 'r7',
    name: 'Salsa',
    rating: 4,
    text: 'Busa tipis di atasnya menyenangkan. Manisnya pas, tidak berlebihan.',
    item: 'Brown Sugar Latte',
  },
  {
    id: 'r8',
    name: 'Yoga',
    rating: 5,
    text: 'Cocok untuk sore hari. Krimnya lembut dan karamelnya tidak lengket di gelas.',
    item: 'Caramel Cream',
  },
];
