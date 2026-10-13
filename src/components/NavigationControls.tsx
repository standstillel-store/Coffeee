import { brand } from '../config/brand';
import { useRoomNav } from '../context/room';
import { pad2 } from '../lib/money';

/**
 * Kontrol navigasi yang menetap di atas panggung:
 *  - merek (kembali ke awal)
 *  - rel ruang di tepi kanan (lompat ke ruang mana pun)
 *  - tombol Kembali/Lanjut dan penghitung ruang di bawah
 * Semua dapat dipakai dengan sentuh dan keyboard; tidak ada yang bergantung pada hover.
 */
export function NavigationControls() {
  const { rooms, active, count, travelTo, next, prev } = useRoomNav();
  const room = rooms[active];

  return (
    <nav className="hud" aria-label="Navigasi ruang" data-room={room?.kind ?? 'hero'}>
      <button type="button" className="hud__brand" onClick={() => travelTo(0)} aria-label={`${brand.name}, kembali ke awal`}>
        <span className="hud__brand-name">{brand.name}</span>
        <span className="hud__brand-sub">{brand.descriptor}</span>
      </button>

      <ol className="hud__rail">
        {rooms.map((r, i) => (
          <li key={r.id}>
            <button
              type="button"
              className="hud__tick"
              aria-label={`Ruang ${i + 1}: ${r.label}`}
              aria-current={i === active ? 'step' : undefined}
              data-on={i === active ? 'true' : 'false'}
              onClick={() => travelTo(i)}
            >
              <span className="hud__tick-label" aria-hidden="true">
                {r.short}
              </span>
              <span className="hud__tick-mark" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>

      <div className="hud__bar">
        <button type="button" className="hud__btn" onClick={prev} disabled={active <= 0}>
          <span aria-hidden="true">←</span> Kembali
        </button>
        <p className="hud__count">
          <span className="hud__num">
            {pad2(active + 1)}
            <i> / </i>
            {pad2(count)}
          </span>
          <span className="hud__label">{room?.short}</span>
        </p>
        <button type="button" className="hud__btn" onClick={next} disabled={active >= count - 1}>
          Lanjut <span aria-hidden="true">→</span>
        </button>
      </div>
    </nav>
  );
}
