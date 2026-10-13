import { brand } from '../config/brand';
import { reviews, reviewsAreDemo } from '../config/reviews';
import { pad2 } from '../lib/money';
import { ReviewCarousel } from './ReviewCarousel';

interface Props {
  /** Nomor ruang (1-based) untuk label kecil. */
  number: number;
  reducedMotion: boolean;
  onRestart: () => void;
}

/** Ruang terakhir: ulasan yang dapat digeser, lalu penutup. */
export function ReviewsRoom({ number, reducedMotion, onRestart }: Props) {
  return (
    <div className="finale">
      <header className="finale__head leaf">
        <p className="finale__kicker">Ruang {pad2(number)}</p>
        <h2 className="finale__title">Ulasan</h2>
        {reviewsAreDemo ? (
          <p className="finale__demo">Contoh ulasan. Bukan dari pelanggan sungguhan.</p>
        ) : null}
      </header>

      <div className="finale__carousel leaf">
        <ReviewCarousel reviews={reviews} demo={reviewsAreDemo} reducedMotion={reducedMotion} />
      </div>

      <footer className="finale__close leaf">
        <p className="finale__bye">{brand.closing.title}</p>
        <button type="button" className="finale__restart" onClick={onRestart}>
          {brand.closing.restart}
        </button>
        <p className="finale__notice">{brand.demoNotice}</p>
      </footer>
    </div>
  );
}
