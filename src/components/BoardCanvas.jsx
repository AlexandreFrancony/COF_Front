import { useRef, useState } from 'react';

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

// A pawn's own image_url (set directly on the token, e.g. a free-floating PNJ) always wins;
// falling back to its linked character's persistent avatar_url (a real photo) when the token
// itself has none, and finally to that character's avatar_emoji as a lightweight substitute —
// rendered as text since there's no image to use as a CSS background-image. Plain color/no
// avatar at all is the last resort (unchanged from before avatars existed).
function resolveAvatar(entry) {
  const imageUrl = entry.image_url || entry.character_avatar_url || null;
  const emoji = !imageUrl ? entry.character_avatar_emoji || null : null;
  return { imageUrl, emoji };
}

// hp_max set (non-null) marks a "creature pawn" — a GM-controlled construct/summon (e.g. a
// golem) that isn't a full character: no profil/voies/HUD card, just a life bar drawn right
// under its avatar. At 0 PV it's greyed out rather than removed — the GM decides when to
// actually take it off the board, same as a PNJ character token at 0 PV today.
function Token({ token, isGm, selected, onSelect, onDragEnd, size = 40 }) {
  const { ref, handlePointerDown } = usePositionDrag(isGm, token.x, token.y, (x, y) => onDragEnd(token.id, x, y));
  const { imageUrl, emoji } = resolveAvatar(token);
  const hasHp = token.hp_max != null;
  const destroyed = hasHp && token.hp_current <= 0;
  const hpPct = hasHp && token.hp_max > 0 ? Math.max(0, Math.min(100, (token.hp_current / token.hp_max) * 100)) : 0;
  const hpColor = hpPct >= 60 ? 'bg-emerald-500' : hpPct >= 30 ? 'bg-amber-500' : 'bg-red-500';

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
        className={`rounded-full border-2 shadow-lg bg-cover bg-center shrink-0 flex items-center justify-center ${
          selected ? 'border-white ring-2 ring-[var(--accent)]' : 'border-white/80'
        } ${(isGm && !token.visible_to_players) || destroyed ? 'opacity-40' : ''}`}
        style={{
          width: size, height: size,
          backgroundColor: token.color,
          backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
        }}
      >
        {emoji && <span style={{ fontSize: size * 0.55, lineHeight: 1 }}>{emoji}</span>}
      </div>
      {hasHp && (
        <div className="mt-0.5 h-1.5 rounded-full bg-black/50 overflow-hidden shrink-0" style={{ width: size * 0.8 }}>
          <div
            className={`h-full transition-[width,background-color] duration-300 ease-out ${destroyed ? 'bg-red-700' : hpColor}`}
            style={{ width: destroyed ? '100%' : `${hpPct}%` }}
          />
        </div>
      )}
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
// PV is colored by remaining-health tier (not by player/enemy — the left/right split and the
// card's own accent border already say who's who) so it reads as a wound gauge at a glance;
// PM gets its own distinct hue purely to be visually unmistakable from the PV row above it.
// Sized mobile-first (a phone viewer of the read-only board is a real target, and its canvas
// is only ~340px wide at 16:9) then grown at sm: for the GM's own desktop-sized canvas, where
// the extra room is free. Without this, a couple of stacked cards ate most of a phone-sized
// board and buried the pawns underneath them.
function StatBar({ label, current, max, kind = 'pv' }) {
  if (max == null) {
    return (
      <div className="flex items-center justify-between gap-1.5 sm:gap-2 text-[9px] sm:text-[10px] leading-none">
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
  else barColor = pct >= 60 ? 'bg-emerald-500' : pct >= 30 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className={`relative w-20 h-3.5 sm:w-28 sm:h-4 rounded bg-black/40 overflow-hidden ${isDown ? 'ring-1 ring-red-500' : ''}`}>
      <div
        className={`absolute inset-y-0 left-0 transition-[width,background-color] duration-300 ease-out ${barColor}`}
        style={{ width: isDown ? '100%' : `${pct}%` }}
      />
      <div className="absolute inset-0 flex items-center justify-between px-1 sm:px-1.5 text-[9px] sm:text-[10px] font-semibold text-white drop-shadow">
        <span>{label}</span>
        <span>{isDown ? 'K.O.' : `${current}/${max}`}</span>
      </div>
    </div>
  );
}

function HudCard({ entry, tone, selected, onClick }) {
  // Ties the card back to its pawn on the map: the token's own color when it has one, else a
  // sensible default per side (still distinguishes players from enemies at a glance).
  const accentColor = entry.color || (tone === 'enemy' ? '#ef4444' : '#c65d3b');
  const { imageUrl, emoji } = resolveAvatar(entry);
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-1.5 sm:gap-2 pl-1.5 pr-2 py-1 sm:pl-2 sm:pr-2.5 sm:py-1.5 rounded-lg border-l-[3px] sm:border-l-4 bg-black/55 backdrop-blur-sm text-white shadow-md ${
        onClick ? 'pointer-events-auto cursor-pointer' : ''
      } ${selected ? 'ring-2 ring-white' : ''}`}
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
        </span>
        <StatBar label="PV" current={entry.pv_current} max={entry.pv_max} kind="pv" />
        {entry.pm_max > 0 && <StatBar label="PM" current={entry.pm_current} max={entry.pm_max} kind="pm" />}
        <div className="flex gap-1.5 sm:gap-2 text-[9px] sm:text-[10px] opacity-80">
          <span>Chance {entry.points_chance}</span>
          <span>Déf {entry.defense}</span>
          <span>Init {entry.initiative}</span>
        </div>
      </div>
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
 * isGm enables drag/select on tokens and zones; pass onSelectToken/onSelectZone as no-ops
 * (or omit) for a read-only view like the projector page. hudEnemies must never be passed
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
}) {
  const isVideo = board.background_type === 'video' && board.background_url;
  const sceneStyle = cameraCrop ? cameraCropStyle(board) : { position: 'absolute', inset: 0 };

  return (
    <div onClick={onBackgroundClick} className={`overflow-hidden ${className}`} style={style}>
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
            onSelect={onSelectToken}
            onDragEnd={onTokenDragEnd}
            size={board.token_size || 40}
          />
        ))}
      </div>

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
            <HudCard
              key={entry.id}
              entry={entry}
              selected={selectedToken?.id === entry.id}
              onClick={isGm ? (e) => { e.stopPropagation(); onSelectToken(entry); } : undefined}
            />
          ))}
        </div>
      )}
      {hudEnemies?.length > 0 && (
        <div className="absolute top-2 right-2 bottom-2 z-40 flex flex-col flex-wrap-reverse content-start items-end gap-1.5 pointer-events-none">
          {hudEnemies.map((entry) => (
            <HudCard
              key={entry.id}
              entry={entry}
              tone="enemy"
              selected={selectedToken?.id === entry.id}
              onClick={isGm ? (e) => { e.stopPropagation(); onSelectToken(entry); } : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
