import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { motion } from '../src/config/motion';
import {
  cameraForScroll,
  clamp,
  commitFractions,
  computeMetrics,
  easeInOutCubic,
  pathAt,
  poseAt,
  sceneScale,
  scrollForCamera,
  settleDuration,
  settleTarget,
  smooth01,
  spacerHeight,
  steppedPose,
  travelDuration,
} from '../src/lib/camera';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

/** deret angka rapat dari a ke b (inklusif). */
const sweep = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

describe('sceneScale (rumus perspektif CSS)', () => {
  const P = 1305; // 1.45 * 900
  const step = Math.round(P * motion.camera.stepRatio);

  it('ruang aktif (d = 0) berskala tepat 1', () => {
    near(sceneScale(P, step, 0), 1);
  });

  it('semakin jauh di depan kamera semakin kecil, secara monoton', () => {
    let prev = Infinity;
    for (const d of sweep(0, 4, 80)) {
      const s = sceneScale(P, step, d);
      assert.ok(s <= prev + 1e-12, `skala naik di d=${d}`);
      prev = s;
    }
  });

  it('ruang berikutnya tumbuh monoton dari kecil ke 1 selama kamera menempuh satu ruang', () => {
    // kamera c bergerak dari 3 ke 4; ruang 4 (pasangan berikutnya) harus membesar sampai tepat 1
    let prev = 0;
    for (const c of sweep(3, 4, 100)) {
      const s = sceneScale(P, step, 4 - c);
      assert.ok(s >= prev - 1e-12, `skala ruang berikutnya turun di c=${c}`);
      prev = s;
    }
    near(sceneScale(P, step, 0), 1);
    // saat kamera berada di ruang 3, ruang 4 tampil jauh lebih kecil (bukan hampir sama besar)
    const atRest = sceneScale(P, step, 1);
    assert.ok(atRest > 0.45 && atRest < 0.75, `skala istirahat ruang berikutnya ${atRest}`);
  });

  it('bidang di belakang bidang kamera tidak punya proyeksi valid', () => {
    assert.equal(sceneScale(P, step, -P / step - 0.001), Number.POSITIVE_INFINITY);
  });
});

describe('poseAt (opacity, blur, kecerahan menurut kedalaman)', () => {
  it('di d = 0 ruang tajam penuh', () => {
    const p = poseAt(0);
    near(p.opacity, 1);
    near(p.blur, 0);
    near(p.brightness, 1);
    assert.equal(p.visible, true);
  });

  it('kontinu melewati d = 0 (tidak ada lompatan opacity/blur)', () => {
    const a = poseAt(1e-6);
    const b = poseAt(-1e-6);
    near(a.opacity, b.opacity, 1e-6);
    near(a.blur, b.blur, 1e-6);
  });

  it('kurva datar di d = 0: pergeseran kecil kamera tidak mengaburkan ruang aktif', () => {
    const p = poseAt(0.02);
    assert.ok(p.opacity > 0.99, `opacity ${p.opacity}`);
    assert.ok(p.blur < 0.01, `blur ${p.blur}`);
    const q = poseAt(-0.02);
    assert.ok(q.opacity > 0.99, `opacity ${q.opacity}`);
    assert.ok(q.blur < 0.05, `blur ${q.blur}`);
  });

  for (const veil of [1, 0.5, 0.3, 0.15, 0]) {
    it(`opacity ruang di depan menurun monoton (veil ${veil})`, () => {
      let prev = Infinity;
      for (const d of sweep(0, 4, 400)) {
        const o = poseAt(d, motion.pose, 1, veil).opacity;
        assert.ok(o <= prev + 1e-12, `opacity naik di d=${d} (veil ${veil})`);
        assert.ok(o >= 0 && o <= 1, `opacity di luar 0..1: ${o}`);
        prev = o;
      }
    });
  }

  it('veil tidak berpengaruh di d = 0 dan menjadi pengali penuh saat d >= 1', () => {
    near(poseAt(0, motion.pose, 1, 0.1).opacity, 1);
    for (const d of [1, 1.5, 2]) {
      const plain = poseAt(d, motion.pose, 1, 1).opacity;
      const veiled = poseAt(d, motion.pose, 1, 0.3).opacity;
      near(veiled, plain * 0.3, 1e-9);
    }
  });

  it('veil di luar 0..1 dijepit', () => {
    near(poseAt(1, motion.pose, 1, 5).opacity, poseAt(1, motion.pose, 1, 1).opacity);
    near(poseAt(1, motion.pose, 1, -2).opacity, 0);
  });

  it('blur di depan bertambah monoton dan tidak melewati batas konfigurasi', () => {
    let prev = -1;
    for (const d of sweep(0, 5, 200)) {
      const b = poseAt(d).blur;
      assert.ok(b >= prev - 1e-12, `blur turun di d=${d}`);
      assert.ok(b <= motion.pose.ahead.maxBlur + 1e-9);
      prev = b;
    }
  });

  it('blurScale mengecilkan blur secara proporsional', () => {
    near(poseAt(1.2, motion.pose, 0.6).blur, poseAt(1.2, motion.pose, 1).blur * 0.6, 1e-9);
  });

  it('ruang yang sudah dilewati memudar menurut jarak dan menjadi tak terlihat', () => {
    let prev = Infinity;
    for (const u of sweep(0, 1.2, 200)) {
      const o = poseAt(-u).opacity;
      assert.ok(o <= prev + 1e-12, `opacity naik di d=${-u}`);
      prev = o;
    }
    assert.equal(poseAt(-1).visible, false);
    assert.equal(poseAt(-0.9).visible, false);
  });

  it('ruang yang terlalu jauh di depan disembunyikan (tidak membebani render)', () => {
    assert.equal(poseAt(3.6).visible, false);
    assert.equal(poseAt(4).visible, false);
    assert.equal(poseAt(1).visible, true);
  });

  it('kecerahan menurun terhadap jarak di depan, dan tetap 1 di belakang', () => {
    assert.ok(poseAt(2).brightness < poseAt(0.5).brightness);
    assert.ok(poseAt(2).brightness >= 1 - motion.pose.ahead.dim - 1e-9);
    assert.equal(poseAt(-0.4).brightness, 1);
  });

  it('steppedPose (reduced motion): hanya ruang aktif yang terlihat, tanpa blur', () => {
    assert.deepEqual(steppedPose(0), { opacity: 1, blur: 0, brightness: 1, visible: true });
    assert.equal(steppedPose(0.49).visible, true);
    assert.equal(steppedPose(0.5).visible, false);
    assert.equal(steppedPose(-1).visible, false);
    assert.equal(steppedPose(1).blur, 0);
  });
});

