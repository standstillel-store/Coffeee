import { useLayoutEffect, type RefObject } from 'react';

/**
 * Mengukur lebar alami belahan nama brand yang paling lebar (dalam em, jadi tidak bergantung pada ukuran
 * huruf) dan menuliskannya sebagai `--half-em` pada elemen akar landing. CSS memakai angka itu untuk
 * menyetel ukuran huruf nama dan menyamakan lebar kedua belahan, sehingga nama berapa pun panjang dan huruf
 * lebarnya ("Ambang", "Kopi Kenangan", "Mawar") muat di kiri-kanan gelas tanpa meluap dari layar, dan
 * sambungan nama selalu jatuh tepat di sumbu gelas. Sebelum diukur (render pertama, atau JS belum jalan)
 * CSS memakai dugaan 2,35em: tiga huruf kapital Gloock, mis. "AMB".
 *
 * Yang diukur adalah salinan tak terlihat dari tiap belahan dengan lebar `auto`, bukan belahan aslinya:
 * lebar belahan asli ditetapkan CSS dari --half-em itu sendiri, jadi mengukurnya akan membaca nilainya sendiri.
 * offsetWidth (lebar tata letak) dipakai, bukan getBoundingClientRect, karena lapisan nama brand diproyeksikan
 * perspektif dan kotak yang tampak ikut berubah saat kamera bergerak.
 *
 * Diukur ulang saat font selesai dimuat (lebar font cadangan berbeda) dan saat `key` berubah (nama diganti,
 * mis. lewat hot reload). Peristiwa `ambang:refit` pada elemen akar memicu pengukuran ulang untuk uji otomatis
 * yang mengganti teks langsung di DOM.
 */
export function useWordmarkFit(root: RefObject<HTMLElement | null>, key: string): void {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;

    const fit = () => {
      const words = el.querySelector<HTMLElement>('.hero__words');
      if (!words) return;
      const fontSize = parseFloat(getComputedStyle(words).fontSize);
      if (!fontSize) return;

      const probe = document.createElement('span');
      probe.className = 'hero__half';
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;width:auto;white-space:nowrap;animation:none';
      words.appendChild(probe);
      let em = 0;
      for (const half of words.querySelectorAll<HTMLElement>('.hero__half:not([style])')) {
        probe.textContent = half.textContent;
        em = Math.max(em, probe.offsetWidth / fontSize);
      }
      probe.remove();

      // nilai tak masuk akal (elemen disembunyikan, font belum ada) tidak boleh merusak tata letak
      if (em >= 0.4 && em <= 40) el.style.setProperty('--half-em', em.toFixed(3));
    };

    fit();
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    let alive = true;
    void fonts?.ready.then(() => {
      if (alive) fit();
    });
    fonts?.addEventListener?.('loadingdone', fit);
    el.addEventListener('ambang:refit', fit);
    return () => {
      alive = false;
      fonts?.removeEventListener?.('loadingdone', fit);
      el.removeEventListener('ambang:refit', fit);
    };
  }, [root, key]);
}
