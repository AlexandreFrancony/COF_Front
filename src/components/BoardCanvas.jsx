import { useMemo, useRef, useState } from 'react';

// The board area's aspect ratio; background-size/shape percentages are relative to width and
// height separately, so a horizontal % needs a taller vertical % (by this ratio) to render as
// a visual square/circle instead of a stretched ellipse.
export const BOARD_ASPECT_RATIO = 16 / 9;

// Fog of war's own grid — independent from the tactical grid_size the GM sets for movement, and
// never adjustable: fine enough for a paintbrush without needing a real bitmap. 40 cols x 23
// rows renders as near-square cells at 16:9 (close enough for a brush, no need to be exact).
export const FOG_COLS = 40;
export const FOG_ROWS = 23;

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
// snapGridSize (tokens only, when the grid is actually visible) rounds the live position to the
// nearest cell as you drag — COF2 combat is played in cases (p.ex. portées/déplacements), so a
// pawn that only ever lands on a cell boundary matches the book's own math instead of a
// continuous %-position a player would have to eyeball against the grid lines.
function usePositionDrag(enabled, x, y, onDragEnd, snapGridSize = null) {
  const ref = useRef(null);

  const handlePointerDown = (e) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    const container = ref.current.parentElement;
    const rect = container.getBoundingClientRect();

    const move = (ev) => {
      let nx = Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100));
      let ny = Math.min(100, Math.max(0, ((ev.clientY - rect.top) / rect.height) * 100));
      if (snapGridSize) {
        const cellX = 100 / snapGridSize;
        const cellY = cellX * BOARD_ASPECT_RATIO;
        nx = Math.min(100, Math.max(0, Math.round(nx / cellX) * cellX));
        ny = Math.min(100, Math.max(0, Math.round(ny / cellY) * cellY));
      }
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

// A brush touches a small neighborhood of cells around the pointer, not just the exact one under
// it — a single-cell brush would make revealing an actual room tediously slow. radius 1 means
// "just this cell", 2 means a 3x3 block, etc.
function cellsNearPointer(col, row, radius) {
  const cells = [];
  for (let dr = -(radius - 1); dr <= radius - 1; dr++) {
    for (let dc = -(radius - 1); dc <= radius - 1; dc++) {
      const r = row + dr, c = col + dc;
      if (r >= 0 && r < FOG_ROWS && c >= 0 && c < FOG_COLS) cells.push(r * FOG_COLS + c);
    }
  }
  return cells;
}

// Fog painting: tracks cells touched during one continuous drag purely client-side (no request
// per cell — see board.js's PATCH docstring), rendering them immediately via `pending` so the
// brush feels responsive, then reports the full touched set once on release for the caller to
// merge into fog_revealed and persist. Mirrors usePositionDrag's own "report once, on pointerup"
// shape, but paints a set of cells instead of dragging one marker.
function useFogPaint(editable, brushRadius, onCommit) {
  const containerRef = useRef(null);
  const [pending, setPending] = useState(() => new Set());
  const touchedRef = useRef(new Set());

  const paintAt = (clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * FOG_COLS);
    const row = Math.floor(((clientY - rect.top) / rect.height) * FOG_ROWS);
    let changed = false;
    for (const idx of cellsNearPointer(col, row, brushRadius)) {
      if (!touchedRef.current.has(idx)) {
        touchedRef.current.add(idx);
        changed = true;
      }
    }
    if (changed) setPending(new Set(touchedRef.current));
  };

  const handlePointerDown = (e) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    touchedRef.current = new Set();
    paintAt(e.clientX, e.clientY);

    const move = (ev) => paintAt(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (touchedRef.current.size > 0) onCommit([...touchedRef.current]);
      touchedRef.current = new Set();
      setPending(new Set());
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return { containerRef, pending, handlePointerDown };
}