describe('computeMetrics', () => {
  it('desktop: perspektif 1.45 x tinggi, langkah 0.8 x perspektif', () => {
    const m = computeMetrics(1440, 900);
    assert.equal(m.compact, false);
    assert.equal(m.P, Math.round(900 * 1.45));
    assert.equal(m.step, Math.round(m.P * 0.8));
    assert.equal(m.R, Math.round(900 * 0.9));
    assert.equal(m.blurScale, 1);
    assert.equal(m.veilScale, 1);
  });

  it('batas layar kecil tepat di maxWidth', () => {
    assert.equal(computeMetrics(720, 800).compact, true);
    assert.equal(computeMetrics(721, 800).compact, false);
  });

  it('layar kecil memakai langkah lebih pendek, blur dan veil lebih lembut', () => {
    const m = computeMetrics(390, 844);
    assert.equal(m.compact, true);
    assert.equal(m.step, Math.round(m.P * motion.compact.stepRatio));
    assert.equal(m.blurScale, motion.compact.blurScale);
    assert.equal(m.veilScale, motion.compact.veilScale);
    assert.equal(m.R, Math.max(motion.camera.minScrollPerRoom, Math.round(844 * motion.compact.scrollPerRoomRatio)));
  });

  it('tinggi scroll per ruang tidak pernah di bawah minimum', () => {
    assert.equal(computeMetrics(1200, 300).R, motion.camera.minScrollPerRoom);
  });
});

describe('jalur kamera', () => {
  const offsets = [
    { x: 0, y: 0 },
    { x: 0.11, y: 0 },
    { x: -0.11, y: 0 },
    { x: 0, y: 0 },
  ];

  it('tepat di ruang memberi offset ruang itu', () => {
    for (let i = 0; i < offsets.length; i++) {
      assert.deepEqual(pathAt(i, offsets), offsets[i]);
    }
  });

  it('dijepit di ujung dan kontinu di antaranya', () => {
    assert.deepEqual(pathAt(-3, offsets), offsets[0]);
    assert.deepEqual(pathAt(99, offsets), offsets[offsets.length - 1]);
    let prev = pathAt(0, offsets).x;
    for (const c of sweep(0, 3, 300)) {
      const x = pathAt(c, offsets).x;
      assert.ok(Math.abs(x - prev) < 0.012, `lompatan x di c=${c}`);
      prev = x;
    }
  });

  it('daftar kosong tidak melempar', () => {
    assert.deepEqual(pathAt(1, []), { x: 0, y: 0 });
  });
});

