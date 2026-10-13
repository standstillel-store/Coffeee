import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { categoryLabels, type OptionGroup, type Product } from '../config/products';
import { cssVars } from '../lib/css';
import { formatIDR, pad2 } from '../lib/money';
import {
  MAX_QTY,
  clampQty,
  defaultSelection,
  lineTotal,
  selectionLabels,
  unitPrice,
  type Selection,
} from '../lib/order';

interface Props {
  products: readonly Product[];
  selectedId: string;
  onSelectId: (id: string) => void;
}

interface Draft {
  selection: Selection;
  qty: number;
}

interface Preview {
  productId: string;
  name: string;
  labels: string[];
  qty: number;
  total: number;
}

/** Pindahkan fokus/pilihan dengan panah di dalam radiogroup (roving tabindex). */
function arrowNavigate(e: KeyboardEvent<HTMLElement>, count: number, index: number, pick: (i: number) => void) {
  let next = index;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % count;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + count) % count;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = count - 1;
  else return;
  e.preventDefault();
  e.stopPropagation();
  pick(next);
  const group = e.currentTarget.parentElement;
  const target = group?.querySelectorAll<HTMLElement>('[role="radio"]')[next];
  target?.focus();
}

function OptionRow({
  group,
  value,
  onChange,
}: {
  group: OptionGroup;
  value: string | undefined;
  onChange: (choiceId: string) => void;
}) {
  const labelId = useId();
  return (
    <div className="opt" role="radiogroup" aria-labelledby={labelId} data-roomkeys="off">
      <span className="opt__label" id={labelId}>
        {group.label}
      </span>
      <div className="opt__choices">
        {group.choices.map((choice, i) => {
          const on = choice.id === value;
          return (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className="opt__choice"
              data-on={on ? 'true' : 'false'}
              onClick={() => onChange(choice.id)}
              onKeyDown={(e) => arrowNavigate(e, group.choices.length, i, (n) => onChange(group.choices[n]!.id))}
            >
              {choice.label}
              {choice.priceDelta > 0 ? <small>+{formatIDR(choice.priceDelta)}</small> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Ruang 7: detail produk. Foto besar, nama, deskripsi, harga, pilihan ukuran/
 * varian, dan tombol pesan DEMO. Tidak ada pesanan yang dikirim ke mana pun.
 */
export function ProductDetail({ products, selectedId, onSelectId }: Props) {
  const product = products.find((p) => p.id === selectedId) ?? products[0]!;
  const index = products.findIndex((p) => p.id === product.id);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [preview, setPreview] = useState<Preview | null>(null);

  const draft: Draft = drafts[product.id] ?? { selection: defaultSelection(product), qty: 1 };
  const total = lineTotal(product, draft.selection, draft.qty);
  const unit = unitPrice(product, draft.selection);

  const update = (patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [product.id]: { ...draft, ...patch } }));
    // Pratinjau lama tidak lagi sesuai dengan pilihan baru.
    setPreview(null);
  };

  // Ganti produk -> pratinjau pesanan sebelumnya dihapus.
  useEffect(() => setPreview(null), [selectedId]);

  /* Dua lapis foto agar pergantian produk terasa sebagai gerak kedalaman, bukan lompatan. */
  const [shownId, setShownId] = useState(product.id);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (product.id === shownId) return;
    setLeavingId(shownId);
    setShownId(product.id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLeavingId(null), 700);
  }, [product.id, shownId]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  /* Di ponsel deretan thumbnail dapat digeser mendatar: bawa yang terpilih ke tengah.
     Digeser lewat scrollLeft (bukan scrollIntoView) agar tidak menggeser halaman/kamera. */
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth + 1) return;
    const item = rail.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!item) return;
    rail.scrollTo({ left: item.offsetLeft - (rail.clientWidth - item.offsetWidth) / 2, behavior: 'auto' });
  }, [product.id]);

  const layers = useMemo(
    () => [leavingId, shownId].filter((id): id is string => !!id).map((id) => products.find((p) => p.id === id)!),
    [leavingId, shownId, products],
  );

  const order = () => {
    setPreview({
      productId: product.id,
      name: product.name,
      labels: selectionLabels(product, draft.selection),
      qty: clampQty(draft.qty),
      total,
    });
  };

  const inPreview = preview?.productId === product.id;

  return (
    <div
      className="detail"
      data-preview={inPreview ? 'true' : 'false'}
      style={cssVars({ '--fx': `${product.focus.x}%`, '--fy': `${product.focus.y}%` })}
    >
      <div className="detail__rail leaf" ref={railRef} role="radiogroup" aria-label="Pilih minuman" data-roomkeys="off">
        {products.map((p, i) => {
          const on = p.id === product.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${p.name}, ${formatIDR(p.price)}`}
              tabIndex={on ? 0 : -1}
              className="rail__item"
              data-on={on ? 'true' : 'false'}
              style={cssVars({ '--fx': `${p.focus.x}%`, '--fy': `${p.focus.y}%` })}
              onClick={() => onSelectId(p.id)}
              onKeyDown={(e) => arrowNavigate(e, products.length, i, (n) => onSelectId(products[n]!.id))}
            >
              <img src={p.image} alt="" decoding="async" draggable={false} />
            </button>
          );
        })}
      </div>

      <figure className="detail__photo leaf">
        <div className="detail__frame">
          {layers.map((p) => (
            <div
              key={p.id}
              className={`detail__layer detail__layer--${p.id === shownId ? 'in' : 'out'}`}
              style={cssVars({ '--fx': `${p.focus.x}%`, '--fy': `${p.focus.y}%`, '--tint': p.tint })}
            >
              <img src={p.image} alt={p.id === shownId ? p.imageAlt : ''} decoding="async" draggable={false} />
              <span className="detail__tint" aria-hidden="true" />
            </div>
          ))}
          <span className="detail__light" aria-hidden="true" />
        </div>
      </figure>

      <div className="detail__info">
        <div className="detail__head leaf">
          <p className="detail__kicker">
            <span>{categoryLabels[product.category]}</span>
            <span className="detail__count">
              {pad2(index + 1)} / {pad2(products.length)}
            </span>
          </p>

          <div className="detail__swap" key={`${product.id}-name`}>
            <h2 className="detail__name">{product.name}</h2>
          </div>

          <p className="price" aria-live="polite">
            <span className="sr-only">Harga </span>
            <span className="price__value">{formatIDR(total)}</span>
            {draft.qty > 1 ? (
              <span className="price__label">
                {draft.qty} × {formatIDR(unit)}
              </span>
            ) : null}
          </p>

          <div className="detail__swap" key={`${product.id}-text`}>
            <p className="detail__desc">{product.description}</p>
            <ul className="detail__notes" aria-label="Catatan rasa">
              {product.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="detail__controls leaf">
          <div className="detail__options">
            {product.options.map((group) => (
              <OptionRow
                key={group.id}
                group={group}
                value={draft.selection[group.id]}
                onChange={(choiceId) => update({ selection: { ...draft.selection, [group.id]: choiceId } })}
              />
            ))}
          </div>

          <div className="detail__buy">
            <div className="qty" role="group" aria-label="Jumlah">
              <button
                type="button"
                className="qty__btn"
                aria-label="Kurangi jumlah"
                disabled={draft.qty <= 1}
                onClick={() => update({ qty: clampQty(draft.qty - 1) })}
              >
                −
              </button>
              <output className="qty__value" aria-live="polite">
                {draft.qty}
              </output>
              <button
                type="button"
                className="qty__btn"
                aria-label="Tambah jumlah"
                disabled={draft.qty >= MAX_QTY}
                onClick={() => update({ qty: clampQty(draft.qty + 1) })}
              >
                +
              </button>
            </div>

            <button
              type="button"
              className="order"
              data-state={inPreview ? 'done' : 'idle'}
              aria-disabled={inPreview}
              onClick={() => {
                if (!inPreview) order();
              }}
            >
              <span className="order__fill" aria-hidden="true" />
              <span className="order__label">{inPreview ? 'Pratinjau siap' : 'Pesan (demo)'}</span>
            </button>
          </div>

          <div className="detail__status" role="status" aria-live="polite">
            {preview && inPreview ? (
              <div className="preview">
                <p className="preview__title">Pratinjau pesanan · demo</p>
                <p className="preview__line">
                  {preview.qty} × {preview.name}
                  <span> · {preview.labels.join(' · ')}</span>
                </p>
                <p className="preview__line preview__line--total">
                  Total <strong>{formatIDR(preview.total)}</strong>
                </p>
                <p className="preview__note">
                  Ini hanya tampilan demo. Tidak ada pesanan yang dikirim atau dibayar.{' '}
                  <button type="button" className="preview__clear" onClick={() => setPreview(null)}>
                    Hapus pratinjau
                  </button>
                </p>
              </div>
            ) : (
              <p className="detail__demo">Tombol pesan bersifat demo: belum terhubung ke sistem pemesanan atau pembayaran.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
