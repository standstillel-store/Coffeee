import { motion, type MotionConfig, type PoseConfig } from '../config/motion';

/**
 * Matematika kamera murni (tanpa DOM) agar mudah diuji.
 * Penjelasan model ada di config/motion.ts.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smoothstep: 0 di ujung bawah dan atas dengan kemiringan nol. */
export const smooth01 = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export const easeInOutCubic = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/* ------------------------------------------------------------------ */
/* Metrik viewport                                                      */
/* ------------------------------------------------------------------ */

export interface Metrics {
  vw: number;
  vh: number;
  /** nilai CSS perspective (px). */
  P: number;
  /** jarak z antar ruang (px). */
  step: number;
  /** tinggi scroll untuk satu ruang (px). */
  R: number;
  compact: boolean;
  blurScale: number;
  veilScale: number;
}

export function computeMetrics(vw: number, vh: number, cfg: MotionConfig = motion): Metrics {
  const compact = vw <= cfg.compact.maxWidth;
  const stepRatio = compact ? cfg.compact.stepRatio : cfg.camera.stepRatio;
  const scrollRatio = compact ? cfg.compact.scrollPerRoomRatio : cfg.camera.scrollPerRoomRatio;
  const P = Math.round(vh * cfg.camera.perspectiveRatio);
  return {
    vw,
    vh,
    P,
    step: Math.round(P * stepRatio),
    R: Math.max(cfg.camera.minScrollPerRoom, Math.round(vh * scrollRatio)),
    compact,
    blurScale: compact ? cfg.compact.blurScale : 1,
    veilScale: compact ? cfg.compact.veilScale : 1,
  };
}

/** Skala layar sebuah bidang yang berjarak d ruang dari kamera. */
export function sceneScale(P: number, step: number, d: number): number {
  const denom = P + d * step;
  // Di belakang bidang kamera (denom <= 0) tidak ada proyeksi yang valid.
  return denom <= 0 ? Number.POSITIVE_INFINITY : P / denom;
}

/* ------------------------------------------------------------------ */
/* Pose kedalaman: opacity, blur, kecerahan                             */
/* ------------------------------------------------------------------ */

export interface Pose {
  opacity: number;
  /** blur dalam piksel LAYAR. */
  blur: number;
  brightness: number;
  visible: boolean;
}

const VISIBLE_EPS = 0.004;

/**
 * d = (indeks ruang) - (posisi kamera).
 *   d > 0 : ruang di depan kamera (lebih jauh): lebih redup, buram halus.
 *   d = 0 : ruang aktif: tajam penuh.
 *   d < 0 : ruang yang sudah dilewati: membesar dan memudar sebelum "meledak".
 * Semua kurva bersifat mulus dan datar (kemiringan nol) di d = 0, sehingga
 * ruang aktif tetap tajam walau kamera sedikit bergeser.
 *
 * `veil` (0..1) menambah redaman opacity untuk ruang di depan: 1 di d = 0 (tidak
 * berpengaruh) dan `veil` di d >= 1. Hasil kali dua fungsi yang sama-sama
 * menurun terhadap d tetap menurun, jadi kurvanya tetap monoton.
 */
export function poseAt(d: number, cfg: PoseConfig = motion.pose, blurScale = 1, veil = 1): Pose {
  if (d >= 0) {
    const a = cfg.ahead;
    const far = 1 - smooth01((d - a.fadeStart) / (a.fadeEnd - a.fadeStart));
    const veiled = lerp(1, clamp(veil, 0, 1), smooth01(d));
    const opacity = (1 / (1 + (d / a.halfDepth) ** 2)) * far * veiled;
    const blur = a.maxBlur * (1 - Math.exp(-((d / a.blurDepth) ** 2))) * blurScale;
    const brightness = 1 - a.dim * (1 - Math.exp(-((d / a.dimDepth) ** 2)));
    return { opacity, blur, brightness, visible: opacity > VISIBLE_EPS };
  }
  const b = cfg.behind;
  const u = -d;
  const opacity = Math.exp(-((u / b.fadeWidth) ** 2));
  const blur = b.maxBlur * (1 - Math.exp(-((u / b.blurDepth) ** 2))) * blurScale;
  return { opacity, blur, brightness: 1, visible: opacity > VISIBLE_EPS };
}