describe('fungsi bantu', () => {
  it('clamp, smooth01, easeInOutCubic', () => {
    assert.equal(clamp(5, 0, 1), 1);
    assert.equal(clamp(-5, 0, 1), 0);
    assert.equal(smooth01(-1), 0);
    assert.equal(smooth01(2), 1);
    near(smooth01(0.5), 0.5);
    near(easeInOutCubic(0), 0);
    near(easeInOutCubic(1), 1);
    near(easeInOutCubic(0.5), 0.5);
    let prev = -1;
    for (const t of sweep(0, 1, 100)) {
      const v = easeInOutCubic(t);
      assert.ok(v >= prev - 1e-12);
      prev = v;
    }
  });

  it('scroll <-> kamera saling berkebalikan', () => {
    for (const R of [520, 720, 810]) {
      for (const c of [0, 0.37, 1, 5.5, 7]) {
        near(cameraForScroll(scrollForCamera(c, R), R), c);
      }
    }
  });

  it('tinggi spacer = (n-1) x R + tinggi viewport', () => {
    assert.equal(spacerHeight(8, 810, 900), 7 * 810 + 900);
    assert.equal(spacerHeight(0, 810, 900), 900);
    assert.equal(spacerHeight(1, 810, 900), 900);
  });
});

describe('settleTarget (perapian setelah scroll berhenti)', () => {
  const count = 8;

  it('sudah di ruang: tetap', () => {
    assert.equal(settleTarget(3, 3, count), 3);
    assert.equal(settleTarget(3.0002, 3, count), 3);
  });

  it('maju: melewati ambang komit pindah ke ruang berikutnya, kurang dari itu kembali', () => {
    assert.equal(settleTarget(3.2, 3, count), 4);
    assert.equal(settleTarget(3.12, 3, count), 4);
    assert.equal(settleTarget(3.05, 3, count), 3);
  });

  it('mundur: menggeser sedikit dari ruang berikutnya tidak membuang gestur', () => {
    // mulai di ruang 4, mundur sampai 3.8 => pergi ke ruang 3
    assert.equal(settleTarget(3.8, 4, count), 3);
    // mundur terlalu sedikit (3.95) => tetap di ruang 4
    assert.equal(settleTarget(3.95, 4, count), 4);
  });

  it('dijepit pada 0..count-1', () => {
    assert.equal(settleTarget(-2, 0, count), 0);
    assert.equal(settleTarget(99, 7, count), 7);
    assert.equal(settleTarget(6.6, 6, count), 7);
    assert.equal(settleTarget(7.4, 7, count), 7);
  });

  it('count kecil tidak membuat hasil di luar rentang', () => {
    assert.equal(settleTarget(0.7, 0, 1), 0);
    assert.equal(settleTarget(0.7, 0, 0), 0);
  });
});

