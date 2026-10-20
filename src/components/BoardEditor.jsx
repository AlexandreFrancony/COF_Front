import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import BoardCanvas, { BOARD_DRAG_MIME, FOG_COLS, FOG_ROWS, playerSafeBoard } from './BoardCanvas';
import CharacterSummaryCard from './CharacterSummaryCard';
import CreatureSummaryCard from './CreatureSummaryCard';
import InitiativeTracker from './InitiativeTracker';
import Kbd from './Kbd';
import { getMonstres, updateMonstre, uploadMonstreImage } from '../utils/api';
import { hpDelta, parseHpInput } from '../utils/hp';

const ZONE_SHAPES = [
  ['circle', 'Cercle'],
  ['cone', 'Cône'],
  ['rectangle', 'Ligne / rectangle'],
];

const MONSTRE_CATEGORY_LABELS = {
  humanoide: 'Humanoïdes', animal: 'Animaux', fantastique: 'Créatures fantastiques',
  calice_ch2: 'Calice Chapitre 2',
};

// Spreads N freshly-spawned pawns around a center point in a rough grid instead of stacking
// them exactly on top of each other (they'd otherwise all land on the same spot and hide behind
// one another until the GM drags each one apart by hand). Clamped to stay inside the board
// (5-95%) even for a largeish group.
function spreadPositions(n, centerX = 50, centerY = 50, spacing = 7) {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const positions = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: Math.min(95, Math.max(5, centerX + (col - (cols - 1) / 2) * spacing)),
      y: Math.min(95, Math.max(5, centerY + (row - (rows - 1) / 2) * spacing)),
    });
  }
  return positions;
}

const clampPct = (v) => Math.min(100, Math.max(0, v));

// A handful of common COF2 combat conditions, not an exhaustive list — the free-text field next
// to these covers anything else. Toggle presence in the selected token's own status_icons array.
const STATUS_PRESETS = [
  ['🤢', 'Empoisonné'], ['🔥', 'Enflammé'], ['💫', 'Étourdi'],
  ['😱', 'Effrayé'], ['⛓️', 'Entravé'], ['🛌', 'À terre'],
];

const LIBRARY_TABS = [
  ['ennemis', '🗡️ Ennemis'],
  ['personnages', '🧙 Personnages'],
  ['fonds', '🖼️ Fonds'],
  ['documents', '📄 Documents', true],
  ['musique', '🎵 Musique', true],
];

const btn = 'px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]';
const smallBtn = 'w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)]';
const active = 'bg-[var(--accent)] text-white border-[var(--accent)]';

function RailButton({ icon, label, kbd, isActive = false, onClick, title, danger = false }) {
  return (
    <button
      onClick={onClick}
      title={title || label}
      className={`relative w-full flex flex-col items-center gap-0.5 py-1.5 rounded border text-[10px] leading-tight ${
        isActive ? active : danger ? 'border-transparent hover:border-red-400 hover:text-red-500' : 'border-transparent hover:border-[var(--accent)]'
      }`}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span>{label}</span>
      {kbd && <span className="absolute top-0.5 right-0.5 text-[8px] font-mono opacity-60">{kbd}</span>}
    </button>
  );
}

