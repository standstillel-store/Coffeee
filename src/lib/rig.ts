import { motion, type MotionConfig } from '../config/motion';
import {
  cameraForScroll,
  clamp,
  commitFractions,
  computeMetrics,
  easeInOutCubic,
  lerp,
  pathAt,
  poseAt,
  sceneScale,
  scrollForCamera,
  settleDuration,
  settleTarget,
  spacerHeight,
  steppedPose,
  travelDuration,
  type Metrics,
  type Vec2,
} from './camera';

/**
 * Mesin kamera imperatif (tanpa React).
 *
 * Tugasnya:
 *  1. Menerjemahkan posisi scroll native menjadi posisi kamera `c` (satuan ruang).
 *  2. Memindahkan "dunia" 3D mengikuti `c` dan menulis pose kedalaman tiap ruang
 *     (CSS custom property) langsung ke DOM, tanpa render ulang React per frame.
 *  3. Merapikan kamera ke ruang terdekat setelah scroll berhenti, dan
 *     menjalankan perjalanan berdurasi (tombol/klik/keyboard).
 *
 * Scroll tidak dikunci: halaman memakai spacer setinggi (jumlah ruang - 1) * R
 * dan scroll native tetap bekerja (roda, sentuh, scrollbar, keyboard).
 */

export interface RigElements {
  stage: HTMLElement;
  world: HTMLElement;
  spacer: HTMLElement;
  rooms: readonly (HTMLElement | null)[];
}

export interface RigOptions {
  count: number;
  offsets: readonly Vec2[];
  /** Redaman opacity tambahan per ruang saat masih jauh di depan kamera (default 1). */
  veils?: readonly number[];
  reducedMotion: boolean;
  config?: MotionConfig;
}

export interface RigSnapshot {
  c: number;
  target: number;
  anchor: number;
  active: number;
  tweening: boolean;
  metrics: Metrics;
}

type TravelKind = 'travel' | 'settle';

interface Tween {
  from: number;
  to: number;
  start: number;
  duration: number;
  kind: TravelKind;
}

interface RoomStyleCache {
  o: string;
  blur: string;
  bright: string;
  visible: string;
  active: boolean;
}

export class CameraRig {
  private readonly cfg: MotionConfig;
  private readonly count: number;
  private readonly offsets: readonly Vec2[];
  private readonly veils: readonly number[];
  private readonly reduced: boolean;

  private els: RigElements | null = null;
  private metrics: Metrics;

  /** posisi kamera saat ini (satuan ruang, pecahan) */
  private c = 0;
  /** posisi yang sedang dikejar kamera */
  private target = 0;
  /** ruang tempat gestur scroll terakhir dimulai/diselesaikan */
  private anchor = 0;
  private activeIndex = 0;

  private tween: Tween | null = null;
  private raf = 0;
  private lastFrame = 0;
  private settleTimer = 0;
  private settleRaf = 0;
  private settleEnabled = true;
  private touching = false;

  private readonly listeners = new Set<(index: number) => void>();
  private cache: RoomStyleCache[] = [];
  private ro: ResizeObserver | null = null;
  private attached = false;

  constructor(opts: RigOptions) {
    this.cfg = opts.config ?? motion;
    this.count = Math.max(1, opts.count);
    this.offsets = opts.offsets;
    this.veils = opts.veils ?? [];
    this.reduced = opts.reducedMotion;
    this.metrics = computeMetrics(1280, 800, this.cfg);
  }

  /* ---------------------------- siklus hidup ---------------------------- */

