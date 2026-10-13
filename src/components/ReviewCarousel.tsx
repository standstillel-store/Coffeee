import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Review } from '../config/reviews';
import { clamp } from '../lib/camera';
import { pad2 } from '../lib/money';

interface Props {
  reviews: readonly Review[];
  /** true bila seluruh ulasan adalah contoh (belum ada ulasan nyata). */
  demo: boolean;
  reducedMotion: boolean;
  /** Kartu yang dipusatkan saat pertama tampil. */
  startIndex?: number;
}

function Stars({ value, demo }: { value: number; demo: boolean }) {
  return (
    <span className="stars" role="img" aria-label={`Rating ${value} dari 5${demo ? ' (contoh)' : ''}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" className="stars__star" data-on={i < value ? 'true' : 'false'} aria-hidden="true">
          <polygon points="12,2.2 15.1,8.6 22.2,9.6 17,14.6 18.3,21.7 12,18.3 5.7,21.7 7,14.6 1.8,9.6 8.9,8.6" />
        </svg>
      ))}
    </span>
  );
}

/**
 * Kartu ulasan yang dapat digeser. Kartu terdekat dengan titik tengah adalah
 * fokus; kartu di tepi memudar dan sedikit buram. Geser dengan sentuh (native),
 * seret mouse, tombol, atau panah keyboard.
 */
export function ReviewCarousel({ reviews, demo, reducedMotion, startIndex = 2 }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const drag = useRef<{ x: number; left: number; id: number; moved: boolean } | null>(null);
  const [current, setCurrent] = useState(() => clamp(startIndex, 0, Math.max(0, reviews.length - 1)));

  const offsetFor = useCallback((index: number): number => {
    const track = trackRef.current;
    const card = track?.children[index] as HTMLElement | undefined;
    if (!track || !card) return 0;
    return card.offsetLeft + card.offsetWidth / 2 - track.clientWidth / 2;
  }, []);

  const measure = useCallback(() => {
    raf.current = 0;
    const track = trackRef.current;
    if (!track) return;
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < track.children.length; i++) {
      const el = track.children[i] as HTMLElement;
      const dist = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
      const f = clamp(1 - dist / (el.offsetWidth * 1.35), 0, 1);
      el.style.setProperty('--f', f.toFixed(3));
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    setCurrent((prev) => (prev === best ? prev : best));
  }, []);

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(measure);
  }, [measure]);

  const scrollToIndex = useCallback(
    (index: number, smooth: boolean) => {
      const track = trackRef.current;
      if (!track) return;
      const i = clamp(index, 0, reviews.length - 1);
      track.scrollTo({ left: offsetFor(i), behavior: smooth && !reducedMotion ? 'smooth' : 'instant' });
    },
    [offsetFor, reducedMotion, reviews.length],
  );

  // Posisi awal + pengukuran ulang saat ukuran berubah.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    scrollToIndex(current, false);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      scrollToIndex(current, false);
      measure();
    }) : null;
    ro?.observe(track);
    return () => ro?.disconnect();
    // `current` sengaja tidak menjadi dependensi: hanya posisi awal yang dipulihkan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const go = (delta: number) => scrollToIndex(current + delta, true);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      scrollToIndex(0, true);
    } else if (e.key === 'End') {
      e.preventDefault();
      scrollToIndex(reviews.length - 1, true);
    }
  };

  /* Seret dengan mouse (sentuh sudah ditangani scroll native). */
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;
    drag.current = { x: e.clientX, left: track.scrollLeft, id: e.pointerId, moved: false };
    track.setPointerCapture(e.pointerId);
    track.classList.add('is-dragging');
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const track = trackRef.current;
    if (!d || !track || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    track.scrollLeft = d.left - dx;
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const track = trackRef.current;
    if (!d || !track || d.id !== e.pointerId) return;
    drag.current = null;
    track.classList.remove('is-dragging');
    if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
    // pilih kartu terdekat dengan titik tengah, lalu rapikan
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < track.children.length; i++) {
      const el = track.children[i] as HTMLElement;
      const dist = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    scrollToIndex(best, true);
  };

  return (
    <section className="reviews" aria-roledescription="carousel" aria-label={demo ? 'Ulasan contoh' : 'Ulasan pelanggan'}>
      <div
        className="reviews__track"
        ref={trackRef}
        tabIndex={0}
        data-roomkeys="horizontal"
        aria-label="Geser untuk membaca ulasan lain"
        onScroll={schedule}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {reviews.map((r, i) => (
          <article
            className="review"
            key={r.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} dari ${reviews.length}`}
          >
            {demo ? <p className="review__tag">Contoh · data demo</p> : null}
            <Stars value={r.rating} demo={demo} />
            <blockquote className="review__text">“{r.text}”</blockquote>
            <footer className="review__who">
              <span className="review__name">
                {r.name}
                {demo ? <span className="review__sample"> (contoh)</span> : null}
              </span>
              <span className="review__item">{r.item}</span>
            </footer>
          </article>
        ))}
      </div>

      <div className="reviews__controls">
        <button type="button" className="reviews__btn" onClick={() => go(-1)} disabled={current <= 0}>
          <span aria-hidden="true">←</span> Sebelumnya
        </button>
        <p className="reviews__count" aria-live="polite">
          {pad2(current + 1)} / {pad2(reviews.length)}
        </p>
        <button
          type="button"
          className="reviews__btn"
          onClick={() => go(1)}
          disabled={current >= reviews.length - 1}
        >
          Berikutnya <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
