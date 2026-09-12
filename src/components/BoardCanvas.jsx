import { useRef } from 'react';

// The board area's aspect ratio; background-size/shape percentages are relative to width and
// height separately, so a horizontal % needs a taller vertical % (by this ratio) to render as
// a visual square/circle instead of a stretched ellipse.
export const BOARD_ASPECT_RATIO = 16 / 9;

export function gridBackgroundStyle(gridSize) {
  const cell = 100 / gridSize;
  const cellV = cell * BOARD_ASPECT_RATIO;
  return {
    backgroundImage:
      'linear-gradient(to right, rgba(0,0,0,.35) 1px, transparent 1px), ' +
      'linear-gradient(to bottom, rgba(0,0,0,.35) 1px, transparent 1px)',
    backgroundSize: `${cell}% ${cellV}%`,
  };
}

// Shared "drag an absolutely-positioned marker around the board, in %" behavior for both
// tokens and zones. Reports the final position on pointerup; the caller persists it.
function usePositionDrag(enabled, x, y, onDragEnd) {
  const ref = useRef(null);

  const handlePointerDown = (e) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    const container = ref.current.parentElement;
    const rect = container.getBoundingClientRect();

    const move = (ev) => {
      const nx = Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100));
      const ny = Math.min(100, Math.max(0, ((ev.clientY - rect.top) / rect.height) * 100));
      ref.current.style.left = `${nx}%`;
      ref.current.style.top = `${ny}%`;
      ref.current.dataset.x = nx;
      ref.current.dataset.y = ny;
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onDragEnd(parseFloat(ref.current.dataset.x ?? x), parseFloat(ref.current.dataset.y ?? y));
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return { ref, handlePointerDown };
}

function Token({ token, isGm, selected, onSelect, onDragEnd }) {
  const { ref, handlePointerDown } = usePositionDrag(isGm, token.x, token.y, (x, y) => onDragEnd(token.id, x, y));

  return (
    <div
      ref={ref}
      onPointerDown={handlePointerDown}
      onClick={(e) => {
        e.stopPropagation();
        isGm && onSelect(token);
      }}
      className={`absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 z-10 ${isGm ? 'cursor-move' : ''}`}
      style={{ left: `${token.x}%`, top: `${token.y}%` }}
    >
      <div
        className={`w-10 h-10 rounded-full border-2 shadow-lg bg-cover bg-center ${
          selected ? 'border-white ring-2 ring-[var(--accent)]' : 'border-white/80'
        } ${isGm && !token.visible_to_players ? 'opacity-40' : ''}`}
        style={{
          backgroundColor: token.color,
          backgroundImage: token.image_url ? `url(${token.image_url})` : undefined,
        }}
      />
      <span className="mt-1 px-1.5 py-0.5 text-[10px] rounded bg-black/60 text-white whitespace-nowrap">
        {token.label}
      </span>
    </div>
  );
}

// x/y is the anchor point: center for a circle, origin (apex/corner) for a rectangle/cone,
// which then extends along `rotation` degrees for `size`% (length) by `width`% (thickness).
function zoneShapeStyle(zone) {
  const ar = BOARD_ASPECT_RATIO;
  if (zone.shape === 'circle') {
    const d = zone.size * 2;
    return {
      left: `${zone.x}%`, top: `${zone.y}%`,
      width: `${d}%`, height: `${d * ar}%`,
      borderRadius: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }
  const base = {
    left: `${zone.x}%`, top: `${zone.y}%`,
    width: `${zone.size}%`, height: `${zone.width * ar}%`,
    transformOrigin: 'left center',
    transform: `translateY(-50%) rotate(${zone.rotation}deg)`,
  };
  if (zone.shape === 'cone') {
    return { ...base, clipPath: 'polygon(0% 50%, 100% 0%, 100% 100%)', border: 'none' };
  }
  return base; // rectangle
}

function Zone({ zone, isGm, selected, onSelect, onDragEnd }) {
  const { ref, handlePointerDown } = usePositionDrag(isGm, zone.x, zone.y, (x, y) => onDragEnd(zone.id, x, y));

  return (
    <div
      ref={ref}
      onPointerDown={handlePointerDown}
      onClick={(e) => {
        e.stopPropagation();
        isGm && onSelect(zone);
      }}
      className={`absolute ${isGm ? 'cursor-move' : 'pointer-events-none'}`}
      style={{
        ...zoneShapeStyle(zone),
        backgroundColor: zone.color,
        opacity: 0.35,
        border: zone.shape === 'cone' ? 'none' : `2px solid ${zone.color}`,
        outline: selected ? '2px solid white' : 'none',
      }}
    />
  );
}

/**
 * Renders the board surface: background image, optional grid overlay, zones, tokens.
 * isGm enables drag/select on tokens and zones; pass onSelectToken/onSelectZone as no-ops
 * (or omit) for a read-only view like the projector page.
 * className must include a position utility (relative/fixed/absolute) — the token/zone
 * children are positioned against it. Not hardcoded here: Tailwind's generated stylesheet
 * order (not the HTML class order) decides which position utility wins when two are both
 * applied, so a hardcoded "relative" here could silently beat a caller's "fixed".
 */
export default function BoardCanvas({
  board, isGm = false, className = '', style = {},
  selectedToken = null, onSelectToken = () => {}, onTokenDragEnd = () => {},
  selectedZone = null, onSelectZone = () => {}, onZoneDragEnd = () => {},
  onBackgroundClick = () => {},
}) {
  return (
    <div
      onClick={onBackgroundClick}
      className={`overflow-hidden bg-cover bg-center ${className}`}
      style={{
        backgroundImage: board.background_url ? `url(${board.background_url})` : undefined,
        ...style,
      }}
    >
      {!board.background_url && (
        <div className="absolute inset-0 flex items-center justify-center text-[var(--text-secondary)] text-sm">
          Aucun fond défini
        </div>
      )}
      {board.grid_visible && (
        <div className="absolute inset-0 pointer-events-none" style={gridBackgroundStyle(board.grid_size)} />
      )}
      {(board.zones || []).map((zone) => (
        <Zone
          key={zone.id}
          zone={zone}
          isGm={isGm}
          selected={selectedZone?.id === zone.id}
          onSelect={onSelectZone}
          onDragEnd={onZoneDragEnd}
        />
      ))}
      {board.tokens.map((token) => (
        <Token
          key={token.id}
          token={token}
          isGm={isGm}
          selected={selectedToken?.id === token.id}
          onSelect={onSelectToken}
          onDragEnd={onTokenDragEnd}
        />
      ))}
    </div>
  );
}