  attach(els: RigElements): void {
    if (this.attached) return;
    this.attached = true;
    this.els = els;
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    this.measure(true);
    this.c = this.target = clamp(cameraForScroll(window.scrollY, this.metrics.R), 0, this.count - 1);
    this.anchor = Math.round(this.c);
    this.activeIndex = this.anchor;
    this.apply();

    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    window.addEventListener('touchend', this.onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.onTouchEnd, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.measure(false));
      this.ro.observe(els.stage);
    } else {
      window.addEventListener('resize', this.onResize);
    }
    this.emit();
    // Jika halaman dibuka di tengah-tengah dua ruang, rapikan.
    if (Math.abs(this.c - this.anchor) > 0.002) this.scheduleSettle();
  }

  destroy(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchend', this.onTouchEnd);
    window.removeEventListener('touchcancel', this.onTouchEnd);
    window.removeEventListener('resize', this.onResize);
    this.ro?.disconnect();
    this.ro = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.cancelSettle();
    this.listeners.clear();
    this.els = null;
  }

  /* ------------------------------- publik ------------------------------- */

  /** Berlangganan perubahan ruang aktif. Mengembalikan fungsi berhenti. */
  onActive(cb: (index: number) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  get active(): number {
    return this.activeIndex;
  }

  snapshot(): RigSnapshot {
    return {
      c: this.c,
      target: this.target,
      anchor: this.anchor,
      active: this.activeIndex,
      tweening: this.tween !== null,
      metrics: this.metrics,
    };
  }

  /** Terbang ke ruang `index` dengan gerakan kamera berdurasi. */
  travelTo(index: number): void {
    const to = clamp(Math.round(index), 0, this.count - 1);
    // Permintaan berulang ke tujuan yang sedang ditempuh (klik ganda, tombol keyboard ditahan) tidak
    // menyalakan ulang tween: kamera tidak melambat lagi dari nol di tengah jalan.
    if (this.tween && this.tween.to === to) return;
    this.startTween(to, 'travel');
  }

  next(): void {
    this.travelTo(this.activeIndex + 1);
  }

  prev(): void {
    this.travelTo(this.activeIndex - 1);
  }

  /** Hanya untuk pengujian/debug: letakkan kamera tepat di `c` tanpa perapian. */
  debugSetCamera(c: number): void {
    this.tween = null;
    this.cancelSettle();
    const v = clamp(c, 0, this.count - 1);
    this.c = this.target = v;
    this.anchor = Math.round(v);
    this.syncScroll();
    this.apply();
  }

  /** Hanya untuk pengujian/debug: matikan perapian otomatis. */
  debugSettle(enabled: boolean): void {
    this.settleEnabled = enabled;
    if (!enabled) this.cancelSettle();
  }

  /* ------------------------------- ukuran ------------------------------- */

  private measure(initial: boolean): void {
    const els = this.els;
    if (!els) return;
    const vw = els.stage.clientWidth || window.innerWidth;
    const vh = els.stage.clientHeight || window.innerHeight;
    const m = computeMetrics(vw, vh, this.cfg);
    this.metrics = m;

    const s = els.stage.style;
    s.setProperty('--P', `${m.P}px`);
    s.setProperty('--Pn', String(m.P));
    s.setProperty('--step', `${m.step}px`);
    s.setProperty('--vw', String(vw));
    s.setProperty('--vh', String(vh));
    s.setProperty('--rooms', String(this.count));
    els.spacer.style.height = `${spacerHeight(this.count, m.R, vh)}px`;

    els.rooms.forEach((el, i) => {
      if (!el) return;
      if (this.reduced) {
        el.style.transform = 'none';
        return;
      }
      const off = this.offsets[i] ?? { x: 0, y: 0 };
      el.style.transform = `translate3d(${(off.x * vw).toFixed(2)}px, ${(off.y * vh).toFixed(2)}px, ${-i * m.step}px)`;
    });

    if (!initial) {
      this.syncScroll();
      this.apply(true);
      this.ensureFrame();
    }
  }

  private readonly onResize = (): void => this.measure(false);

  /* -------------------------------- input -------------------------------- */

  private readonly onScroll = (): void => {
    // Scroll yang kita sebabkan sendiri selama perjalanan diabaikan.
    if (this.tween) return;
    const t = clamp(cameraForScroll(window.scrollY, this.metrics.R), 0, this.count - 1);
    this.target = t;
    if (this.reduced) {
      this.c = t;
      this.apply();
    } else {
      this.ensureFrame();
    }
    this.scheduleSettle();
  };

  private readonly onWheel = (): void => this.cancelTween();

  private readonly onTouchStart = (): void => {
    this.touching = true;
    this.cancelTween();
  };

  private readonly onTouchEnd = (): void => {
    this.touching = false;
    this.scheduleSettle();
  };

  private cancelTween(): void {
    if (!this.tween) return;
    this.tween = null;
    // Posisi scroll sudah disinkronkan tiap frame, jadi kamera lanjut dari sini.
    this.target = this.c;
    this.scheduleSettle();
  }

  /* ------------------------------- perapian ------------------------------- */

  private scheduleSettle(): void {
    if (!this.settleEnabled) return;
    this.cancelSettle();
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = 0;
      // Keputusannya diambil DI DALAM frame, setelah peristiwa scroll frame itu dikirim. Bila main thread
      // sempat macet (> settleIdleMs) di tengah gestur, scroll yang tertunda baru terbaca di frame
      // berikutnya; menunggu frame itu mencegah perapian menyala di tengah gestur lalu menggulung
      // posisi scroll mundur. Peristiwa scroll yang datang akan memanggil scheduleSettle() lagi dan
      // membatalkan frame ini.
      this.settleRaf = requestAnimationFrame(() => {
        this.settleRaf = 0;
        this.settle();
      });
    }, this.cfg.camera.settleIdleMs);
  }

  private cancelSettle(): void {
    window.clearTimeout(this.settleTimer);
    this.settleTimer = 0;
    if (this.settleRaf) cancelAnimationFrame(this.settleRaf);
    this.settleRaf = 0;
  }

  private settle(): void {
    if (this.tween || !this.attached) return;
    if (this.touching) {
      this.scheduleSettle();
      return;
    }
    const to = settleTarget(this.target, this.anchor, this.count, commitFractions(this.metrics.R, this.cfg.camera));
    if (Math.abs(to - this.c) < 0.002 && Math.abs(to - this.target) < 0.002) {
      this.finish(to);
      return;
    }
    this.startTween(to, 'settle');
  }

  /* ------------------------------ perjalanan ------------------------------ */

  private startTween(to: number, kind: TravelKind): void {
    if (!this.attached) return;
    this.cancelSettle();
    const from = this.c;
    const dist = Math.abs(to - from);
    if (dist < 0.0005) {
      this.finish(to);
      return;
    }
    if (this.reduced) {
      this.finish(to);
      return;
    }
    const duration =
      kind === 'travel'
        ? travelDuration(Math.max(1, Math.round(Math.abs(to - Math.round(from)))), this.cfg.travel)
        : settleDuration(dist, this.cfg.travel);
    this.tween = { from, to, start: performance.now(), duration, kind };
    this.target = to;
    this.ensureFrame();
  }

  /** Tiba di ruang `to`: kunci kamera dan scroll ke posisi persis. */
  private finish(to: number): void {
    this.tween = null;
    this.c = this.target = to;
    this.anchor = Math.round(to);
    this.syncScroll();
    this.apply();
  }

  private syncScroll(): void {
    const y = scrollForCamera(this.c, this.metrics.R);
    if (Math.abs(window.scrollY - y) > 0.5) {
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    }
  }

  /* --------------------------------- frame --------------------------------- */

  private ensureFrame(): void {
    if (this.raf || !this.attached) return;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (!this.attached) return;
    const dt = clamp((now - this.lastFrame) / 1000, 0, 0.05);
    this.lastFrame = now;

    if (this.tween) {
      const t = this.tween;
      const u = clamp((now - t.start) / t.duration, 0, 1);
      this.c = lerp(t.from, t.to, easeInOutCubic(u));
      this.syncScroll();
      this.apply();
      if (u >= 1) {
        this.finish(t.to);
        return;
      }
    } else {
      const tau = this.touching ? this.cfg.camera.touchFollowTau : this.cfg.camera.followTau;
      const k = 1 - Math.exp(-dt / tau);
      this.c += (this.target - this.c) * k;
      if (Math.abs(this.target - this.c) < 0.0004) this.c = this.target;
      this.apply();
    }

    if (this.tween || this.c !== this.target) {
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  /* --------------------------------- tulis DOM --------------------------------- */

  private apply(force = false): void {
    const els = this.els;
    if (!els) return;
    const m = this.metrics;

    if (!this.reduced) {
      const p = pathAt(this.c, this.offsets);
      els.world.style.transform = `translate3d(${(-p.x * m.vw).toFixed(2)}px, ${(-p.y * m.vh).toFixed(2)}px, ${(this.c * m.step).toFixed(2)}px)`;
    }

    const idx = clamp(Math.round(this.c), 0, this.count - 1);

    for (let i = 0; i < this.count; i++) {
      const el = els.rooms[i];
      if (!el) continue;
      const d = i - this.c;
      const pose = this.reduced ? steppedPose(d) : poseAt(d, this.cfg.pose, m.blurScale, (this.veils[i] ?? 1) * m.veilScale);
      // blur CSS bekerja di ruang lokal elemen; bagi dengan skala layar agar yang tampak = pose.blur
      const s = this.reduced ? 1 : clamp(sceneScale(m.P, m.step, d), 0.25, 4);
      const next: RoomStyleCache = {
        o: pose.opacity.toFixed(3),
        blur: (pose.blur / s).toFixed(2),
        bright: pose.brightness.toFixed(3),
        visible: pose.visible ? '1' : '0',
        active: i === idx,
      };
      const prev = this.cache[i];
      if (force || !prev || prev.o !== next.o) el.style.setProperty('--o', next.o);
      if (force || !prev || prev.blur !== next.blur) el.style.setProperty('--blur', `${next.blur}px`);
      if (force || !prev || prev.bright !== next.bright) el.style.setProperty('--bright', next.bright);
      if (force || !prev || prev.visible !== next.visible) el.dataset.visible = next.visible;
      if (force || !prev || prev.active !== next.active) {
        if (next.active) el.setAttribute('data-active', '');
        else el.removeAttribute('data-active');
      }
      this.cache[i] = next;
    }

    els.stage.style.setProperty('--cam', this.c.toFixed(4));

    if (idx !== this.activeIndex) {
      this.activeIndex = idx;
      this.emit();
    }
  }

  private emit(): void {
    for (const cb of this.listeners) cb(this.activeIndex);
  }
}
