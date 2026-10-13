import { categoryLabels, type Product } from '../config/products';
import { cssVars } from '../lib/css';
import { formatIDR, pad2 } from '../lib/money';

interface Props {
  product: Product;
  /** Nomor tampil (1-based) di seluruh menu. */
  number: number;
  onSelect: (id: string) => void;
}

/**
 * Kartu portrait (rasio 3:4). Seluruh kartu adalah satu tombol sehingga
 * area sentuh besar dan tidak bergantung pada hover.
 */
export function ProductCard({ product, number, onSelect }: Props) {
  const { id, name, category, price, image, imageAlt, focus, tint } = product;

  return (
    <article
      className="card"
      style={cssVars({ '--fx': `${focus.x}%`, '--fy': `${focus.y}%`, '--tint': tint })}
    >
      <button
        type="button"
        className="card__button"
        onClick={() => onSelect(id)}
        aria-label={`${name}, ${categoryLabels[category]}, ${formatIDR(price)}. Lihat detail`}
      >
        <span className="card__frame">
          <img className="card__img" src={image} alt={imageAlt} decoding="async" draggable={false} />
          <span className="card__tint" aria-hidden="true" />
          <span className="card__light" aria-hidden="true" />
        </span>
        <span className="card__meta" aria-hidden="true">
          <span className="card__row">
            <span className="card__no">{pad2(number)}</span>
            <span className="card__cat">{categoryLabels[category]}</span>
          </span>
          <span className="card__name">{name}</span>
          <span className="card__row">
            <span className="card__price">{formatIDR(price)}</span>
            <span className="card__more">Lihat detail →</span>
          </span>
        </span>
      </button>
    </article>
  );
}
