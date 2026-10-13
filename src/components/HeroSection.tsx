import { useRef } from 'react';
import { brand } from '../config/brand';
import { useWordmarkFit } from '../lib/useWordmarkFit';
import { splitWordmark } from '../lib/wordmark';

interface Props {
  /** true bila ruang ini sedang dituju kamera (mengatur isyarat scroll). */
  active: boolean;
  onExplore: () => void;
}

/**
 * Ruang 1. Setiap lapisan punya kedalaman z sendiri di dalam ruang:
 * nama brand paling jauh, cangkir paling dekat. Saat kamera maju, cangkir
 * membesar lebih cepat dari huruf-huruf di belakangnya (paralaks sungguhan
 * dari perspektif, bukan animasi terpisah).
 */
export function HeroSection({ active, onExplore }: Props) {
  const [left, right] = splitWordmark(brand.name);
  const rootRef = useRef<HTMLDivElement>(null);
  // ukuran huruf nama brand disetel dari lebar belahan yang sebenarnya, bukan dugaan tiga huruf
  useWordmarkFit(rootRef, `${left}|${right}`);

  return (
    <div className="hero" ref={rootRef} data-live={active ? 'true' : 'false'}>
      <h1 className="hero__brand leaf layer">
        <span className="sr-only">
          {brand.name} {brand.descriptor}
        </span>
        <span className="hero__words" aria-hidden="true">
          <span className="hero__half hero__half--l">{left}</span>
          <span className="hero__half hero__half--r">{right}</span>
        </span>
        <span className="hero__tag" aria-hidden="true">
          {brand.descriptor}
        </span>
      </h1>

      <div className="hero__cup leaf layer">
        <span className="hero__glow" aria-hidden="true" />
        <img
          className="hero__img"
          src={brand.heroImage}
          alt={brand.heroAlt}
          width={504}
          height={713}
          fetchPriority="high"
          decoding="async"
          draggable={false}
        />
        <span className="hero__ground" aria-hidden="true" />
      </div>

      <p className="hero__headline leaf">{brand.headline}</p>
      <p className="hero__desc leaf">{brand.description}</p>

      <button type="button" className="hero__cue leaf" onClick={onExplore}>
        <span>{brand.scrollCue}</span>
        <span className="hero__cue-line" aria-hidden="true" />
      </button>
    </div>
  );
}
