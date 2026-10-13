import { useCallback, useMemo, useState } from 'react';
import { HeroSection } from './components/HeroSection';
import { NavigationControls } from './components/NavigationControls';
import { ProductDetail } from './components/ProductDetail';
import { ProductGrid } from './components/ProductGrid';
import { ReviewsRoom } from './components/ReviewsRoom';
import { RoomTransition } from './components/RoomTransition';
import { products } from './config/products';
import { roomIndexOf, rooms, type RoomDef } from './config/rooms';
import { useRoomNav } from './context/room';
import { useReducedMotion } from './hooks/useReducedMotion';

interface ContentProps {
  room: RoomDef;
  active: boolean;
  selectedId: string;
  onSelectId: (id: string) => void;
}

/** Isi satu ruang. Komponen ini ada di dalam provider, jadi boleh memakai konteks navigasi. */
function RoomContent({ room, active, selectedId, onSelectId }: ContentProps) {
  const nav = useRoomNav();
  const detailIndex = roomIndexOf('detail', nav.rooms);

  const openProduct = useCallback(
    (id: string) => {
      onSelectId(id);
      nav.travelTo(detailIndex);
    },
    [nav, onSelectId, detailIndex],
  );

  switch (room.kind) {
    case 'hero':
      return <HeroSection active={active} onExplore={nav.next} />;
    case 'menu': {
      const items = room.productIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is (typeof products)[number] => !!p);
      const startNumber = products.findIndex((p) => p.id === room.productIds[0]) + 1;
      return (
        <ProductGrid room={room} items={items} startNumber={startNumber} total={products.length} onSelect={openProduct} />
      );
    }
    case 'detail':
      return <ProductDetail products={products} selectedId={selectedId} onSelectId={onSelectId} />;
    case 'reviews':
      return <ReviewsRoom number={room.index + 1} reducedMotion={nav.reducedMotion} onRestart={() => nav.travelTo(0)} />;
    default:
      return null;
  }
}

export default function App() {
  const reducedMotion = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string>(products[0]!.id);

  const renderRoom = useMemo(
    () => (room: RoomDef, active: boolean) => (
      <div className="room__plane">
        <RoomContent room={room} active={active} selectedId={selectedId} onSelectId={setSelectedId} />
      </div>
    ),
    [selectedId],
  );

  return <RoomTransition rooms={rooms} reducedMotion={reducedMotion} renderRoom={renderRoom} hud={<NavigationControls />} />;
}
