import type { Product } from '../config/products';
import type { RoomDef } from '../config/rooms';
import { pad2 } from '../lib/money';
import { ProductCard } from './ProductCard';

interface Props {
  room: RoomDef;
  /** Produk milik ruang ini (biasanya dua). */
  items: readonly Product[];
  /** Nomor tampil produk pertama di ruang ini (1-based). */
  startNumber: number;
  /** Jumlah seluruh produk, untuk teks bantu. */
  total: number;
  onSelect: (id: string) => void;
}

/**
 * Satu ruang menu = satu pasang kartu portrait dua kolom.
 * Tata letak sengaja bertingkat (kartu kiri lebih rendah) supaya ada ruang
 * kosong untuk judul dan teks bantu tanpa menambah kotak atau garis.
 */
export function ProductGrid({ room, items, startNumber, total, onSelect }: Props) {
  return (
    <div className="menu" data-flip={room.index % 2 === 0 ? 'true' : 'false'}>
      <header className="menu__head leaf">
        <p className="menu__kicker">
          Ruang {pad2(room.index + 1)}
        </p>
        <h2 className="menu__title">
          Menu <span className="menu__range">{room.short}</span>
        </h2>
      </header>

      <div className="menu__pair">
        {items.map((product, k) => (
          <div className={`menu__slot menu__slot--${k === 0 ? 'a' : 'b'} leaf`} key={product.id}>
            <ProductCard product={product} number={startNumber + k} onSelect={onSelect} />
          </div>
        ))}
      </div>

      <p className="menu__hint leaf">
        {pad2(startNumber)}–{pad2(startNumber + items.length - 1)} dari {pad2(total)}. Pilih satu minuman
        untuk melihat detail dan harga.
      </p>
    </div>
  );
}
