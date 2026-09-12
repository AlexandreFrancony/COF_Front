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

// A filled bar with the numeric value written on top — used for PV/PM, which have a max.
// Falls back to a plain chip (no fill) for a flat resource like Chance, which has none.
function StatBar({ label, current, max, tone }) {
  if (max == null) {
    return (
      <div className="flex items-center justify-between gap-2 text-[10px] leading-none">
        <span className="opacity-70">{label}</span>
        <span className="font-semibold">{current}</span>
      </div>
    );
  }
  // Down/critical (<=0) is the single most urgent thing to spot at a glance during a fight —
  // an empty bar alone reads the same as "no data", so it gets its own unmistakable state.
  const isDown = current <= 0;
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const barColor = isDown ? 'bg-red-600' : tone === 'enemy' ? 'bg-red-500/70' : 'bg-[var(--accent)]';
  return (
    <div className={`relative w-28 h-4 rounded bg-black/40 overflow-hidden ${isDown ? 'ring-1 ring-red-500' : ''}`}>
      <div className={`absolute inset-y-0 left-0 ${barColor}`} style={{ width: isDown ? '100%' : `${pct}%` }} />
      <div className="absolute inset-0 flex items-center justify-between px-1.5 text-[10px] font-semibold text-white drop-shadow">
        <span>{label}</span>
        <span>{isDown ? 'K.O.' : `${current}/${max}`}</span>
      </div>
    </div>
  );
}

function HudCard({ entry, tone }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-black/55 backdrop-blur-sm text-white">
      <div
        className="w-8 h-8 shrink-0 rounded-full border border-white/50 bg-cover bg-center"
        style={{
          backgroundColor: entry.color || '#c65d3b',
          backgroundImage: entry.image_url ? `url(${entry.image_url})` : undefined,
        }}
      />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[11px] font-semibold leading-none truncate max-w-[9rem]" title={entry.character_name || entry.label}>
          {entry.character_name || entry.label}
        </span>
        <StatBar label="PV" current={entry.pv_current} max={entry.pv_max} tone={tone} />
        {entry.pm_max > 0 && <StatBar label="PM" current={entry.pm_current} max={entry.pm_max} tone={tone} />}
        <div className="flex gap-2 text-[10px] opacity-80">
          <span>Chance {entry.points_chance}</span>
          <span>Déf {entry.defense}</span>
          <span>Init {entry.initiative}</span>
        </div>
      </div>
    </div>
  );
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
 * Renders the board surface: background (image or looping muted video), optional grid
 * overlay, zones, tokens, and two corner HUD overlays (hudPlayers top-left, hudEnemies
 * top-right — each entry is a token enriched with its linked character's live stats).
 * isGm enables drag/select on tokens and zones; pass onSelectToken/onSelectZone as no-ops
 * (or omit) for a read-only view like the projector page. hudEnemies must never be passed
 * on a player-facing view (e.g. the projector) — the backend already strips a PNJ token's
 * stats for a player-role fetch, but the projector reuses the GM's own session, so it's the
 * caller's job to simply not forward enemy data there.
 * className must include a position utility (relative/fixed/absolute) — the token/zone/hud
 * children are positioned against it. Not hardcoded here: Tailwind's generated stylesheet
 * order (not the HTML class order) decides which position utility wins when two are both
 * applied, so a hardcoded "relative" here could silently beat a caller's "fixed".
 */
export default function BoardCanvas({
  board, isGm = false, className = '', style = {},
  selectedToken = null, onSelectToken = () => {}, onTokenDragEnd = () => {},
  selectedZone = null, onSelectZone = () => {}, onZoneDragEnd = () => {},
  onBackgroundClick = () => {},
  hudPlayers = null, hudEnemies = null,
}) {
  const isVideo = board.background_type === 'video' && board.background_url;
  return (
    <div
      onClick={onBackgroundClick}
      className={`overflow-hidden ${isVideo ? '' : 'bg-cover bg-center'} ${className}`}
      style={{
        backgroundImage: !isVideo && board.background_url ? `url(${board.background_url})` : undefined,
        ...style,
      }}
    >
      {isVideo && (
        <video
          key={board.background_url}
          src={board.background_url}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
        />
      )}
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
      {/* flex-wrap (column direction) starts a new column once max-h is reached, instead of
          silently clipping cards past the board's bottom edge when there are many characters. */}
      {hudPlayers?.length > 0 && (
        <div className="absolute top-2 left-2 bottom-2 z-20 flex flex-col flex-wrap content-start items-start gap-1.5 pointer-events-none">
          {hudPlayers.map((entry) => <HudCard key={entry.id} entry={entry} />)}
        </div>
      )}
      {hudEnemies?.length > 0 && (
        <div className="absolute top-2 right-2 bottom-2 z-20 flex flex-col flex-wrap-reverse content-start items-end gap-1.5 pointer-events-none">
          {hudEnemies.map((entry) => <HudCard key={entry.id} entry={entry} tone="enemy" />)}
        </div>
      )}
    </div>
  );
}
