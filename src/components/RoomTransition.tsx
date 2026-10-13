import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RoomDef } from '../config/rooms';
import { RoomContext, type RoomNav } from '../context/room';
import { keyContextFrom, roomKeyAction } from '../lib/keys';
import { CameraRig } from '../lib/rig';

interface Props {
  rooms: readonly RoomDef[];
  reducedMotion: boolean;
  /** Isi tiap ruang. `active` true hanya untuk ruang yang sedang dituju kamera. */
  renderRoom: (room: RoomDef, active: boolean) => ReactNode;
  /** Kontrol navigasi yang menetap di atas panggung. */
  hud: ReactNode;
}

/**
 * Panggung 3D. Struktur:
 *
 *   .stage  (fixed, perspective)
 *     .backdrop   cahaya, vinyet, butiran (2D, tidak ikut bergerak)
 *     .world      preserve-3d; digeser maju-mundur oleh kamera
 *       .room x N bidang ruang pada z = -i * step
 *     hud
 *   .scroll-spacer   tinggi dokumen; scroll native menggerakkan kamera
 */
export function RoomTransition({ rooms, reducedMotion, renderRoom, hud }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const roomEls = useRef<(HTMLElement | null)[]>([]);
  const rigRef = useRef<CameraRig | null>(null);
  const [active, setActive] = useState(0);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const world = worldRef.current;
    const spacer = spacerRef.current;
    if (!stage || !world || !spacer) return;

    const rig = new CameraRig({
      count: rooms.length,
      offsets: rooms.map((r) => r.offset),
      veils: rooms.map((r) => r.veil),
      reducedMotion,
    });
    rigRef.current = rig;
    const unsubscribe = rig.onActive(setActive);
    rig.attach({ stage, world, spacer, rooms: roomEls.current });

    // Pintu belakang untuk pengujian otomatis: hanya aktif dengan ?debug di URL.
    if (new URLSearchParams(window.location.search).has('debug')) {
      Object.assign(window, { __ambang: { rig } });
    }

    return () => {
      unsubscribe();
      rig.destroy();
      rigRef.current = null;
    };
  }, [rooms, reducedMotion]);

  const travelTo = useCallback((index: number) => rigRef.current?.travelTo(index), []);
  const next = useCallback(() => rigRef.current?.next(), []);
  const prev = useCallback(() => rigRef.current?.prev(), []);

  useEffect(() => {
    const last = rooms.length - 1;
    const onKey = (e: KeyboardEvent) => {
      // e.defaultPrevented: widget yang sudah memakai tombol ini (panah di radiogroup, Home/End di karusel) tidak ikut berpindah ruang
      const action = roomKeyAction(e, keyContextFrom(e.target));
      if (!action) return;
      e.preventDefault();
      if (action === 'next') next();
      else if (action === 'prev') prev();
      else if (action === 'first') travelTo(0);
      else travelTo(last);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rooms.length, next, prev, travelTo]);

  const value = useMemo<RoomNav>(
    () => ({ rooms, active, count: rooms.length, reducedMotion, travelTo, next, prev }),
    [rooms, active, reducedMotion, travelTo, next, prev],
  );

  const current = rooms[active];

  return (
    <RoomContext.Provider value={value}>
      <div className="stage" ref={stageRef} data-motion={reducedMotion ? 'reduced' : 'full'}>
        <div className="backdrop" aria-hidden="true">
          <div className="backdrop__light" />
          <div className="backdrop__floor" />
          <div className="backdrop__vignette" />
          <div className="backdrop__grain" />
        </div>

        <div className="world" ref={worldRef}>
          {rooms.map((room, i) => (
            <section
              key={room.id}
              id={room.id}
              className={`room room--${room.kind}`}
              data-room={room.id}
              aria-label={room.label}
              aria-hidden={i !== active}
              inert={i !== active}
              ref={(el) => {
                roomEls.current[i] = el;
              }}
            >
              {renderRoom(room, i === active)}
            </section>
          ))}
        </div>

        {hud}

        <p className="sr-only" role="status" aria-live="polite">
          {current ? `Ruang ${active + 1} dari ${rooms.length}: ${current.label}` : ''}
        </p>
      </div>
      <div className="scroll-spacer" ref={spacerRef} aria-hidden="true" />
    </RoomContext.Provider>
  );
}