// Everything that can be done to one pawn or a whole selection at once: PV, visibility, states,
// duplicate, delete. Shared by the right-click menu (next to the pawn) and the side panel, so
// both always offer the exact same actions.
function SelectionActions({ tokens, onHp, onSetVisible, onToggleStatus, onDuplicate, onDelete, withStates }) {
  const [hpText, setHpText] = useState('');
  const withHp = tokens.filter((t) => t.hp_max != null);
  const anyHidden = tokens.some((t) => !t.visible_to_players);
  const duplicable = tokens.filter((t) => t.character_id == null);

  const submitHp = (e) => {
    e.preventDefault();
    const parsed = parseHpInput(hpText);
    if (!parsed) return toast.error('Écris 12 (dégâts), +5 (soin) ou =20 (nouvelle valeur)');
    onHp(withHp, parsed);
    setHpText('');
  };

  return (
    <div className="flex flex-col gap-2.5">
      {withHp.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--text-secondary)]">
            PV {withHp.length === 1 ? `${withHp[0].hp_current}/${withHp[0].hp_max}` : `(${withHp.length} pions)`}
          </span>
          <div className="flex gap-1">
            {[-5, -1, 1, 5].map((d) => (
              <button key={d} onClick={() => onHp(withHp, { delta: d })} className={`${smallBtn} w-9 text-xs`}>
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
          </div>
          <form onSubmit={submitHp} className="flex gap-1">
            <input
              type="text"
              inputMode="numeric"
              value={hpText}
              onChange={(e) => setHpText(e.target.value)}
              placeholder="12 dégâts · +5 soin · =20"
              className="flex-1 min-w-0 px-2 py-1 text-sm rounded bg-[var(--bg-input)] border border-[var(--border)]"
            />
            <button type="submit" className="px-2 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]">OK</button>
          </form>
        </div>
      )}

      <button onClick={() => onSetVisible(tokens, anyHidden)} className={btn}>
        {anyHidden ? '👁️ Montrer aux joueurs' : '🙈 Cacher aux joueurs'}<Kbd>H</Kbd>
      </button>

      {withStates && (
        <div className="flex flex-wrap gap-1">
          {STATUS_PRESETS.map(([icon, name]) => {
            const all = tokens.every((t) => t.status_icons?.includes(icon));
            return (
              <button
                key={icon}
                onClick={() => onToggleStatus(tokens, icon)}
                title={name}
                className={`w-8 h-8 text-base rounded border hover:border-[var(--accent)] ${all ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)]'}`}
              >
                {icon}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-1.5">
        {duplicable.length > 0 && (
          <button onClick={() => onDuplicate(duplicable)} className={`${btn} flex-1`}>📋 Dupliquer</button>
        )}
        <button onClick={() => onDelete(tokens)} className="flex-1 px-3 py-1.5 text-sm rounded border border-red-400 text-red-500 hover:bg-red-500/10">
          🗑️ Supprimer<Kbd>Suppr</Kbd>
        </button>
      </div>
    </div>
  );
}

/**
 * The full GM board-editing UI. Layout (2026-10-20 redesign, from the GM's own "it's laborious
 * to find things" feedback): the board takes the whole height; game tools live in a vertical
 * rail on its left, libraries (enemies, characters, backgrounds, documents, music) in a drawer
 * that slides over the board's right side instead of pushing the board down, the side panel
 * shows the selection (or the pawns on the scene when nothing is selected), and a right-click
 * on a pawn opens the same actions right next to it. Shift-click or a rubber band selects several
 * pawns, and every action applies to the whole selection.
 *
 * Deliberately data-source agnostic: it never calls the board API directly, only the handler
 * props (each mirrors one board.js / scenarios.js endpoint 1:1, and resolves once the caller's
 * state is updated). That's what lets the exact same component sit on top of either a live
 * campaign board or a scenario's prep board (CampaignDetail.jsx). Group actions call the
 * per-pawn handlers one after the other, never in parallel: each response is a full board
 * snapshot that becomes the caller's state, and an earlier one landing late would undo a later
 * change.
 *
 * withCamera=false (the scenario-prep case) hides what only a live board has: the projected
 * camera frame, ping, drawing, fog, documents, music and the initiative.
 */
export default function BoardEditor({
  board, characters = [],
  mediaLibrary = [], onUploadBackground, onPickBackground, onDeleteMedia,
  onUploadMusic, onPickMusic, onUpdateMusic,
  onToggleGrid, onGridSizeChange, onToggleLabels, onTokenSize,
  onAddToken, onAddCharacterToken, onMoveToken, onToggleTokenVisible, onDeleteToken, onUploadTokenImage,
  onTokenHpChange, onToggleTokenHideHp, onTokenPlayerLabelChange, onTokenStatusIconsChange,
  onAddZone, onMoveZone, onPatchZone, onDeleteZone,
  withCamera = false, onCameraDragEnd, onCameraResizeEnd, onCameraZoom, onCameraReset,
  onInitiativeVisibleChange, onInitiativeNext, onInitiativeReset,
  onPing, pings = [],
  onUpdateFog, onShowHandout, onHideHandout, onUploadHandoutMedia,
  onDraw, onUndoDrawing, onClearDrawings,
  onNewScene, scenarios = null, onLaunchScenario, scenesHref,
  hudPlayers = null, hudEnemies = null,
}) {
  // Ids only (not token objects) — re-derived from the live `board` prop below so the panels keep
  // tracking PV/PM as they change (via SSE, a level-up, a teammate's edit) instead of freezing.
  const [selectedIds, setSelectedIds] = useState([]);
  const selectedTokens = board.tokens.filter((t) => selectedIds.includes(t.id));
  const selectedToken = selectedTokens.length === 1 ? selectedTokens[0] : null;
  const [selectedZone, setSelectedZone] = useState(null);
  const [cameraSelected, setCameraSelected] = useState(false);
  const [menu, setMenu] = useState(null);
  const [libraryTab, setLibraryTab] = useState(null);
  const [lastLibraryTab, setLastLibraryTab] = useState('ennemis');
  const [draggingFromLibrary, setDraggingFromLibrary] = useState(false);
  const boardAreaRef = useRef(null);
  const drawerRef = useRef(null);
  const [popover, setPopover] = useState(null);
  // The GM's own view of exactly what the projector shows (fog opaque, hidden pawns gone, the
  // camera's framing), without opening the projector tab.
  const [playerPreview, setPlayerPreview] = useState(false);
  const [uploadingHandout, setUploadingHandout] = useState(false);
  // The library thumbnail is small and cropped (object-cover) — not enough to actually read a
  // letter before deciding to show it. This holds which media is open in the full-size lightbox.
  const [previewHandout, setPreviewHandout] = useState(null);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [pingArmed, setPingArmed] = useState(false);
  const [customStatusIcon, setCustomStatusIcon] = useState('');
  const [fogPaintArmed, setFogPaintArmed] = useState(false);
  const [fogBrushMode, setFogBrushMode] = useState('reveal');
  const [fogBrushRadius, setFogBrushRadius] = useState(2);
  const [drawArmed, setDrawArmed] = useState(false);
  const [drawColor, setDrawColor] = useState('#ef4444');
  // Local value while dragging the grid-size slider, committed to the API only on release, so a
  // fast drag doesn't fire a PATCH per step (and risk an earlier response clobbering a later one).
  const [liveGridSize, setLiveGridSize] = useState(null);
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [newTokenHp, setNewTokenHp] = useState('');
  const [newTokenOwnerId, setNewTokenOwnerId] = useState(null);
  // Global reference data (same for every campaign), not board state — fetched here directly
  // rather than threaded through props, same reasoning as CharacterSheet.jsx's rules fetches.
  const [monstres, setMonstres] = useState([]);
  const [monsterSearch, setMonsterSearch] = useState('');
  const [editingMonstreId, setEditingMonstreId] = useState(null);
  const [monsterQuantity, setMonsterQuantity] = useState(1);

  useEffect(() => {
    getMonstres().then(setMonstres).catch((e) => toast.error(e.message));
  }, []);

  const noToolArmed = !pingArmed && !fogPaintArmed && !drawArmed;

  // Only one pointer-capturing mode at a time — arming a second one while another is active
  // would leave two overlays fighting over the same clicks, so picking one clears the others.
  const disarmAll = () => { setPingArmed(false); setFogPaintArmed(false); setDrawArmed(false); };
  const armPing = () => setPingArmed((v) => { const next = !v; if (next) { setFogPaintArmed(false); setDrawArmed(false); } return next; });
  const armFogPaint = () => setFogPaintArmed((v) => { const next = !v; if (next) { setPingArmed(false); setDrawArmed(false); } return next; });
  const armDraw = () => setDrawArmed((v) => { const next = !v; if (next) { setPingArmed(false); setFogPaintArmed(false); } return next; });

  const clearSelection = () => { setSelectedIds([]); setSelectedZone(null); setCameraSelected(false); };
  const openLibrary = (tab) => {
    setLibraryTab((current) => (current === tab ? null : tab));
    setLastLibraryTab(tab);
  };

  const selectToken = (token, e) => {
    setCameraSelected(false);
    setSelectedZone(null);
    setSelectedIds((ids) => {
      if (!e?.shiftKey) return [token.id];
      return ids.includes(token.id) ? ids.filter((id) => id !== token.id) : [...ids, token.id];
    });
  };

  const handleMarqueeSelect = (rect, additive) => {
    const inside = board.tokens
      .filter((t) => t.x >= rect.x1 && t.x <= rect.x2 && t.y >= rect.y1 && t.y <= rect.y2)
      .map((t) => t.id);
    setSelectedZone(null);
    setCameraSelected(false);
    setSelectedIds((ids) => (additive ? [...new Set([...ids, ...inside])] : inside));
  };

  const handleTokenContextMenu = (token, x, y) => {
    if (!selectedIds.includes(token.id)) setSelectedIds([token.id]);
    setSelectedZone(null);
    setCameraSelected(false);
    setMenu({ x, y });
  };

  // --- Group actions (sequential on purpose, see the component docstring) ---

  const runEach = async (items, fn) => {
    for (const item of items) await fn(item);
  };

  const applyHp = (tokens, parsed) => runEach(tokens, (t) => {
    const d = hpDelta(parsed, t.hp_current);
    return d ? onTokenHpChange(t.id, d) : null;
  });

  const setVisible = (tokens, visible) => runEach(
    tokens.filter((t) => t.visible_to_players !== visible),
    (t) => onToggleTokenVisible(t),
  );

  const toggleStatus = (tokens, icon) => {
    const all = tokens.every((t) => t.status_icons?.includes(icon));
    return runEach(tokens, (t) => {
      const current = t.status_icons || [];
      if (all) return onTokenStatusIconsChange(t, current.filter((i) => i !== icon));
      return current.includes(icon) ? null : onTokenStatusIconsChange(t, [...current, icon]);
    });
  };

  const nextLabel = (label, taken) => {
    const base = label.replace(/\s+\d+$/, '');
    let n = 2;
    while (taken.has(`${base} ${n}`)) n++;
    taken.add(`${base} ${n}`);
    return `${base} ${n}`;
  };

  const duplicate = async (tokens) => {
    const taken = new Set(board.tokens.map((t) => t.label));
    const before = new Set(board.tokens.map((t) => t.id));
    let last = null;
    for (const t of tokens) {
      last = await onAddToken(nextLabel(t.label, taken), t.hp_max ?? undefined, t.owner_character_id ?? null,
        t.monstre_id ?? null, clampPct(t.x + 4), clampPct(t.y + 4)) || last;
    }
    if (last?.tokens) setSelectedIds(last.tokens.filter((t) => !before.has(t.id)).map((t) => t.id));
  };

  const deleteTokens = async (tokens) => {
    if (!tokens.length) return;
    if (tokens.length > 1 && !window.confirm(`Supprimer ces ${tokens.length} pions ?`)) return;
    setMenu(null);
    setSelectedIds([]);
    await runEach(tokens, (t) => onDeleteToken(t));
  };

  // Dragging a pawn that's part of a selection moves the whole selection by the same offset.
  // A press without movement reports the same position: nothing to send then.
  const handleTokenMoved = async (tokenId, x, y) => {
    const token = board.tokens.find((t) => t.id === tokenId);
    if (!token) return;
    const dx = x - token.x;
    const dy = y - token.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    const group = selectedIds.includes(tokenId) && selectedTokens.length > 1 ? selectedTokens : [token];
    await runEach(group, (t) => onMoveToken(t.id, clampPct(t.x + dx), clampPct(t.y + dy)));
  };

  // Session shortcuts — skipped while typing in a field so they don't hijack an input. Grid,
  // labels, selection and Escape work in scenario prep too; the rest are live-board concepts.
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case 'g': onToggleGrid(); break;
        case 'l': onToggleLabels(); break;
        // preventDefault: the drawer's search field takes the focus, the key must not type a 'b' into it
        case 'b': e.preventDefault(); openLibrary(libraryTab || lastLibraryTab); break;
        case 'v': disarmAll(); break;
        case 'j': if (withCamera) setPlayerPreview((v) => !v); break;
        case 'escape':
          disarmAll();
          clearSelection();
          setMenu(null);
          setPopover(null);
          setLibraryTab(null);
          setPreviewHandout(null);
          setPlayerPreview(false);
          break;
        case 'delete':
        case 'backspace':
          if (selectedTokens.length) { e.preventDefault(); deleteTokens(selectedTokens); }
          break;
        case 'h':
          if (selectedTokens.length) setVisible(selectedTokens, selectedTokens.some((t) => !t.visible_to_players));
          break;
        case 'p': if (withCamera) armPing(); break;
        case 'f': if (withCamera) onUpdateFog({ fog_enabled: !board.fog_enabled }); break;
        case 'd': if (withCamera) armDraw(); break;
        case 'n': if (withCamera && board.tokens.some((t) => t.character_id != null)) onInitiativeNext(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withCamera, board.fog_enabled, board.tokens, selectedIds, libraryTab, lastLibraryTab]);

  // Kept in separate buckets so picking a fond never surfaces a handout letter (or vice versa) —
  // both are 'image'-mimetype uploads, only board_media.type (set by which uploader was used)
  // tells them apart.
  const backgroundMedia = mediaLibrary.filter((m) => m.type === 'image' || m.type === 'video');
  const handoutMedia = mediaLibrary.filter((m) => m.type === 'handout');
  const musicMedia = mediaLibrary.filter((m) => m.type === 'audio');

  const tokenlessCharacters = characters.filter((c) => !board.tokens.some((t) => t.character_id === c.id));
  // The "Golem" capacité (which grants the actual construct, p.176 rules_capacites) only
  // unlocks at rang 2 of the voie — rang 1 ("Grosse tête") has nothing to summon yet.
  const golemCharacters = characters.filter((c) => c.golem_rang >= 2);

  // Pre-fills the pawn form instead of creating the token directly — niveau×5 is only the base
  // PV formula (p.176 rules_capacites); the rang-5 "Golem supérieur" upgrade can add more, and
  // there's no structured field for it, so the GM gets an editable value instead of a wrong one.
  const handleAddGolem = (character) => {
    setNewTokenLabel(`Golem de ${character.name}`);
    setNewTokenHp(String(character.level * 5));
    setNewTokenOwnerId(character.id);
  };

  // A bestiary monster's stats are fixed and known in advance, so this creates the pawn(s)
  // directly, around the drop point (or the board's center for a plain click). They spawn
  // hidden (an ambush isn't a surprise otherwise) and come out selected, so H reveals the whole
  // group at once.
  const visibleCenterX = () => {
    const area = boardAreaRef.current?.getBoundingClientRect();
    const drawer = drawerRef.current?.getBoundingClientRect();
    if (!area || !drawer) return 50;
    return Math.max(10, ((area.width - drawer.width) / 2 / area.width) * 100);
  };

  const handleAddMonstre = async (monstre, x = visibleCenterX(), y = 50) => {
    const before = new Set(board.tokens.map((t) => t.id));
    const positions = spreadPositions(monsterQuantity, x, y);
    let last = null;
    for (let i = 0; i < positions.length; i++) {
      const label = monsterQuantity > 1 ? `${monstre.name} ${i + 1}` : monstre.name;
      last = await onAddToken(label, monstre.pv, null, monstre.id, positions[i].x, positions[i].y) || last;
    }
    if (last?.tokens) {
      setSelectedZone(null);
      setCameraSelected(false);
      setSelectedIds(last.tokens.filter((t) => !before.has(t.id)).map((t) => t.id));
    }
  };

  const handleDropItem = (item, x, y) => {
    setDraggingFromLibrary(false);
    if (item.kind === 'monstre') {
      const monstre = monstres.find((m) => m.id === item.id);
      if (monstre) handleAddMonstre(monstre, x, y);
    } else if (item.kind === 'character') {
      const character = characters.find((c) => c.id === item.id);
      if (character) onAddCharacterToken(character, x, y);
    }
  };

  const dragProps = (item) => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData(BOARD_DRAG_MIME, JSON.stringify(item));
      e.dataTransfer.effectAllowed = 'copy';
      // Let the drawer fade out of the way only once the browser has captured the drag image.
      setTimeout(() => setDraggingFromLibrary(true), 0);
    },
    onDragEnd: () => setDraggingFromLibrary(false),
  });

  // The bestiary is global reference data, not board state — edited in place here (rather than
  // through a handler prop) since it's the same for every campaign and fetched by this component.
  const handleMonstreEmojiBlur = (monstre, e) => {
    const emoji = e.target.value.trim();
    if (emoji === (monstre.emoji || '')) return;
    updateMonstre(monstre.id, { emoji })
      .then((updated) => setMonstres((prev) => prev.map((m) => (m.id === updated.id ? updated : m))))
      .catch((err) => toast.error(err.message));
  };

  const handleMonstreImageUpload = (monstre, file) => {
    uploadMonstreImage(monstre.id, file)
      .then((updated) => setMonstres((prev) => prev.map((m) => (m.id === updated.id ? updated : m))))
      .catch((err) => toast.error(err.message));
  };

  const withUpload = (setBusy, upload) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await upload(file);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const handleAddToken = (e) => {
    e.preventDefault();
    if (!newTokenLabel.trim()) return;
    onAddToken(newTokenLabel.trim(), newTokenHp ? Number(newTokenHp) : undefined, newTokenOwnerId);
    setNewTokenLabel('');
    setNewTokenHp('');
    setNewTokenOwnerId(null);
  };

  // Saved on blur (not on every keystroke) — same pattern as CharacterSheet.jsx's free-text
  // fields, no reason to fire a request per character typed.
  const handlePlayerHpLabelBlur = (e) => onTokenPlayerLabelChange(selectedToken, e.target.value.trim());

  const handleAddCustomStatusIcon = (e) => {
    e.preventDefault();
    const icon = customStatusIcon.trim();
    if (!icon || !selectedToken) return;
    onTokenStatusIconsChange(selectedToken, [...(selectedToken.status_icons || []), icon]);
    setCustomStatusIcon('');
  };

  // Merges the cells just painted into the board's own persisted set before sending the full
  // array — board.fog_revealed is already in hand, no need for the caller to know fog's rules.
  const handleFogPaint = (cells, mode) => {
    const current = new Set(board.fog_revealed || []);
    if (mode === 'hide') cells.forEach((c) => current.delete(c));
    else cells.forEach((c) => current.add(c));
    onUpdateFog({ fog_revealed: [...current] });
  };

  const handleAddZone = async (shape) => {
    setPopover(null);
    const updated = await onAddZone(shape);
    // New zones always spawn at the board's center (50/50) — exactly where the camera frame
    // usually sits too, so auto-selecting it is the only easy way to grab it from under the frame.
    setCameraSelected(false);
    setSelectedIds([]);
    setSelectedZone(updated.zones[updated.zones.length - 1]);
  };

  // Re-synced from the response (not left as the pre-patch object): the color swatch binds
  // straight to selectedZone, a stale object would show the color that was just replaced.
  const handlePatchZone = async (data) => {
    const updated = await onPatchZone(selectedZone.id, data);
    setSelectedZone(updated.zones.find((z) => z.id === selectedZone.id) || null);
  };

  const handleDeleteZone = () => {
    onDeleteZone(selectedZone);
    setSelectedZone(null);
  };

  const hiddenTokens = board.tokens.filter((t) => !t.visible_to_players && !(t.character_id && !t.is_npc));
  const selectOnly = (tokens) => { setSelectedZone(null); setCameraSelected(false); setSelectedIds(tokens.map((t) => t.id)); };

  const launchScene = async (scenario, replace) => {
    if (replace && !window.confirm(`Vider le plateau (pions, zones, brouillard, dessins, document) puis lancer « ${scenario.name} » ?`)) return;
    setPopover(null);
    clearSelection();
    if (replace) await onNewScene();
    await onLaunchScenario(scenario);
  };

  const actionProps = {
    onHp: applyHp,
    onSetVisible: setVisible,
    onToggleStatus: toggleStatus,
    onDuplicate: duplicate,
    onDelete: deleteTokens,
    withStates: withCamera,
  };

  const statusChip = (on, children, onClick, title) => (
    <button
      onClick={onClick}
      title={title}
      className={`px-2.5 py-1 text-xs rounded-full border ${on ? 'border-[var(--accent)] text-[var(--accent)] font-medium' : 'border-[var(--border)] text-[var(--text-secondary)]'} hover:border-[var(--accent)]`}
    >
      {children}
    </button>
  );

  const scenePawns = [
    ['Personnages', board.tokens.filter((t) => t.character_id && !t.is_npc)],
    ['Visibles des joueurs', board.tokens.filter((t) => !(t.character_id && !t.is_npc) && t.visible_to_players)],
    ['Cachés', board.tokens.filter((t) => !(t.character_id && !t.is_npc) && !t.visible_to_players)],
  ];

  return (
    // select-none: a rubber-band drag across the board must not highlight the page's text (inputs stay editable)
    <div className={`flex flex-col gap-2 select-none ${withCamera ? 'h-[calc(100dvh-9rem)]' : 'h-[78vh]'} min-h-[30rem]`}>
      {/* What the players currently get, at a glance and one click away from changing it. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {withCamera && (
          <>
            {statusChip(board.fog_enabled, <>🌫️ Brouillard {board.fog_enabled ? 'actif' : 'inactif'}<Kbd>F</Kbd></>,
              () => onUpdateFog({ fog_enabled: !board.fog_enabled }), 'Activer / couper le brouillard')}
            {board.music_url ? (
              <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border border-[var(--accent)] text-[var(--accent)]">
                <button onClick={() => onUpdateMusic({ music_playing: !board.music_playing })} title={board.music_playing ? 'Mettre en pause' : 'Lire'}>
                  {board.music_playing ? '⏸️' : '▶️'}
                </button>
                🎵
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={board.music_volume ?? 0.5}
                  onChange={(e) => onUpdateMusic({ music_volume: parseFloat(e.target.value) })}
                  className="w-16"
                  title="Volume"
                />
                <button onClick={() => onUpdateMusic({ music_url: '', music_playing: false })} title="Arrêter la musique" className="text-[var(--text-secondary)]">✕</button>
              </span>
            ) : statusChip(false, '🎵 Aucune musique', () => openLibrary('musique'), 'Choisir une musique')}
            {board.handout_url
              ? statusChip(true, '📄 Document affiché · Masquer', onHideHandout, 'Retirer le document de l\'écran des joueurs')
              : statusChip(false, '📄 Aucun document', () => openLibrary('documents'), 'Montrer un document')}
            {statusChip(board.initiative_visible, `⚔️ Initiative ${board.initiative_visible ? 'visible' : 'cachée'} au projecteur`,
              () => onInitiativeVisibleChange(!board.initiative_visible), 'Afficher / cacher l\'ordre de jeu sur le projecteur')}
            {statusChip((board.camera_width ?? 100) < 100, `🎥 Projecteur : ${(board.camera_width ?? 100) < 100 ? 'cadré' : 'tout le plateau'}`,
              () => { setSelectedIds([]); setSelectedZone(null); setCameraSelected(true); }, 'Régler ce que montre le projecteur')}
            {hiddenTokens.length > 0 && statusChip(true, `🙈 ${hiddenTokens.length} pion${hiddenTokens.length > 1 ? 's' : ''} caché${hiddenTokens.length > 1 ? 's' : ''}`,
              () => selectOnly(hiddenTokens), 'Sélectionner les pions cachés (puis H pour les montrer)')}
          </>
        )}
        {scenarios && (
          <button
            onClick={() => setPopover((p) => (p === 'scenes' ? null : 'scenes'))}
            className={`ml-auto px-3 py-1.5 text-sm rounded border hover:border-[var(--accent)] ${popover === 'scenes' ? active : 'border-[var(--border)]'}`}
          >
            🎬 Scènes ({scenarios.length})
          </button>
        )}
        <button
          onClick={() => openLibrary(libraryTab || lastLibraryTab)}
          className={`${scenarios ? '' : 'ml-auto '}px-3 py-1.5 text-sm rounded border hover:border-[var(--accent)] ${libraryTab ? active : 'border-[var(--border)]'}`}
        >
          📚 Bibliothèques<Kbd>B</Kbd>
        </button>
      </div>

      {withCamera && (
        <InitiativeTracker
          board={board}
          isGm
          onNext={onInitiativeNext}
          onReset={onInitiativeReset}
          selectedTokenId={selectedToken?.id ?? null}
          onSelectToken={(token) => selectToken(token)}
        />
      )}

      <div className="flex-1 min-h-0 flex gap-2">
        {/* Game tools, always in the same place: what's armed is highlighted, Esc or V disarms. */}
        <div className="w-16 shrink-0 flex flex-col gap-1 p-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] overflow-y-auto">
          <RailButton icon="🖱️" label="Sélection" kbd="V" isActive={noToolArmed} onClick={disarmAll}
            title="Sélectionner et déplacer · Maj+clic ou rectangle pour plusieurs pions · clic droit sur un pion pour ses actions" />
          {withCamera && <RailButton icon="📍" label="Pointeur" kbd="P" isActive={pingArmed} onClick={armPing} title="Le prochain clic montre un repère à tout le monde" />}
          {withCamera && (
            <RailButton icon="🖌️" label="Brouillard" isActive={fogPaintArmed}
              onClick={() => { if (!board.fog_enabled) onUpdateFog({ fog_enabled: true }); armFogPaint(); }}
              title="Peindre le brouillard (révéler / masquer)" />
          )}
          {withCamera && <RailButton icon="✏️" label="Dessin" kbd="D" isActive={drawArmed} onClick={armDraw} title="Dessiner à main levée, visible de tous" />}
          <RailButton icon="⭕" label="Zones" isActive={popover === 'zones'} onClick={() => setPopover((p) => (p === 'zones' ? null : 'zones'))} title="Ajouter une zone d'effet" />
          {withCamera && (
            <RailButton icon="🎥" label="Caméra" isActive={cameraSelected}
              onClick={() => { setSelectedIds([]); setSelectedZone(null); setCameraSelected(true); }}
              title="Régler ce que montre le projecteur" />
          )}
          {withCamera && <RailButton icon="👁️" label="Joueurs" kbd="J" isActive={playerPreview} onClick={() => setPlayerPreview((v) => !v)}
            title="Aperçu de ce que voient les joueurs au projecteur" />}
          <div className="my-1 border-t border-[var(--border)]" />
          <RailButton icon="#️⃣" label="Grille" kbd="G" isActive={board.grid_visible} onClick={onToggleGrid} title="Afficher / masquer la grille" />
          <RailButton icon="🏷️" label="Noms" kbd="L" isActive={board.labels_visible !== false} onClick={onToggleLabels}
            title="Afficher / masquer le nom sous chaque pion (utile quand ils se chevauchent)" />
          <RailButton icon="⚙️" label="Réglages" isActive={popover === 'settings'} onClick={() => setPopover((p) => (p === 'settings' ? null : 'settings'))}
            title="Taille des cases et des pions" />
          {withCamera && (
            <>
              <div className="flex-1" />
              <RailButton icon="🆕" label="Scène" danger title="Nouvelle scène : vide pions, zones, brouillard, dessins et document (garde le fond et la musique)"
                onClick={() => {
                  if (window.confirm('Vider le plateau (pions, zones, brouillard, dessins, document affiché) ? Le fond, la musique et la caméra sont conservés.')) {
                    clearSelection();
                    onNewScene();
                  }
                }} />
            </>
          )}
        </div>

        <div ref={boardAreaRef} className="relative flex-1 min-w-0">
          <BoardCanvas
            board={board}
            isGm
            className="absolute inset-0 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]"
            hudPlayers={hudPlayers}
            hudEnemies={hudEnemies}
            selectedToken={selectedToken}
            selectedTokenIds={selectedIds}
            onSelectToken={selectToken}
            onTokenDragEnd={handleTokenMoved}
            onTokenContextMenu={handleTokenContextMenu}
            onMarqueeSelect={handleMarqueeSelect}
            onDropItem={handleDropItem}
            selectedZone={selectedZone}
            onSelectZone={(zone) => { setCameraSelected(false); setSelectedIds([]); setSelectedZone(zone); }}
            onZoneDragEnd={onMoveZone}
            showCameraFrame={withCamera}
            cameraSelected={cameraSelected}
            onSelectCamera={() => { setSelectedIds([]); setSelectedZone(null); setCameraSelected(true); }}
            onCameraDragEnd={onCameraDragEnd}
            onCameraResizeEnd={onCameraResizeEnd}
            onBackgroundClick={(e) => { if (!e?.shiftKey) clearSelection(); setPopover(null); }}
            pingMode={pingArmed}
            onPing={(x, y) => { onPing(x, y); setPingArmed(false); }}
            pings={pings}
            fogMode={fogPaintArmed}
            fogBrushMode={fogBrushMode}
            fogBrushRadius={fogBrushRadius}
            onFogPaint={handleFogPaint}
            drawMode={drawArmed}
            drawColor={drawColor}
            onDraw={onDraw}
          />

          {/* Options of the armed tool, floating over the board's top edge. */}
          {(fogPaintArmed || drawArmed || pingArmed) && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-1 text-sm whitespace-nowrap rounded-lg glass-blur bg-[var(--bg-card)] border border-[var(--accent)] shadow-lg">
              {pingArmed && <span className="px-1">📍 Clique sur le plateau pour montrer un repère</span>}
              {fogPaintArmed && (
                <>
                  {[['reveal', 'Révéler'], ['hide', 'Masquer']].map(([mode, label]) => (
                    <button key={mode} onClick={() => setFogBrushMode(mode)}
                      className={`px-2 py-1 rounded ${fogBrushMode === mode ? 'bg-[var(--accent)] text-white' : 'hover:bg-[var(--bg-input)]'}`}>
                      {label}
                    </button>
                  ))}
                  <span className="pl-2 text-[var(--text-secondary)]">Taille {fogBrushRadius}</span>
                  <button onClick={() => setFogBrushRadius((r) => Math.max(1, r - 1))} className="w-7 h-7 rounded hover:bg-[var(--bg-input)]">−</button>
                  <button onClick={() => setFogBrushRadius((r) => Math.min(6, r + 1))} className="w-7 h-7 rounded hover:bg-[var(--bg-input)]">+</button>
                  <span className="mx-1 h-5 border-l border-[var(--border)]" />
                  <button onClick={() => onUpdateFog({ fog_revealed: [] })} className="px-2 py-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-secondary)]">Tout masquer</button>
                  <button onClick={() => onUpdateFog({ fog_revealed: Array.from({ length: FOG_COLS * FOG_ROWS }, (_, i) => i) })}
                    className="px-2 py-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-secondary)]">Tout révéler</button>
                  <button onClick={() => { setFogPaintArmed(false); onUpdateFog({ fog_enabled: false }); }}
                    className="px-2 py-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-secondary)]">Couper le brouillard</button>
                </>
              )}
              {drawArmed && (
                <>
                  <input type="color" value={drawColor} onChange={(e) => setDrawColor(e.target.value)} className="w-7 h-7 rounded border border-[var(--border)]" />
                  {board.drawings?.length > 0 && (
                    <>
                      <button onClick={onUndoDrawing} title="Annuler le dernier trait" className="px-2 py-1 rounded hover:bg-[var(--bg-input)]">↩︎ Annuler</button>
                      <button onClick={onClearDrawings} title="Tout effacer" className="px-2 py-1 rounded hover:bg-[var(--bg-input)]">🗑️ Tout effacer</button>
                    </>
                  )}
                </>
              )}
              <button onClick={disarmAll} title="Terminer (Échap)" className="ml-1 px-2 py-1 rounded hover:bg-[var(--bg-input)]">✕</button>
            </div>
          )}

          {popover === 'zones' && (
            <div className="glass-blur absolute top-2 left-2 z-50 flex flex-col gap-1 p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] shadow-lg">
              <span className="text-xs text-[var(--text-secondary)]">Ajouter une zone au centre</span>
              {ZONE_SHAPES.map(([shape, label]) => (
                <button key={shape} onClick={() => handleAddZone(shape)} className={`${btn} text-left`}>{label}</button>
              ))}
            </div>
          )}

          {popover === 'settings' && (
            <div className="glass-blur absolute top-2 left-2 z-50 flex flex-col gap-2 p-3 w-64 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] shadow-lg text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>Cases de la grille</span>
                <span className="w-6 text-right">{liveGridSize ?? board.grid_size ?? 20}</span>
              </div>
              <input
                type="range" min="6" max="60"
                value={liveGridSize ?? board.grid_size ?? 20}
                onChange={(e) => setLiveGridSize(Number(e.target.value))}
                onMouseUp={(e) => { onGridSizeChange(Number(e.target.value)); setLiveGridSize(null); }}
                onTouchEnd={(e) => { onGridSizeChange(Number(e.target.value)); setLiveGridSize(null); }}
                onKeyUp={(e) => { onGridSizeChange(Number(e.target.value)); setLiveGridSize(null); }}
              />
              <div className="flex items-center justify-between gap-2">
                <span>Taille des pions</span>
                <div className="flex gap-1">
                  <button onClick={() => onTokenSize(-8)} className={smallBtn}>−</button>
                  <button onClick={() => onTokenSize(8)} className={smallBtn}>+</button>
                </div>
              </div>
            </div>
          )}

          {popover === 'scenes' && scenarios && (
            <div className="glass-blur absolute top-2 right-2 z-50 w-80 max-h-[80%] overflow-y-auto flex flex-col gap-2 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] shadow-lg text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">🎬 Scènes préparées</span>
                {scenesHref && <a href={scenesHref} className="text-xs text-[var(--accent)] hover:underline">Préparer…</a>}
              </div>
              {scenarios.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)]">
                  Aucune scène préparée. Crée-les depuis la page de la campagne (Scénarios) : fond, pions et zones, prêts à lancer d'un clic.
                </p>
              ) : scenarios.map((sc) => (
                <div key={sc.id} className="flex items-center gap-1.5 p-2 rounded border border-[var(--border)]">
                  <span className="flex-1 min-w-0 truncate" title={sc.name}>{sc.name}</span>
                  <button onClick={() => launchScene(sc, false)} title="Ajoute le fond, les pions et les zones de la scène au plateau actuel"
                    className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]">➕ Ajouter</button>
                  <button onClick={() => launchScene(sc, true)} title="Vide le plateau puis lance la scène"
                    className="px-2 py-1 text-xs rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]">🔄 Remplacer</button>
                </div>
              ))}
            </div>
          )}

          {playerPreview && (() => {
            const safe = playerSafeBoard(board);
            return (
              <div className="absolute inset-0 z-[55] rounded-lg overflow-hidden bg-black cursor-pointer" onClick={() => setPlayerPreview(false)}>
                <BoardCanvas board={safe} isGm={false} className="absolute inset-0" style={{ backgroundColor: 'black' }}
                  hudPlayers={safe.tokens.filter((t) => t.character_id && !t.is_npc)} cameraCrop pings={pings} />
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[60] px-3 py-1 text-xs rounded-full bg-black/70 text-white pointer-events-none whitespace-nowrap">
                  👁️ Ce que voient les joueurs au projecteur · clic ou J pour revenir
                </div>
              </div>
            );
          })()}

          {/* Libraries slide over the board's right side instead of pushing the board down; while
              something is being dragged out of them they fade away so the whole board is a target. */}
          {libraryTab && (
            <div ref={drawerRef} className={`glass-blur absolute top-0 right-0 bottom-0 z-40 w-[26rem] max-w-[85%] flex flex-col rounded-lg bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl transition-opacity ${
              draggingFromLibrary ? 'opacity-20 pointer-events-none' : ''
            }`}>
              <div className="flex items-center gap-1 p-2 border-b border-[var(--border)] overflow-x-auto">
                {LIBRARY_TABS.filter(([, , liveOnly]) => withCamera || !liveOnly).map(([tab, label]) => (
                  <button key={tab} onClick={() => openLibrary(tab)}
                    className={`px-2 py-1 text-xs rounded whitespace-nowrap ${libraryTab === tab ? 'bg-[var(--accent)] text-white' : 'hover:bg-[var(--bg-input)]'}`}>
                    {label}
                  </button>
                ))}
                <button onClick={() => setLibraryTab(null)} title="Fermer (B)" className="ml-auto px-2 py-1 rounded hover:bg-[var(--bg-input)]">✕</button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
                {libraryTab === 'ennemis' && (
                  <>
                    <div className="flex items-center gap-2">
                      <input type="text" placeholder="Rechercher (gobelin, ours…)" value={monsterSearch} autoFocus
                        onChange={(e) => setMonsterSearch(e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1 text-sm rounded bg-[var(--bg-input)] border border-[var(--border)]" />
                      <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        ×
                        <input type="number" min="1" max="20" value={monsterQuantity}
                          onChange={(e) => setMonsterQuantity(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                          className="w-12 px-1.5 py-1 text-sm rounded bg-[var(--bg-input)] border border-[var(--border)]" />
                      </label>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Fais glisser un ennemi sur le plateau (ou clique pour l'ajouter au centre). Ils arrivent cachés et sélectionnés :
                      <b> H</b> pour les montrer.
                    </p>
                    {Object.entries(MONSTRE_CATEGORY_LABELS).map(([cat, label]) => {
                      const inCategory = monstres.filter((m) => m.category === cat
                        && m.name.toLowerCase().includes(monsterSearch.trim().toLowerCase()));
                      if (inCategory.length === 0) return null;
                      return (
                        <div key={cat}>
                          <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">{label}</h4>
                          <div className="flex flex-wrap gap-1">
                            {inCategory.map((m) => (
                              <div key={m.id} className="flex flex-col gap-1">
                                <div className="flex items-stretch">
                                  <button
                                    {...dragProps({ kind: 'monstre', id: m.id })}
                                    onClick={() => handleAddMonstre(m)}
                                    title={`NC ${m.nc} · Déf ${m.defense} · PV ${m.pv} · Init ${m.initiative}`}
                                    className="px-2 py-1 text-xs rounded-l border border-[var(--border)] hover:border-[var(--accent)] cursor-grab"
                                  >
                                    {m.emoji || '❔'} {m.name} <span className="text-[var(--text-secondary)]">NC{m.nc}</span>
                                    {monsterQuantity > 1 && <span className="text-[var(--accent)]"> ×{monsterQuantity}</span>}
                                  </button>
                                  <button
                                    onClick={() => setEditingMonstreId((id) => (id === m.id ? null : m.id))}
                                    title="Personnaliser l'emoji/l'image par défaut de ce monstre"
                                    className={`px-1.5 text-xs rounded-r border border-l-0 border-[var(--border)] hover:border-[var(--accent)] ${editingMonstreId === m.id ? 'bg-[var(--bg-input)]' : ''}`}
                                  >
                                    ✏️
                                  </button>
                                </div>
                                {editingMonstreId === m.id && (
                                  <div className="flex items-center gap-1.5 px-1.5 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)]">
                                    <input key={m.id} type="text" maxLength={4} defaultValue={m.emoji || ''} onBlur={(e) => handleMonstreEmojiBlur(m, e)}
                                      title="Emoji par défaut"
                                      className="w-10 px-1 py-0.5 text-sm text-center rounded bg-[var(--bg-card)] border border-[var(--border)]" />
                                    <label className="px-2 py-0.5 text-[10px] rounded border border-[var(--border)] cursor-pointer hover:border-[var(--accent)] whitespace-nowrap">
                                      {m.image_url ? '🖼️ Changer' : '🖼️ Image'}
                                      <input type="file" accept="image/*" className="hidden"
                                        onChange={(e) => e.target.files?.[0] && handleMonstreImageUpload(m, e.target.files[0])} />
                                    </label>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {libraryTab === 'personnages' && (
                  <>
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Personnages pas encore sur le plateau</h4>
                      {tokenlessCharacters.length === 0 ? (
                        <p className="text-xs text-[var(--text-secondary)]">Tous les personnages sont déjà sur le plateau.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tokenlessCharacters.map((c) => (
                            <button key={c.id} {...dragProps({ kind: 'character', id: c.id })} onClick={() => onAddCharacterToken(c)}
                              className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)] cursor-grab">
                              {c.avatar_emoji || '🧙'} {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {golemCharacters.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Golems</h4>
                        <div className="flex flex-wrap gap-1">
                          {golemCharacters.map((c) => (
                            <button key={c.id} onClick={() => handleAddGolem(c)}
                              title={`Pré-remplit le formulaire ci-dessous avec "Golem de ${c.name}" et ${c.level * 5} PV (niveau × 5)`}
                              className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]">
                              🗿 Golem ({c.name})
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <form onSubmit={handleAddToken} className="flex flex-col gap-1.5">
                      <h4 className="text-xs font-semibold text-[var(--text-secondary)]">Pion libre</h4>
                      <input type="text" placeholder="Nom du pion" value={newTokenLabel}
                        onChange={(e) => { setNewTokenLabel(e.target.value); setNewTokenOwnerId(null); }}
                        className="px-2 py-1.5 text-sm rounded bg-[var(--bg-input)] border border-[var(--border)]" />
                      <div className="flex gap-1.5">
                        <input type="number" min="1" placeholder="PV (optionnel)" value={newTokenHp}
                          title="Pour un pion-créature (golem, familier...) avec sa propre barre de vie"
                          onChange={(e) => setNewTokenHp(e.target.value)}
                          className="flex-1 min-w-0 px-2 py-1.5 text-sm rounded bg-[var(--bg-input)] border border-[var(--border)]" />
                        <button type="submit" className={btn}>Ajouter</button>
                      </div>
                    </form>
                  </>
                )}

                {libraryTab === 'fonds' && (
                  <>
                    <label className="self-start px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white cursor-pointer hover:bg-[var(--accent-hover)]">
                      {uploadingBg ? 'Envoi...' : 'Envoyer un fond (image ou vidéo)'}
                      <input type="file" accept="image/*,video/mp4" onChange={withUpload(setUploadingBg, onUploadBackground)} className="hidden" disabled={uploadingBg} />
                    </label>
                    {backgroundMedia.length === 0 ? (
                      <p className="text-sm text-[var(--text-secondary)]">Aucun fond envoyé pour l'instant.</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {backgroundMedia.map((media) => (
                          <div key={media.id} className="flex flex-col gap-1">
                            <button onClick={() => onPickBackground(media)} title="Utiliser ce fond"
                              className="h-20 rounded border border-[var(--border)] hover:border-[var(--accent)] overflow-hidden bg-black/20 flex items-center justify-center">
                              {media.type === 'video'
                                ? <video src={media.url} className="w-full h-full object-cover" muted />
                                : <img src={media.url} alt={media.label} className="w-full h-full object-cover" />}
                            </button>
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] truncate text-[var(--text-secondary)]" title={media.label}>
                                {media.type === 'video' ? '🎬 ' : '🖼 '}{media.label}
                              </span>
                              <button onClick={() => onDeleteMedia(media)} className="text-[10px] text-red-500 hover:underline shrink-0">suppr.</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {withCamera && libraryTab === 'documents' && (
                  <>
                    <label className="self-start px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white cursor-pointer hover:bg-[var(--accent-hover)]">
                      {uploadingHandout ? 'Envoi...' : 'Envoyer un document'}
                      <input type="file" accept="image/*" onChange={withUpload(setUploadingHandout, onUploadHandoutMedia)} className="hidden" disabled={uploadingHandout} />
                    </label>
                    {handoutMedia.length === 0 ? (
                      <p className="text-sm text-[var(--text-secondary)]">Aucun document envoyé pour l'instant.</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {handoutMedia.map((media) => (
                          <div key={media.id} className="flex flex-col gap-1">
                            <button onClick={() => setPreviewHandout(media)} title="Aperçu avant de le montrer aux joueurs"
                              className="relative h-20 rounded border border-[var(--border)] hover:border-[var(--accent)] overflow-hidden bg-black/20 group">
                              <img src={media.url} alt={media.label} className="w-full h-full object-cover" />
                              <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/50 transition-colors">
                                <span className="opacity-0 group-hover:opacity-100 text-lg">👁️</span>
                              </span>
                            </button>
                            <span className="text-[10px] truncate text-[var(--text-secondary)]" title={media.label}>📄 {media.label}</span>
                            <div className="flex gap-1">
                              <button onClick={() => onShowHandout(media.url)}
                                className="flex-1 text-[10px] px-1 py-0.5 rounded border border-[var(--border)] hover:border-[var(--accent)]">📢 Montrer</button>
                              <button onClick={() => onDeleteMedia(media)} className="text-[10px] text-red-500 hover:underline">suppr.</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {withCamera && libraryTab === 'musique' && (
                  <>
                    <label className="self-start px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white cursor-pointer hover:bg-[var(--accent-hover)]">
                      {uploadingMusic ? 'Envoi...' : 'Envoyer une piste'}
                      <input type="file" accept="audio/*" onChange={withUpload(setUploadingMusic, onUploadMusic)} className="hidden" disabled={uploadingMusic} />
                    </label>
                    {musicMedia.length === 0 ? (
                      <p className="text-sm text-[var(--text-secondary)]">Aucune piste envoyée pour l'instant.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {musicMedia.map((media) => (
                          <div key={media.id} className="flex flex-wrap items-center gap-2 p-2 rounded border border-[var(--border)]">
                            <span className="text-sm truncate flex-1 min-w-[8rem]" title={media.label}>🎵 {media.label}</span>
                            <audio src={media.url} controls className="h-8 max-w-full" />
                            <button onClick={() => onPickMusic(media)} className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]">Utiliser</button>
                            <button onClick={() => onDeleteMedia(media)} className="text-[10px] text-red-500 hover:underline shrink-0">suppr.</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Always rendered at a fixed width (not conditionally mounted) — otherwise the board's
            width jumps every time a selection appears/disappears, under the GM's cursor. */}
        <div className="w-72 shrink-0 overflow-y-auto p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-3">
          {withCamera && cameraSelected ? (
            <>
              <h3 className="font-semibold">🎥 Cadre projeté</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Ce que les joueurs voient sur le mode projecteur. Fais glisser son étiquette pour le déplacer.
              </p>
              <div className="flex items-center justify-between text-sm">
                <span>Zoom</span>
                <div className="flex gap-1">
                  <button onClick={() => onCameraZoom(10)} className={smallBtn}>−</button>
                  <button onClick={() => onCameraZoom(-10)} className={smallBtn}>+</button>
                </div>
              </div>
              <button onClick={onCameraReset} className={btn}>Recentrer sur tout le plateau</button>
            </>
          ) : selectedTokens.length > 1 ? (
            <>
              <h3 className="font-semibold">{selectedTokens.length} pions sélectionnés</h3>
              <p className="text-xs text-[var(--text-secondary)] -mt-2">{selectedTokens.map((t) => t.label).join(', ')}</p>
              <SelectionActions key={selectedIds.join(',')} tokens={selectedTokens} {...actionProps} />
              <p className="text-xs text-[var(--text-secondary)]">Fais glisser l'un d'eux pour déplacer tout le groupe.</p>
            </>
          ) : selectedToken ? (
            <>
              {selectedToken.character_id ? (
                <CharacterSummaryCard entry={selectedToken} />
              ) : selectedToken.hp_max != null ? (
                <CreatureSummaryCard entry={selectedToken} />
              ) : (
                <h3 className="font-semibold">{selectedToken.label}</h3>
              )}

              <SelectionActions key={selectedToken.id} tokens={[selectedToken]} {...actionProps} />

              {selectedToken.hp_max != null && (
                <>
                  <button onClick={() => onToggleTokenHideHp(selectedToken)} className={btn}>
                    {selectedToken.hide_hp_from_players ? '🙈 Vie cachée aux joueurs' : '👁️ Vie visible des joueurs'}
                  </button>
                  {selectedToken.hide_hp_from_players && (
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-[var(--text-secondary)]">Indicateur montré aux joueurs (optionnel)</span>
                      <input key={selectedToken.id} type="text" maxLength={20} placeholder="ex : 🩸🩸, Blessé, ??"
                        defaultValue={selectedToken.player_hp_label || ''} onBlur={handlePlayerHpLabelBlur}
                        className="px-2 py-1.5 text-sm rounded bg-[var(--bg-input)] border border-[var(--border)]" />
                    </label>
                  )}
                </>
              )}

              {withCamera && (
                <form onSubmit={handleAddCustomStatusIcon} className="flex gap-1">
                  <input type="text" maxLength={4} placeholder="Autre état (emoji)" value={customStatusIcon}
                    onChange={(e) => setCustomStatusIcon(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1 text-sm rounded bg-[var(--bg-input)] border border-[var(--border)]" />
                  <button type="submit" className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]">Ajouter</button>
                </form>
              )}

              <label className="px-3 py-1.5 text-sm text-center rounded border border-[var(--border)] cursor-pointer hover:border-[var(--accent)]">
                Image du pion
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && onUploadTokenImage(selectedToken, e.target.files[0])} />
              </label>
            </>
          ) : selectedZone ? (
            <>
              <h3 className="font-semibold">Zone — {ZONE_SHAPES.find(([s]) => s === selectedZone.shape)?.[1]}</h3>
              <label className="flex items-center justify-between text-sm">
                Couleur
                <input type="color" value={selectedZone.color} onChange={(e) => handlePatchZone({ color: e.target.value })}
                  className="w-8 h-8 rounded border border-[var(--border)]" />
              </label>
              <div className="flex items-center justify-between text-sm">
                <span>{selectedZone.shape === 'circle' ? 'Rayon' : 'Longueur'}</span>
                <div className="flex gap-1">
                  <button onClick={() => handlePatchZone({ size_delta: -2 })} className={smallBtn}>−</button>
                  <button onClick={() => handlePatchZone({ size_delta: 2 })} className={smallBtn}>+</button>
                </div>
              </div>
              {selectedZone.shape !== 'circle' && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span>Largeur</span>
                    <div className="flex gap-1">
                      <button onClick={() => handlePatchZone({ width_delta: -2 })} className={smallBtn}>−</button>
                      <button onClick={() => handlePatchZone({ width_delta: 2 })} className={smallBtn}>+</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Rotation</span>
                    <div className="flex gap-1">
                      <button onClick={() => handlePatchZone({ rotation_delta: -15 })} className={smallBtn}>↺</button>
                      <button onClick={() => handlePatchZone({ rotation_delta: 15 })} className={smallBtn}>↻</button>
                    </div>
                  </div>
                </>
              )}
              <button onClick={() => handlePatchZone({ visible_to_players: !selectedZone.visible_to_players })} className={btn}>
                {selectedZone.visible_to_players ? 'Cacher aux joueurs' : 'Montrer aux joueurs'}
              </button>
              <button onClick={handleDeleteZone} className="px-3 py-1.5 text-sm rounded border border-red-400 text-red-500 hover:bg-red-500/10">
                Supprimer la zone
              </button>
            </>
          ) : (
            <>
              <h3 className="font-semibold text-sm">Sur la scène</h3>
              {board.tokens.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  Aucun pion. Ouvre les <b>📚 Bibliothèques</b> (B) et fais glisser un ennemi ou un personnage sur le plateau.
                </p>
              ) : scenePawns.map(([title, tokens]) => tokens.length > 0 && (
                <div key={title} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs text-[var(--text-secondary)]">{title} ({tokens.length})</span>
                    {title === 'Cachés' && (
                      <span className="flex gap-1">
                        <button onClick={() => selectOnly(tokens)} className="px-1.5 py-0.5 text-[10px] rounded border border-[var(--border)] hover:border-[var(--accent)]">Sélectionner</button>
                        <button onClick={() => setVisible(tokens, true)} className="px-1.5 py-0.5 text-[10px] rounded border border-[var(--border)] hover:border-[var(--accent)]">👁️ Tout montrer</button>
                      </span>
                    )}
                  </div>
                  {tokens.map((t) => (
                    <div key={t.id} className="flex items-center gap-1">
                      <button onClick={(e) => selectToken(t, e)} className="flex-1 min-w-0 text-left px-2 py-1 text-sm rounded hover:bg-[var(--bg-input)] truncate">
                        {t.label}
                        {t.hp_max != null && <span className="text-xs text-[var(--text-secondary)]"> · {t.hp_current}/{t.hp_max}</span>}
                      </button>
                      {!(t.character_id && !t.is_npc) && (
                        <button onClick={() => onToggleTokenVisible(t)} title={t.visible_to_players ? 'Cacher aux joueurs' : 'Montrer aux joueurs'}
                          className="w-7 h-7 rounded hover:bg-[var(--bg-input)]">
                          {t.visible_to_players ? '👁️' : '🙈'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Clic droit sur un pion pour ses actions · Maj+clic ou rectangle pour en sélectionner plusieurs · Suppr pour supprimer · H pour montrer/cacher.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Right-click menu, right next to the pawn: same actions as the side panel, for the whole
          selection. The transparent backdrop closes it on any click elsewhere. */}
      {menu && selectedTokens.length > 0 && (
        <>
          <div className="fixed inset-0 z-[90]" onPointerDown={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div
            className="glass-blur fixed z-[100] w-64 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--accent)] shadow-2xl"
            style={{ left: Math.min(menu.x, window.innerWidth - 272), top: Math.min(menu.y, window.innerHeight - 320) }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-sm truncate">
                {selectedTokens.length === 1 ? selectedTokens[0].label : `${selectedTokens.length} pions`}
              </span>
              <button onClick={() => setMenu(null)} className="px-1 text-[var(--text-secondary)]">✕</button>
            </div>
            <SelectionActions key={selectedIds.join(',')} tokens={selectedTokens} {...actionProps} />
          </div>
        </>
      )}

      {previewHandout && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6" onClick={() => setPreviewHandout(null)}>
          <div className="flex flex-col gap-2 max-w-3xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <img src={previewHandout.url} alt={previewHandout.label}
              className="max-w-full max-h-[80vh] object-contain rounded-lg border-2 border-[var(--accent)] shadow-2xl" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-white/80 truncate">{previewHandout.label}</span>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { onShowHandout(previewHandout.url); setPreviewHandout(null); }}
                  className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]">
                  📢 Montrer aux joueurs
                </button>
                <button onClick={() => setPreviewHandout(null)} className="px-3 py-1.5 text-sm rounded border border-white/30 text-white hover:bg-white/10">
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
