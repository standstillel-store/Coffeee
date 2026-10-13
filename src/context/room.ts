import { createContext, useContext } from 'react';
import type { RoomDef } from '../config/rooms';

export interface RoomNav {
  rooms: readonly RoomDef[];
  /** indeks ruang aktif (0-based) */
  active: number;
  count: number;
  reducedMotion: boolean;
  travelTo: (index: number) => void;
  next: () => void;
  prev: () => void;
}

export const RoomContext = createContext<RoomNav | null>(null);

export function useRoomNav(): RoomNav {
  const value = useContext(RoomContext);
  if (!value) throw new Error('useRoomNav harus dipakai di dalam <RoomTransition>.');
  return value;
}
