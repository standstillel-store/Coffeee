/**
 * Konfigurasi animasi dan kamera. Semua angka yang memengaruhi "rasa" gerakan
 * ada di sini, terpisah dari komponen UI.
 *
 * Satuan "ruang": 1 = jarak antara dua ruang yang bersebelahan.
 * Rumus dasar kamera (perspektif CSS):  skala = P / (P + d * step)
 *   P    = nilai `perspective`
 *   step = jarak z antar ruang
 *   d    = (indeks ruang) - (posisi kamera)   (d > 0: di depan kamera / lebih jauh)
 */

export interface CameraConfig {
  /** perspective = ratio * tinggi viewport. */
  perspectiveRatio: number;
  /** jarak z antar ruang = ratio * perspective. Menentukan seberapa kecil ruang berikutnya. */
  stepRatio: number;
  /** tinggi scroll untuk melewati satu ruang = ratio * tinggi viewport. */
  scrollPerRoomRatio: number;
  minScrollPerRoom: number;
  /** konstanta waktu (detik) kamera mengikuti posisi scroll. */
  followTau: number;
  touchFollowTau: number;
  /** jeda tanpa scroll (ms) sebelum kamera dirapikan ke ruang terdekat. */
  settleIdleMs: number;
  /** berapa jauh (fraksi ruang) pengguna harus bergerak agar berpindah ruang. */
  commitForward: number;
  commitBackward: number;
  /**
   * Batas komit dalam piksel scroll. Yang berlaku adalah yang lebih kecil antara fraksi di atas dan
   * `commitMinPx / R`. Tanpa ini ambang fraksi membesar mengikuti tinggi jendela (12% dari 972 px = 117 px
   * di 1080p), sehingga satu klik roda mouse (100 px) berpindah ruang di jendela 900 px tetapi hanya
   * "memantul" kembali di layar 1080p ke atas. Gerakan di bawah batas ini (sentuhan tak sengaja)
   * tetap dikembalikan ke ruang semula.
   */
  commitMinPx: number;
}

export interface CompactConfig {
  /** lebar viewport (px) di bawah/sama dengan ini dianggap layar kecil. */
  maxWidth: number;
  stepRatio: number;
  scrollPerRoomRatio: number;
  /** pengali blur kedalaman pada layar kecil. */
  blurScale: number;
  /** pengali tambahan untuk kilasan ruang berikutnya pada layar kecil (kartu lebih besar, jadi lebih mudah mengotori). */
  veilScale: number;
}

export interface TravelConfig {
  /** durasi perpindahan 1 ruang lewat tombol/klik (ms). */
  baseMs: number;
  /** tambahan per ruang tambahan (ms). */
  extraMs: number;
  maxMs: number;
  /** perapian setelah scroll berhenti. */
  settleBaseMs: number;
  settlePerMs: number;
}

export interface PathConfig {
  /** simpangan horizontal jalur kamera antar ruang menu (fraksi lebar viewport). */
  zigzag: number;
  /** simpangan vertikal (fraksi tinggi viewport). */
  lift: number;
}

export interface PoseConfig {
  ahead: {
    /** jarak ruang saat opacity turun ke 50%. */
    halfDepth: number;
    fadeStart: number;
    fadeEnd: number;
    /** blur maksimum di layar (px). */
    maxBlur: number;
    blurDepth: number;
    /** pengurangan kecerahan maksimum (0..1). */
    dim: number;
    dimDepth: number;
    /**
     * Pengali opacity untuk ruang yang masih jauh di depan (d >= 1); menjadi 1 saat kamera tiba.
     * Kilasan pasangan menu berikutnya dibiarkan jelas (ia hanya foto), tetapi ruang yang berisi
     * teks dan kontrol dijaga redup supaya tidak mengotori ruang yang sedang dibaca.
     */
    veil: {
      /** menu pertama, dilihat dari landing: sampul tetap bersih */
      afterHero: number;
      /** ruang detail, dilihat dari menu terakhir */
      detail: number;
      /** ruang ulasan, dilihat dari ruang detail */
      reviews: number;
    };
  };
  behind: {
    /** lebar kurva gauss opacity untuk ruang yang sudah dilewati. */
    fadeWidth: number;
    maxBlur: number;
    blurDepth: number;
  };
}

export interface IntroConfig {
  totalMs: number;
}

export interface MotionConfig {
  camera: CameraConfig;
  compact: CompactConfig;
  travel: TravelConfig;
  path: PathConfig;
  pose: PoseConfig;
  intro: IntroConfig;
}

export const motion: MotionConfig = {
  camera: {
    perspectiveRatio: 1.45,
    stepRatio: 0.8,
    scrollPerRoomRatio: 0.9,
    minScrollPerRoom: 520,
    followTau: 0.09,
    touchFollowTau: 0.05,
    settleIdleMs: 150,
    commitForward: 0.12,
    commitBackward: 0.12,
    commitMinPx: 48,
  },
  compact: {
    maxWidth: 720,
    stepRatio: 0.62,
    scrollPerRoomRatio: 0.8,
    blurScale: 0.6,
    veilScale: 0.6,
  },
  travel: {
    baseMs: 1200,
    extraMs: 340,
    maxMs: 2800,
    settleBaseMs: 460,
    settlePerMs: 640,
  },
  path: {
    zigzag: 0.11,
    lift: 0,
  },
  pose: {
    ahead: {
      halfDepth: 0.95,
      fadeStart: 2.3,
      fadeEnd: 3.4,
      maxBlur: 4.2,
      blurDepth: 1.5,
      dim: 0.55,
      dimDepth: 1.7,
      veil: { afterHero: 0.3, detail: 0.5, reviews: 0.15 },
    },
    behind: {
      fadeWidth: 0.34,
      maxBlur: 3,
      blurDepth: 0.38,
    },
  },
  intro: {
    totalMs: 1500,
  },
};