// Renders only the UNREVEALED cells (a revealed one has literally no element — nothing to draw),
// so the DOM shrinks as the GM reveals more of the map instead of growing. `ghost` is the GM's
// own view: semi-transparent, since they still need to see what they're painting over; everyone
// else gets a fully opaque cell, hiding the scene (and any token standing on it) completely.
// Only captures pointer events while `editable` (the GM armed the paint brush) — otherwise clicks
// pass straight through to whatever pawn/zone is underneath, same as if this layer didn't exist.
function FogLayer({ board, isGm, editable, brushMode, brushRadius, onPaint }) {
  const revealed = useMemo(() => new Set(board.fog_revealed || []), [board.fog_revealed]);
  const { containerRef, pending, handlePointerDown } = useFogPaint(editable, brushRadius, (cells) => onPaint(cells, brushMode));
  const ghost = isGm;

  const cells = [];
  for (let row = 0; row < FOG_ROWS; row++) {
    for (let col = 0; col < FOG_COLS; col++) {
      const idx = row * FOG_COLS + col;
      // A cell touched during the current drag previews what release will actually do (cleared
      // for 'reveal', covered for 'hide'); everything else keeps its current persisted state —
      // switching brush mode must never itself change how untouched cells look.
      const isPending = pending.has(idx);
      const covered = isPending ? brushMode === 'hide' : !revealed.has(idx);
      if (!covered) continue;
      cells.push(
        <div
          key={idx}
          style={{
            position: 'absolute',
            left: `${(col / FOG_COLS) * 100}%`, top: `${(row / FOG_ROWS) * 100}%`,
            width: `${100 / FOG_COLS}%`, height: `${100 / FOG_ROWS}%`,
            background: ghost ? 'rgba(0,0,0,0.55)' : '#000',
          }}
        />
      );
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      className="absolute inset-0 z-[15]"
      style={{ pointerEvents: editable ? 'auto' : 'none', cursor: editable ? 'crosshair' : undefined }}
      onClick={(e) => e.stopPropagation()}
    >
      {cells}
    </div>
  );
}

// Freehand drawing: same "track locally while dragging, report once on release" shape as
// useFogPaint, but the caller (BoardEditor.jsx / Board.jsx's player view) persists the finished
// stroke itself (POST /board/drawings) rather than merging into a larger object — a stroke never
// needs to know about any other stroke.
function useDrawPaint(editable, color, onCommit) {
  const containerRef = useRef(null);
  const [livePoints, setLivePoints] = useState(null);
  const pointsRef = useRef([]);

  const handlePointerDown = (e) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const toPoint = (ev) => ({
      x: ((ev.clientX - rect.left) / rect.width) * 100,
      y: ((ev.clientY - rect.top) / rect.height) * 100,
    });
    pointsRef.current = [toPoint(e)];
    setLivePoints(pointsRef.current);

    const move = (ev) => {
      pointsRef.current = [...pointsRef.current, toPoint(ev)];
      setLivePoints(pointsRef.current);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (pointsRef.current.length >= 2) onCommit(pointsRef.current, color);
      pointsRef.current = [];
      setLivePoints(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return { containerRef, livePoints, handlePointerDown };
}

// Renders every already-committed stroke (board.drawings — everyone gets the same array, GM or
// player) plus, while `editable`, the in-progress one as it's drawn. viewBox 0 0 100 100 makes
// the 0-100 scene coordinates map directly to SVG user units, so a stroke drawn at the GM's full
// scene scale still lines up correctly once the projector's cameraCrop transform is applied to
// this same SVG (it lives inside the cropped scene container, not layered on top of it).
function DrawingLayer({ drawings, editable, color, onDraw }) {
  const { containerRef, livePoints, handlePointerDown } = useDrawPaint(editable, color, onDraw);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 z-20 w-full h-full"
      style={{ pointerEvents: editable ? 'auto' : 'none', cursor: editable ? 'crosshair' : undefined }}
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
    >
      {(drawings || []).map((stroke, i) => (
        <polyline
          key={i}
          points={stroke.points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={stroke.color || '#ef4444'}
          strokeWidth={0.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {livePoints?.length > 1 && (
        <polyline
          points={livePoints.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={0.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />
      )}
    </svg>
  );
}

// A single image shown full-screen over the scene — a letter, an NPC portrait, a map excerpt —
// on the player/projector views only (the caller never renders this for the GM's own canvas, so
// their working view of the live map is never interrupted by what they're currently showing).
function HandoutOverlay({ url }) {
  return (
    <div className="absolute inset-0 z-[45] bg-black flex items-center justify-center">
      <img src={url} alt="" className="max-w-full max-h-full object-contain" />
    </div>
  );
}

// A pawn's own image_url (set directly on the token, e.g. a free-floating PNJ) always wins;
// falling back to its linked character's persistent avatar_url (a real photo), then a bestiary
// monster's own uploaded image_url (joined live, same reasoning as its other stats — a later
// upload reaches every pawn already spawned from that entry) when the token itself has none.
// Failing an image entirely, falls back to an emoji: the character's own avatar_emoji, or the
// monster's own default emoji (seeded per bestiary entry so a spawned pawn never just shows a
// blank color circle) — rendered as text since there's no image to use as a CSS background.
// This is purely the pawn's visual identity, never stripped from a player-role fetch even when
// its numeric stats (hide_hp_from_players) are — a token with no face defeats the point of it
// being on a map at all.
export function resolveAvatar(entry) {
  const imageUrl = entry.image_url || entry.character_avatar_url || entry.monstre_image_url || null;
  const emoji = !imageUrl ? entry.character_avatar_emoji || entry.monstre_emoji || null : null;
  return { imageUrl, emoji };
}

// hp_max set (non-null) marks a "creature pawn" — a GM-controlled construct/summon (e.g. a
// golem) that isn't a full character: no profil/voies/HUD card, just a life bar drawn right
// under its avatar. At 0 PV it's greyed out rather than removed — the GM decides when to
// actually take it off the board, same as a PNJ character token at 0 PV today.
// When the GM marked the pawn hide_hp_from_players, the backend already nulls hp_current/
// hp_max for a player-role fetch (board.js's stripEnemyStats) — so hasHp is only ever true here
// for the GM's own view of that pawn. player_hp_label (never stripped) is the GM's opt-in
// replacement a player sees instead — a small static badge, not a bar, since there's nothing
// numeric behind it for them.
function Token({ token, isGm, selected, active, gridSize, onSelect, onDragEnd, size = 40 }) {
  const { ref, handlePointerDown } = usePositionDrag(
    isGm, token.x, token.y, (x, y) => onDragEnd(token.id, x, y), gridSize
  );
  const { imageUrl, emoji } = resolveAvatar(token);
  const hasHp = token.hp_max != null;
  const showPlayerLabel = !hasHp && token.player_hp_label;
  const destroyed = hasHp && token.hp_current <= 0;
  const hpPct = hasHp && token.hp_max > 0 ? Math.max(0, Math.min(100, (token.hp_current / token.hp_max) * 100)) : 0;
  const hpColor = hpPct >= 60 ? 'bg-emerald-500' : hpPct >= 30 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div
      ref={ref}
      onPointerDown={handlePointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(token);
      }}
      className={`absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 z-10 ${isGm ? 'cursor-move' : 'cursor-pointer'}`}
      style={{ left: `${token.x}%`, top: `${token.y}%` }}
    >
      <div
        className={`rounded-full border-2 shadow-lg bg-cover bg-center shrink-0 flex items-center justify-center ${
          selected ? 'border-white ring-2 ring-[var(--accent)]' : 'border-white/80'
        } ${(isGm && !token.visible_to_players) || destroyed ? 'opacity-40' : ''} ${active ? 'turn-active' : ''}`}
        style={{
          width: size, height: size,
          backgroundColor: token.color,
          backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
        }}
      >
        {emoji && <span style={{ fontSize: size * 0.55, lineHeight: 1 }}>{emoji}</span>}
      </div>
      {token.status_icons?.length > 0 && (
        <div className="flex gap-0.5 -mt-1 leading-none" style={{ fontSize: Math.max(11, size * 0.4) }}>
          {token.status_icons.map((icon, i) => <span key={i}>{icon}</span>)}
        </div>
      )}
      {hasHp && (
        <div className="mt-0.5 h-1.5 rounded-full bg-black/50 overflow-hidden shrink-0" style={{ width: size * 0.8 }}>
          <div
            className={`h-full transition-[width,background-color] duration-300 ease-out ${destroyed ? 'bg-red-700' : hpColor}`}
            style={{ width: destroyed ? '100%' : `${hpPct}%` }}
          />
        </div>
      )}
      {showPlayerLabel && (
        <span className="mt-0.5 px-1.5 py-0.5 text-[10px] leading-none rounded bg-black/60 text-white whitespace-nowrap">
          {token.player_hp_label}
        </span>
      )}
      <span className="mt-1 px-1.5 py-0.5 text-[10px] rounded bg-black/60 text-white whitespace-nowrap">
        {token.label}{isGm && token.hide_hp_from_players ? ' 🙈' : ''}
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
// PV is colored by remaining-health tier (not by player/enemy — the left/right split and the
// card's own accent border already say who's who) so it reads as a wound gauge at a glance;
// PM gets its own distinct hue purely to be visually unmistakable from the PV row above it.
// Sized mobile-first (a phone viewer of the read-only board is a real target, and its canvas
// is only ~340px wide at 16:9) then grown at sm: for the GM's own desktop-sized canvas, where
// the extra room is free. Without this, a couple of stacked cards ate most of a phone-sized
// board and buried the pawns underneath them.
// barClassName/textClassName default to the tiny HUD-card sizing but are overridable — the
// board's own summary card (CharacterSummaryCard.jsx) reuses this exact same bar, just bigger,
// rather than re-deriving the same color/K.O. logic a second time.
export function StatBar({
  label, current, max, kind = 'pv',
  barClassName = 'w-20 h-3.5 sm:w-28 sm:h-4', textClassName = 'text-[9px] sm:text-[10px]',
}) {
  if (max == null) {
    return (
      <div className={`flex items-center justify-between gap-1.5 sm:gap-2 ${textClassName} leading-none`}>
        <span className="opacity-70">{label}</span>
        <span className="font-semibold">{current}</span>
      </div>
    );
  }
  // 0 PV is the single most urgent thing to spot at a glance during a fight, so it gets its
  // own unmistakable full-red "K.O." state. 0 PM doesn't get that treatment at all — running
  // out of mana isn't being down, so it just reads as a normal empty bar (0% width, no alarm
  // color/ring), same as any other resource at its floor.
  const isDown = current <= 0 && kind === 'pv';
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  let barColor;
  if (isDown) barColor = 'bg-red-600';
  else if (kind === 'pm') barColor = 'bg-indigo-400';
  else if (kind === 'chance') barColor = 'bg-amber-400';
  else barColor = pct >= 60 ? 'bg-emerald-500' : pct >= 30 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className={`relative ${barClassName} rounded bg-black/40 overflow-hidden ${isDown ? 'ring-1 ring-red-500' : ''}`}>
      <div
        className={`absolute inset-y-0 left-0 transition-[width,background-color] duration-300 ease-out ${barColor}`}
        style={{ width: isDown ? '100%' : `${pct}%` }}
      />
      <div className={`absolute inset-0 flex items-center justify-between px-1 sm:px-1.5 ${textClassName} font-semibold text-white drop-shadow`}>
        <span>{label}</span>
        <span>{isDown ? 'K.O.' : `${current}/${max}`}</span>
      </div>
    </div>
  );
}

function HudCard({ entry, tone, selected, active, onClick }) {
  // Ties the card back to its pawn on the map: the token's own color when it has one, else a
  // sensible default per side (still distinguishes players from enemies at a glance).
  const accentColor = entry.color || (tone === 'enemy' ? '#ef4444' : '#c65d3b');
  const { imageUrl, emoji } = resolveAvatar(entry);
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-1.5 sm:gap-2 pl-1.5 pr-2 py-1 sm:pl-2 sm:pr-2.5 sm:py-1.5 rounded-lg border-l-[3px] sm:border-l-4 bg-black/55 backdrop-blur-sm text-white shadow-md ${
        onClick ? 'pointer-events-auto cursor-pointer' : ''
      } ${selected ? 'ring-2 ring-white' : ''} ${active ? 'turn-active' : ''}`}
      style={{ borderLeftColor: accentColor }}
    >
      <div
        className="w-6 h-6 sm:w-8 sm:h-8 shrink-0 rounded-full border border-white/50 bg-cover bg-center flex items-center justify-center"
        style={{
          backgroundColor: entry.color || '#c65d3b',
          backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
        }}
      >
        {emoji && <span style={{ fontSize: 13, lineHeight: 1 }}>{emoji}</span>}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[10px] sm:text-[11px] font-semibold leading-none truncate max-w-[5.5rem] sm:max-w-[9rem]" title={entry.character_name || entry.label}>
          {entry.character_name || entry.label}
          {entry.status_icons?.length > 0 && <span className="ml-1">{entry.status_icons.join('')}</span>}
        </span>
        <StatBar label="PV" current={entry.pv_current} max={entry.pv_max} kind="pv" />
        {entry.pm_max > 0 && <StatBar label="PM" current={entry.pm_current} max={entry.pm_max} kind="pm" />}
        <div className="flex flex-wrap gap-x-1.5 sm:gap-x-2 gap-y-0.5 text-[9px] sm:text-[10px] opacity-80">
          <span className="whitespace-nowrap">🍀 {entry.points_chance_current}/{entry.points_chance}</span>
          <span className="whitespace-nowrap">🛡️ {entry.defense}</span>
          <span className="whitespace-nowrap">⚡ {entry.initiative}</span>
        </div>
      </div>
    </div>
  );
}

// A creature pawn's own bar, nested under its owner's HudCard — smaller and offset to read as
// "belongs to the card above" rather than a peer entry. Only the PV bar, not a full HudCard:
// the richer stats (DEF/attack, both owner-derived) live in CreatureSummaryCard once selected,
// this is just the at-a-glance life gauge next to the owner it's fighting alongside.
function CreatureHudChip({ entry, selected, onClick, offsetClassName = 'ml-3 sm:ml-4' }) {
  return (
    <div
      onClick={onClick}
      className={`${offsetClassName} flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-lg border-l-[3px] bg-black/45 backdrop-blur-sm text-white shadow ${
        onClick ? 'pointer-events-auto cursor-pointer' : ''
      } ${selected ? 'ring-2 ring-white' : ''}`}
      style={{ borderLeftColor: entry.color || '#8a8a8a' }}
    >
      <span className="text-[10px] sm:text-xs leading-none">🗿</span>
      <span className="text-[9px] sm:text-[10px] truncate max-w-[4rem] sm:max-w-[6rem]" title={entry.label}>
        {entry.label}
      </span>
      <StatBar
        label="PV" current={entry.hp_current} max={entry.hp_max} kind="pv"
        barClassName="w-14 h-3 sm:w-20 sm:h-3.5" textClassName="text-[8px] sm:text-[9px]"
      />
    </div>
  );
}

// The camera is a square window (in %, always camera_width tall too — see the schema comment
// in board.js: the scene and the projector output share the same 16:9 ratio, so a window w%
// wide is exactly w% tall, no BOARD_ASPECT_RATIO correction needed like board_zones' shapes).
// The rectangle itself never intercepts clicks (pointer-events-none) — it sits above the
// tokens/zones layer (z-30 vs z-10) and, once resized to cover a good chunk of the board,
// would otherwise silently steal every click meant for a pawn or zone underneath it, no
// matter what's selected. Only two small handles are interactive: the "🎥 Cadre projeté" tag
// (top-left corner) to select/move the frame, and a round handle (bottom-right corner, shown
// only once selected) to resize it — everything else about the rectangle stays inert.
//
// Both handles drive a local `live` state instead of writing straight into board.camera_* —
// dragging otherwise only moved the handle itself (a raw DOM mutation, see usePositionDrag)
// while the rectangle stayed put until the drag-end API call round-tripped, so the frame
// visibly lagged a beat behind the cursor. Tracking the in-progress x/y/w locally lets the
// rectangle follow the gesture live; onDragEnd/onResizeEnd (the actual persistence) still only
// fires once, on release.
function CameraFrame({ board, selected, onSelect, onDragEnd, onResizeEnd }) {
  const [live, setLive] = useState(null); // { x, y, w } while actively dragging/resizing
  const x = live?.x ?? board.camera_x ?? 50;
  const y = live?.y ?? board.camera_y ?? 50;
  const w = live?.w ?? board.camera_width ?? 100;
  const cornerX = x - w / 2;
  const cornerY = y - w / 2;

  // mode 'move' drags the tag (changes x/y, keeps w); 'resize' drags the corner handle
  // (keeps the center x/y fixed, changes w to twice the handle's distance from center).
  const startDrag = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    const container = e.currentTarget.parentElement;
    const rect = container.getBoundingClientRect();
    const startX = x, startY = y, startW = w;
    let final = { x: startX, y: startY, w: startW };

    const move = (ev) => {
      const px = Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100));
      const py = Math.min(100, Math.max(0, ((ev.clientY - rect.top) / rect.height) * 100));
      if (mode === 'move') {
        final = { x: px, y: py, w: startW };
      } else {
        const nw = Math.max(10, Math.min(100, Math.max(px - startX, py - startY) * 2));
        final = { x: startX, y: startY, w: nw };
      }
      setLive(final);
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setLive(null);
      if (mode === 'move') onDragEnd(final.x, final.y);
      else onResizeEnd(final.w);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <>
      <div
        className={`absolute -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none border-2 border-dashed ${
          selected ? 'border-white' : 'border-white/60'
        }`}
        style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${w}%` }}
      />
      <span
        onPointerDown={(e) => startDrag(e, 'move')}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className="absolute z-30 -translate-y-full cursor-move px-1.5 py-0.5 text-[10px] rounded bg-black/70 text-white whitespace-nowrap"
        style={{ left: `${cornerX}%`, top: `calc(${cornerY}% - 4px)` }}
      >
        🎥 Cadre projeté
      </span>
      {selected && (
        <span
          onPointerDown={(e) => startDrag(e, 'resize')}
          onClick={(e) => e.stopPropagation()}
          className="absolute z-30 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-[var(--accent)] cursor-nwse-resize shadow"
          style={{ left: `${cornerX + w}%`, top: `${cornerY + w}%` }}
          title="Redimensionner le cadre projeté"
        />
      )}
    </>
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

// A transient "look here" marker (see BoardEditor.jsx's pointer tool) — purely decorative,
// never intercepts clicks, removed by the caller a moment after it appears (see the ping-ring
// animation in index.css for the actual fade/expand timing).
function Ping({ x, y }) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <div className="w-10 h-10 rounded-full border-4 border-amber-400 ping-marker" />
    </div>
  );
}

// Maps the scene's camera window ((camera_x, camera_y) center, camera_width wide/tall, all in
// % of the full scene) onto a transform that crops+scales the scene to fill its container.
// Derivation: scale S = 100/camera_width; with transform-origin at 0 0, `scale(S)` alone maps
// a point at (x%, y%) to (S·x, S·y) in the same %-of-container units, then `translate(tx%, ty%)`
// (itself resolved against the container's own, pre-scale size) shifts it to (S·x+tx, S·y+ty).
// Solving for the camera's center to land at the container's center (50, 50) gives tx/ty below.
function cameraCropStyle(board) {
  const w = board.camera_width ?? 100;
  const cx = board.camera_x ?? 50;
  const cy = board.camera_y ?? 50;
  const scale = 100 / w;
  return {
    position: 'absolute',
    inset: 0,
    transformOrigin: '0 0',
    transform: `translate(${50 - scale * cx}%, ${50 - scale * cy}%) scale(${scale})`,
  };
}

/**
 * Renders the board surface: background (image or looping muted video), optional grid
 * overlay, zones, tokens, and two corner HUD overlays (hudPlayers top-left, hudEnemies
 * top-right — each entry is a token enriched with its linked character's live stats).
 * isGm enables drag on tokens and zones, and select on zones; token selection (pawn or its HUD
 * card) always works regardless of isGm — a read-only viewer can still click a character to
 * open its summary card (see CharacterSummaryCard.jsx), same data already in its own HUD, just
 * bigger. Pass onSelectToken/onSelectZone as no-ops (or omit) for a view with no side panel to
 * react to a selection, like the projector page. hudEnemies must never be passed
 * on a player-facing view (e.g. the projector) — the backend already strips a PNJ token's
 * stats for a player-role fetch, but the projector reuses the GM's own session, so it's the
 * caller's job to simply not forward enemy data there.
 *
 * Camera: the GM always sees the full scene (cameraCrop=false, the default) — showCameraFrame
 * additionally draws the projected window as a rectangle so the GM can see exactly what's
 * framed while working on the rest of the map. That rectangle is purely visual and never
 * intercepts clicks — only its small "🎥 Cadre projeté" corner tag is draggable/clickable —
 * so it never blocks reaching a pawn or zone it happens to be covering. The projector instead
 * passes cameraCrop=true, which crops+scales the whole scene (background/grid/zones/tokens,
 * NOT the HUD or the frame itself) down to just that window filling the screen.
 *
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
  cameraCrop = false,
  showCameraFrame = false, cameraSelected = false, onSelectCamera = () => {}, onCameraDragEnd = () => {},
  onCameraResizeEnd = () => {},
  pings = [], pingMode = false, onPing = () => {},
  fogMode = false, fogBrushMode = 'reveal', fogBrushRadius = 2, onFogPaint = () => {},
  drawMode = false, drawColor = '#ef4444', onDraw = () => {},
}) {
  const isVideo = board.background_type === 'video' && board.background_url;
  const sceneStyle = cameraCrop ? cameraCropStyle(board) : { position: 'absolute', inset: 0 };
  // Only meaningful once the GM has actually started a turn order (initiative_current_token_id
  // set) and chosen to show it at all (initiative_visible) — matches the InitiativeTracker's
  // own visibility gate, so the glow never appears without the tracker it's an extension of.
  const activeTokenId = board.initiative_visible ? board.initiative_current_token_id : null;

  // Creature pawns (hp_max set) tied to an owner — nested right under that owner's HudCard
  // instead of their own top-level entry, so a golem reads as "belongs to this character"
  // rather than a peer combatant in the corner HUD.
  const creaturesByOwner = {};
  for (const t of board.tokens) {
    if (t.hp_max != null && t.owner_character_id != null) {
      (creaturesByOwner[t.owner_character_id] ??= []).push(t);
    }
  }

  // Pointer tool (BoardEditor.jsx's "📍 Pointeur" toggle): the next click anywhere on the scene
  // broadcasts a ping instead of the usual deselect-everything background click.
  const handleClick = (e) => {
    if (!pingMode) return onBackgroundClick();
    const rect = e.currentTarget.getBoundingClientRect();
    onPing(((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100);
  };

  return (
    <div onClick={handleClick} className={`overflow-hidden ${className} ${pingMode ? 'cursor-crosshair' : ''}`} style={style}>
      <div
        // contain (not cover): a background must always show in full at its native aspect —
        // cover would zoom-crop a portrait source (a letter, a vertical handout) down to a
        // thin vertical strip, losing most of its content, just to fill the fixed 16:9 box.
        className={isVideo ? '' : 'bg-contain bg-center bg-no-repeat'}
        style={{
          ...sceneStyle,
          backgroundImage: !isVideo && board.background_url ? `url(${board.background_url})` : undefined,
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
            active={token.id === activeTokenId}
            gridSize={board.grid_visible ? board.grid_size : null}
            onSelect={onSelectToken}
            onDragEnd={onTokenDragEnd}
            size={board.token_size || 40}
          />
        ))}
        {board.fog_enabled && (
          <FogLayer
            board={board}
            isGm={isGm}
            editable={isGm && fogMode}
            brushMode={fogBrushMode}
            brushRadius={fogBrushRadius}
            onPaint={onFogPaint}
          />
        )}
        {(board.drawings?.length > 0 || drawMode) && (
          <DrawingLayer drawings={board.drawings} editable={drawMode} color={drawColor} onDraw={onDraw} />
        )}
        {pings.map((ping) => <Ping key={ping.id} x={ping.x} y={ping.y} />)}
      </div>

      {!isGm && board.handout_url && <HandoutOverlay url={board.handout_url} />}

      {showCameraFrame && (
        <CameraFrame
          board={board}
          selected={cameraSelected}
          onSelect={onSelectCamera}
          onDragEnd={onCameraDragEnd}
          onResizeEnd={onCameraResizeEnd}
        />
      )}

      {/* flex-wrap (column direction) starts a new column once max-h is reached, instead of
          silently clipping cards past the board's bottom edge when there are many characters.
          z-40 (above the camera frame's z-30) so a card is always clickable to select its pawn,
          even when the frame is resized to cover that corner of the board. */}
      {hudPlayers?.length > 0 && (
        <div className="absolute top-2 left-2 bottom-2 z-40 flex flex-col flex-wrap content-start items-start gap-1.5 pointer-events-none">
          {hudPlayers.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-1">
              <HudCard
                entry={entry}
                selected={selectedToken?.id === entry.id}
                active={entry.id === activeTokenId}
                onClick={(e) => { e.stopPropagation(); onSelectToken(entry); }}
              />
              {creaturesByOwner[entry.character_id]?.map((creature) => (
                <CreatureHudChip
                  key={creature.id}
                  entry={creature}
                  selected={selectedToken?.id === creature.id}
                  onClick={(e) => { e.stopPropagation(); onSelectToken(creature); }}
                  offsetClassName="ml-3 sm:ml-4"
                />
              ))}
            </div>
          ))}
        </div>
      )}
      {hudEnemies?.length > 0 && (
        <div className="absolute top-2 right-2 bottom-2 z-40 flex flex-col flex-wrap-reverse content-start items-end gap-1.5 pointer-events-none">
          {hudEnemies.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-1 items-end">
              <HudCard
                entry={entry}
                tone="enemy"
                selected={selectedToken?.id === entry.id}
                active={entry.id === activeTokenId}
                onClick={(e) => { e.stopPropagation(); onSelectToken(entry); }}
              />
              {creaturesByOwner[entry.character_id]?.map((creature) => (
                <CreatureHudChip
                  key={creature.id}
                  entry={creature}
                  selected={selectedToken?.id === creature.id}
                  onClick={(e) => { e.stopPropagation(); onSelectToken(creature); }}
                  offsetClassName="mr-3 sm:mr-4"
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