describe('commitFractions (ambang komit dalam piksel, bukan hanya fraksi)', () => {
  const count = 8;
  /** satu klik roda mouse di Chrome/Windows/Linux = 100 px; Firefox ~57 px. */
  const NOTCH = 100;
  const FIREFOX_NOTCH = 57;

  it('jendela tinggi tidak membuat ambang membesar: yang berlaku batas piksel', () => {
    const a = commitFractions(810);
    const b = commitFractions(972);
    near(a.commitForward, motion.camera.commitMinPx / 810);
    near(b.commitBackward, motion.camera.commitMinPx / 972);
    assert.ok(b.commitForward < a.commitForward, 'R lebih besar => fraksi lebih kecil, piksel sama');
    // dalam piksel scroll, ambangnya sama di semua tinggi jendela
    near(a.commitForward * 810, b.commitForward * 972, 1e-9);
  });

  it('fraksi di konfigurasi tetap menjadi batas atas (R sangat kecil / tak valid)', () => {
    assert.equal(commitFractions(100).commitForward, motion.camera.commitForward);
    assert.equal(commitFractions(0).commitForward, motion.camera.commitForward);
    assert.equal(commitFractions(-50).commitBackward, motion.camera.commitBackward);
    assert.ok(commitFractions(1e6).commitForward > 0, 'tak pernah nol');
  });

  it('SATU klik roda (100 px) memindahkan ruang di setiap tinggi jendela dan lebar (regresi: 1080p)', () => {
    for (const vw of [360, 390, 720, 1024, 1440, 1920, 2560]) {
      for (let vh = 320; vh <= 2400; vh += 40) {
        const { R } = computeMetrics(vw, vh);
        const f = commitFractions(R);
        assert.equal(settleTarget(3 + NOTCH / R, 3, count, f), 4, `maju gagal di ${vw}x${vh} (R=${R})`);
        assert.equal(settleTarget(4 - NOTCH / R, 4, count, f), 3, `mundur gagal di ${vw}x${vh} (R=${R})`);
        assert.equal(settleTarget(3 + FIREFOX_NOTCH / R, 3, count, f), 4, `klik Firefox gagal di ${vw}x${vh}`);
      }
    }
  });

  it('dan ambang lama memang gagal di 1080p (bukti bahwa tes di atas menangkap cacatnya)', () => {
    const { R } = computeMetrics(1920, 1080);
    assert.equal(settleTarget(3 + NOTCH / R, 3, count, motion.camera), 3, 'dengan fraksi 12% saja, satu klik memantul kembali');
  });

  it('sentuhan/geseran kecil tak sengaja tetap dikembalikan ke ruang semula', () => {
    for (const vh of [600, 900, 1080, 1440]) {
      const { R } = computeMetrics(1440, vh);
      const f = commitFractions(R);
      for (const px of [0, 8, 20, 40]) {
        assert.equal(settleTarget(3 + px / R, 3, count, f), 3, `maju ${px}px di vh=${vh}`);
        assert.equal(settleTarget(4 - px / R, 4, count, f), 4, `mundur ${px}px di vh=${vh}`);
      }
    }
  });

  it('di ujung rentang tetap dijepit (tidak ada ruang -1 atau count)', () => {
    const { R } = computeMetrics(1440, 900);
    const f = commitFractions(R);
    assert.equal(settleTarget(7 + NOTCH / R, 7, count, f), 7);
    assert.equal(settleTarget(0 - NOTCH / R, 0, count, f), 0);
  });
});

describe('durasi', () => {
  it('travelDuration naik dengan jumlah ruang tetapi dibatasi maxMs', () => {
    assert.equal(travelDuration(1), motion.travel.baseMs);
    assert.equal(travelDuration(-1), motion.travel.baseMs);
    assert.ok(travelDuration(3) > travelDuration(2));
    assert.equal(travelDuration(40), motion.travel.maxMs);
    assert.equal(travelDuration(0), motion.travel.baseMs);
  });

  it('settleDuration tumbuh dengan jarak (0..1 ruang)', () => {
    assert.equal(settleDuration(0), motion.travel.settleBaseMs);
    assert.equal(settleDuration(1), motion.travel.settleBaseMs + motion.travel.settlePerMs);
    assert.equal(settleDuration(5), settleDuration(1));
    assert.ok(settleDuration(0.5) > settleDuration(0.1));
  });
});

describe('konfigurasi gerak masuk akal', () => {
  const { camera, pose, compact, travel } = motion;

  it('urutan kurva dan ambang konsisten', () => {
    assert.ok(pose.ahead.fadeStart < pose.ahead.fadeEnd);
    assert.ok(pose.ahead.halfDepth > 0 && pose.behind.fadeWidth > 0);
    assert.ok(camera.commitForward > 0 && camera.commitForward < 0.5);
    assert.ok(camera.commitBackward > 0 && camera.commitBackward < 0.5);
    // lebih kecil dari satu klik roda terkecil yang lazim (Firefox ~57 px), lebih besar dari gesekan tak sengaja
    assert.ok(camera.commitMinPx > 24 && camera.commitMinPx <= 56, `commitMinPx=${camera.commitMinPx}`);
    assert.ok(camera.stepRatio > 0 && camera.stepRatio < 1.5);
    assert.ok(compact.stepRatio <= camera.stepRatio, 'layar kecil tidak boleh melangkah lebih jauh');
    assert.ok(travel.baseMs <= travel.maxMs);
  });

  it('veil per ruang berada di 0..1', () => {
    for (const v of Object.values(pose.ahead.veil)) assert.ok(v >= 0 && v <= 1);
    assert.ok(compact.veilScale > 0 && compact.veilScale <= 1);
  });

  it('kamera pada skala istirahat: ruang berikutnya jelas lebih kecil dari ruang aktif', () => {
    // gagal bila stepRatio terlalu kecil sehingga "pasangan berikutnya" nyaris sebesar pasangan aktif
    const m = computeMetrics(1440, 900);
    assert.ok(sceneScale(m.P, m.step, 1) < 0.7);
    const c = computeMetrics(390, 844);
    assert.ok(sceneScale(c.P, c.step, 1) < 0.75);
  });
});