/** Pose untuk prefers-reduced-motion: hanya ruang aktif yang terlihat. */
export function steppedPose(d: number): Pose {
  const on = Math.abs(d) < 0.5;
  return { opacity: on ? 1 : 0, blur: 0, brightness: 1, visible: on };
}

/* ------------------------------------------------------------------ */
/* Jalur kamera                                                         */
/* ------------------------------------------------------------------ */

/** Posisi lateral kamera (fraksi viewport) di antara ruang-ruang yang berjajar. */
export function pathAt(c: number, offsets: readonly Vec2[]): Vec2 {
  const n = offsets.length;
  if (n === 0) return { x: 0, y: 0 };
  const cc = clamp(c, 0, n - 1);
  const i = Math.min(Math.floor(cc), n - 1);
  const j = Math.min(i + 1, n - 1);
  const e = smooth01(cc - i);
  const a = offsets[i]!;
  const b = offsets[j]!;
  return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) };
}

/* ------------------------------------------------------------------ */
/* Scroll <-> kamera                                                    */
/* ------------------------------------------------------------------ */

export const cameraForScroll = (y: number, R: number): number => y / R;
export const scrollForCamera = (c: number, R: number): number => c * R;
export const spacerHeight = (count: number, R: number, vh: number): number =>
  Math.max(0, count - 1) * R + vh;

/* ------------------------------------------------------------------ */
/* Perapian (settle) setelah scroll berhenti                            */
/* ------------------------------------------------------------------ */

/**
 * Ambang komit efektif (fraksi ruang) untuk tinggi scroll per ruang `R` (px): yang lebih kecil antara
 * fraksi di konfigurasi dan `commitMinPx / R`. Dengan begitu satu klik roda mouse (~100 px) memindahkan
 * ruang di jendela setinggi apa pun, bukan hanya di jendela pendek tempat 12% ruang kebetulan < 100 px.
 */
export function commitFractions(
  R: number,
  cfg: Pick<MotionConfig['camera'], 'commitForward' | 'commitBackward' | 'commitMinPx'> = motion.camera,
): { commitForward: number; commitBackward: number } {
  const px = cfg.commitMinPx / Math.max(1, R);
  return {
    commitForward: Math.min(cfg.commitForward, px),
    commitBackward: Math.min(cfg.commitBackward, px),
  };
}

/**
 * Memilih ruang tujuan setelah scroll berhenti di posisi t (satuan ruang).
 * `anchor` adalah ruang tempat gestur dimulai; arah niat pengguna ditentukan
 * dari t relatif terhadap anchor, bukan dari delta terakhir, supaya momentum
 * yang berbalik arah tidak membuang gestur.
 */
export function settleTarget(
  t: number,
  anchor: number,
  count: number,
  cfg: Pick<MotionConfig['camera'], 'commitForward' | 'commitBackward'> = motion.camera,
): number {
  const hi = Math.max(0, count - 1);
  const x = clamp(t, 0, hi);
  const base = Math.floor(x);
  const frac = x - base;
  if (frac < 0.0005 || base >= hi) return clamp(base, 0, hi);
  const forward = x > anchor;
  const to = forward ? (frac >= cfg.commitForward ? base + 1 : base) : 1 - frac >= cfg.commitBackward ? base : base + 1;
  return clamp(to, 0, hi);
}

/** Durasi perpindahan (ms) lewat tombol/klik, bergantung pada jumlah ruang yang dilewati. */
export function travelDuration(rooms: number, cfg: MotionConfig['travel'] = motion.travel): number {
  const n = Math.max(1, Math.abs(rooms));
  return Math.min(cfg.maxMs, cfg.baseMs + cfg.extraMs * (n - 1));
}

/** Durasi perapian (ms) untuk menutup sisa jarak (dalam ruang). */
export function settleDuration(distance: number, cfg: MotionConfig['travel'] = motion.travel): number {
  return Math.min(cfg.maxMs, cfg.settleBaseMs + cfg.settlePerMs * clamp(Math.abs(distance), 0, 1));
}
