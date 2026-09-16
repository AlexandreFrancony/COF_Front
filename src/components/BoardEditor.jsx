import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import BoardCanvas from './BoardCanvas';
import CharacterSummaryCard from './CharacterSummaryCard';
import CreatureSummaryCard from './CreatureSummaryCard';
import InitiativeTracker from './InitiativeTracker';
import { getMonstres, updateMonstre, uploadMonstreImage } from '../utils/api';

const ZONE_SHAPES = [
  ['circle', 'Cercle'],
  ['cone', 'Cône'],
  ['rectangle', 'Ligne / rectangle'],
];

const MONSTRE_CATEGORY_LABELS = { humanoide: 'Humanoïdes', animal: 'Animaux', fantastique: 'Créatures fantastiques' };

// A handful of common COF2 combat conditions, not an exhaustive list — the free-text field next
// to these covers anything else. Toggle presence in the selected token's own status_icons array.
const STATUS_PRESETS = [
  ['🤢', 'Empoisonné'], ['🔥', 'Enflammé'], ['💫', 'Étourdi'],
  ['😱', 'Effrayé'], ['⛓️', 'Entravé'], ['🛌', 'À terre'],
];

/**
 * The full GM board-editing UI (toolbar + canvas + side panel) — background, grid, token size,
 * adding pawns/zones, and per-selection controls. Originally lived inline in Board.jsx; extracted
 * so the scenario prep panel (CampaignDetail.jsx) can reuse the exact same editor instead of a
 * stripped-down reimplementation that drifts out of feature parity with the live board.
 *
 * Deliberately data-source agnostic: it never calls the API directly, only the handler props
 * (each mirrors one board.js / scenarios.js endpoint 1:1). The caller owns state — every handler
 * is expected to make its own API call, update the caller's own state with the response, and
 * handle its own errors (toast included), the same way Board.jsx's handlers always have. This
 * component only manages its own UI-only state: what's currently selected, the add-token/library
 * panel toggles. That's what lets the exact same component sit on top of either a live
 * campaign board or a scenario's prep board — the two just wire different handlers to it.
 *
 * withCamera=false (the scenario-prep case) hides the projected-camera frame and its controls
 * entirely — a scenario has no "what's currently on the TV" concept, only the live board does.
 */
export default function BoardEditor({
  board, characters = [],
  mediaLibrary = [], onUploadBackground, onPickBackground, onDeleteMedia,
  onUploadMusic, onPickMusic, onUpdateMusic,
  onToggleGrid, onTokenSize,
  onAddToken, onAddCharacterToken, onMoveToken, onToggleTokenVisible, onDeleteToken, onUploadTokenImage,
  onTokenHpChange, onToggleTokenHideHp, onTokenPlayerLabelChange, onTokenStatusIconsChange,
  onAddZone, onMoveZone, onPatchZone, onDeleteZone,
  withCamera = false, onCameraDragEnd, onCameraResizeEnd, onCameraZoom, onCameraReset,
  onInitiativeVisibleChange, onInitiativeNext, onInitiativeReset,
  onPing, pings = [],
  hudPlayers = null, hudEnemies = null,
}) {
  // id only (not the token object) — re-derived from the live `board` prop below so the
  // summary panel keeps tracking PV/PM/Chance as they change (via SSE, e.g. a level-up, or a
  // teammate's own edit) instead of freezing on whatever the object looked like at selection.
  const [selectedTokenId, setSelectedTokenId] = useState(null);
  const selectedToken = board.tokens.find((t) => t.id === selectedTokenId) || null;
  const [selectedZone, setSelectedZone] = useState(null);
  const [cameraSelected, setCameraSelected] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showMusicLibrary, setShowMusicLibrary] = useState(false);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [pingArmed, setPingArmed] = useState(false);
  const [customStatusIcon, setCustomStatusIcon] = useState('');
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [newTokenHp, setNewTokenHp] = useState('');
  const [newTokenOwnerId, setNewTokenOwnerId] = useState(null);
  const [uploadingBg, setUploadingBg] = useState(false);
  // Global reference data (same for every campaign), not board state — fetched here directly
  // rather than threaded through props, same reasoning as CharacterSheet.jsx fetching
  // rules_voies/rules_armures itself instead of the caller owning them.
  const [monstres, setMonstres] = useState([]);
  const [showMonsterLibrary, setShowMonsterLibrary] = useState(false);
  const [monsterSearch, setMonsterSearch] = useState('');
  const [editingMonstreId, setEditingMonstreId] = useState(null);

  useEffect(() => {
    getMonstres().then(setMonstres).catch((e) => toast.error(e.message));
  }, []);

  const tokenlessCharacters = characters.filter((c) => !board.tokens.some((t) => t.character_id === c.id));
  // The "Golem" capacité (which grants the actual construct, p.176 rules_capacites) only
  // unlocks at rang 2 of the voie — rang 1 ("Grosse tête") has nothing to summon yet.
  const golemCharacters = characters.filter((c) => c.golem_rang >= 2);

  // Pre-fills the pawn form instead of creating the token directly — niveau×5 is only the base
  // PV formula (p.176 rules_capacites); the rang-5 "Golem supérieur" upgrade "Grande taille"
  // adds +2 PV/niveau on top, and there's no structured field anywhere for which upgrade (of
  // 8 possible) a character picked. Landing the base value in the already-editable PV field
  // lets the GM bump it by hand for that case instead of the button silently getting it wrong.
  const handleAddGolem = (character) => {
    setNewTokenLabel(`Golem de ${character.name}`);
    setNewTokenHp(String(character.level * 5));
    setNewTokenOwnerId(character.id);
  };

  // Unlike the golem shortcut, a bestiary monster's stats are fixed and known in advance —
  // nothing ambiguous to adjust before creating, so this creates the pawn directly instead of
  // pre-filling the form for the GM to tweak.
  const handleAddMonstre = (monstre) => {
    onAddToken(monstre.name, monstre.pv, null, monstre.id);
    setShowMonsterLibrary(false);
    setMonsterSearch('');
  };

  // The bestiary is global reference data, not board state — edited in place here (rather than
  // through a handler prop like every other panel above) since it's the same for every campaign
  // and already fetched directly by this component, same reasoning as the fetch itself.
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

  const handleBackgroundUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBg(true);
    try {
      await onUploadBackground(file);
    } finally {
      setUploadingBg(false);
      e.target.value = '';
    }
  };

  const handlePickMedia = async (media) => {
    await onPickBackground(media);
    setShowLibrary(false);
  };

  const handleMusicUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMusic(true);
    try {
      await onUploadMusic(file);
    } finally {
      setUploadingMusic(false);
      e.target.value = '';
    }
  };

  const handlePickMusic = async (media) => {
    await onPickMusic(media);
    setShowMusicLibrary(false);
  };

  const handleAddToken = (e) => {
    e.preventDefault();
    if (!newTokenLabel.trim()) return;
    onAddToken(newTokenLabel.trim(), newTokenHp ? Number(newTokenHp) : undefined, newTokenOwnerId);
    setNewTokenLabel('');
    setNewTokenHp('');
    setNewTokenOwnerId(null);
  };

  // hp_delta applies server-side atomically (see board.js's PATCH /board/tokens/:tokenId) —
  // selectedToken re-derives from the response once the caller's board state updates (it's now
  // id-based, see selectedTokenId above), so repeated +/- clicks read the actual persisted value,
  // same pattern as the zone panel's own handlePatchZone.
  const handleTokenHp = (delta) => onTokenHpChange(selectedToken.id, delta);
  const handleToggleHideHp = () => onToggleTokenHideHp(selectedToken);
  // Saved on blur (not on every keystroke) — same pattern as CharacterSheet.jsx's description/
  // équipement free-text fields, no reason to fire a request per character typed.
  const handlePlayerHpLabelBlur = (e) => onTokenPlayerLabelChange(selectedToken, e.target.value.trim());

  const handleToggleStatusIcon = (icon) => {
    const current = selectedToken.status_icons || [];
    const next = current.includes(icon) ? current.filter((i) => i !== icon) : [...current, icon];
    onTokenStatusIconsChange(selectedToken, next);
  };

  const handleAddCustomStatusIcon = (e) => {
    e.preventDefault();
    const icon = customStatusIcon.trim();
    if (!icon) return;
    onTokenStatusIconsChange(selectedToken, [...(selectedToken.status_icons || []), icon]);
    setCustomStatusIcon('');
  };

  const handleToggleTokenVisible = (token) => {
    onToggleTokenVisible(token);
    setSelectedTokenId(null);
  };

  const handleDeleteToken = (token) => {
    onDeleteToken(token);
    setSelectedTokenId(null);
  };

  const handleAddZone = async (shape) => {
    const updated = await onAddZone(shape);
    // New zones always spawn at the board's center (50/50) — exactly where the camera frame
    // usually sits too, so without auto-selecting it the GM has no way to grab it out from
    // under the frame (zones have no HUD card to click, unlike tokens).
    setCameraSelected(false);
    setSelectedTokenId(null);
    setSelectedZone(updated.zones[updated.zones.length - 1]);
  };

  // onPatchZone resolves with the full updated board/scenario (like every other handler here) —
  // selectedZone is re-synced from it (not just left as the pre-patch object) because, unlike
  // the token panel, this one binds a live control straight to mutable zone fields (the color
  // swatch's value): leaving selectedZone stale would show the color that was just replaced.
  const handlePatchZone = async (data) => {
    const updated = await onPatchZone(selectedZone.id, data);
    setSelectedZone(updated.zones.find((z) => z.id === selectedZone.id) || null);
  };

  const handleToggleZoneVisible = () => handlePatchZone({ visible_to_players: !selectedZone.visible_to_players });
  const handleZoneColor = (e) => handlePatchZone({ color: e.target.value });
  const handleZoneSize = (delta) => handlePatchZone({ size_delta: delta });
  const handleZoneWidth = (delta) => handlePatchZone({ width_delta: delta });
  const handleZoneRotation = (delta) => handlePatchZone({ rotation_delta: delta });

  const handleDeleteZone = () => {
    onDeleteZone(selectedZone);
    setSelectedZone(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
        <label className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white cursor-pointer hover:bg-[var(--accent-hover)]">
          {uploadingBg ? 'Envoi...' : 'Envoyer un fond (image ou vidéo)'}
          <input
            type="file"
            accept="image/*,video/mp4"
            onChange={handleBackgroundUpload}
            className="hidden"
            disabled={uploadingBg}
          />
        </label>

        <button
          onClick={() => setShowLibrary((v) => !v)}
          className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]"
        >
          Bibliothèque ({mediaLibrary.filter((m) => m.type !== 'audio').length})
        </button>

        {withCamera && (
          <button
            onClick={() => setShowMusicLibrary((v) => !v)}
            className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]"
          >
            🎵 Musique ({mediaLibrary.filter((m) => m.type === 'audio').length})
          </button>
        )}

        {/* Only rendered once a track is actually picked — nothing to play/pause/clear before
            that. Volume/playing state lives on board_states itself (not local UI state) so it's
            the same for every viewer of the projector, not just whichever browser last touched
            the slider. */}
        {withCamera && board.music_url && (
          <div className="flex items-center gap-1.5 px-2 py-1 text-sm border border-[var(--border)] rounded">
            <button
              onClick={() => onUpdateMusic({ music_playing: !board.music_playing })}
              title={board.music_playing ? 'Mettre en pause' : 'Lire'}
              className="w-7 h-7 rounded hover:bg-[var(--bg-input)]"
            >
              {board.music_playing ? '⏸️' : '▶️'}
            </button>
            <span className="text-[var(--text-secondary)]" title="🔊 Volume">🔊</span>
            <input
              type="range" min="0" max="1" step="0.05"
              value={board.music_volume ?? 0.5}
              onChange={(e) => onUpdateMusic({ music_volume: parseFloat(e.target.value) })}
              className="w-20"
            />
            <button
              onClick={() => onUpdateMusic({ music_url: '', music_playing: false })}
              title="Arrêter la musique"
              className="w-7 h-7 rounded hover:bg-[var(--bg-input)] text-[var(--text-secondary)]"
            >
              ✕
            </button>
          </div>
        )}

        {withCamera && (
          <button
            onClick={() => setPingArmed((v) => !v)}
            title="Le prochain clic sur le plateau montre un repère à tout le monde"
            className={`px-3 py-1.5 text-sm rounded border hover:border-[var(--accent)] ${
              pingArmed ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'border-[var(--border)]'
            }`}
          >
            📍 Pointeur
          </button>
        )}

        <button
          onClick={() => setShowMonsterLibrary((v) => !v)}
          className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]"
        >
          🗡️ Bibliothèque d'ennemis ({monstres.length})
        </button>

        <button
          onClick={onToggleGrid}
          className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]"
        >
          {board.grid_visible ? 'Masquer la grille' : 'Afficher la grille'}
        </button>

        {withCamera && (
          <label className="flex items-center gap-1.5 text-sm px-1">
            <input
              type="checkbox"
              checked={board.initiative_visible}
              onChange={(e) => onInitiativeVisibleChange(e.target.checked)}
            />
            Afficher l'initiative sur le projecteur
          </label>
        )}

        <div className="flex items-center gap-1 px-1 text-sm border border-[var(--border)] rounded">
          <span className="pl-1 text-[var(--text-secondary)]">Taille des pions</span>
          <button onClick={() => onTokenSize(-8)} className="w-7 h-7 rounded hover:bg-[var(--bg-input)]">−</button>
          <button onClick={() => onTokenSize(8)} className="w-7 h-7 rounded hover:bg-[var(--bg-input)]">+</button>
        </div>

        <form onSubmit={handleAddToken} className="flex gap-2">
          <input
            type="text"
            placeholder="Nom du pion"
            value={newTokenLabel}
            onChange={(e) => { setNewTokenLabel(e.target.value); setNewTokenOwnerId(null); }}
            className="px-2 py-1.5 text-sm rounded bg-[var(--bg-input)] border border-[var(--border)]"
          />
          <input
            type="number"
            min="1"
            placeholder="PV (optionnel)"
            title="Pour un pion-créature (golem, familier...) avec sa propre barre de vie"
            value={newTokenHp}
            onChange={(e) => setNewTokenHp(e.target.value)}
            className="w-28 px-2 py-1.5 text-sm rounded bg-[var(--bg-input)] border border-[var(--border)]"
          />
          <button type="submit" className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]">
            Ajouter un pion
          </button>
        </form>

        {tokenlessCharacters.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tokenlessCharacters.map((c) => (
              <button
                key={c.id}
                onClick={() => onAddCharacterToken(c)}
                className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]"
              >
                + {c.name}
              </button>
            ))}
          </div>
        )}

        {golemCharacters.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {golemCharacters.map((c) => (
              <button
                key={c.id}
                onClick={() => handleAddGolem(c)}
                title={`Pré-remplit le formulaire ci-dessus avec "Golem de ${c.name}" et ${c.level * 5} PV (niveau × 5) — ajuste le nombre de PV si le golem a été amélioré (rang 5), puis clique "Ajouter un pion"`}
                className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]"
              >
                + 🗿 Golem ({c.name})
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-1">
          {ZONE_SHAPES.map(([shape, label]) => (
            <button
              key={shape}
              onClick={() => handleAddZone(shape)}
              className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]"
            >
              + Zone : {label}
            </button>
          ))}
        </div>
      </div>

      {showLibrary && (
        <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
          <h3 className="font-semibold mb-2 text-sm">Bibliothèque de fonds</h3>
          {mediaLibrary.filter((m) => m.type !== 'audio').length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Aucun fond envoyé pour l'instant.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {mediaLibrary.filter((m) => m.type !== 'audio').map((media) => (
                <div key={media.id} className="w-28 flex flex-col gap-1">
                  <button
                    onClick={() => handlePickMedia(media)}
                    className="w-28 h-20 rounded border border-[var(--border)] hover:border-[var(--accent)] overflow-hidden bg-black/20 flex items-center justify-center"
                  >
                    {media.type === 'video' ? (
                      <video src={media.url} className="w-full h-full object-cover" muted />
                    ) : (
                      <img src={media.url} alt={media.label} className="w-full h-full object-cover" />
                    )}
                  </button>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] truncate text-[var(--text-secondary)]" title={media.label}>
                      {media.type === 'video' ? '🎬 ' : '🖼 '}{media.label}
                    </span>
                    <button
                      onClick={() => onDeleteMedia(media)}
                      className="text-[10px] text-red-500 hover:underline shrink-0"
                    >
                      suppr.
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {withCamera && showMusicLibrary && (
        <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-sm">🎵 Bibliothèque de musique</h3>
            <label className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white cursor-pointer hover:bg-[var(--accent-hover)]">
              {uploadingMusic ? 'Envoi...' : 'Envoyer une piste'}
              <input
                type="file"
                accept="audio/*"
                onChange={handleMusicUpload}
                className="hidden"
                disabled={uploadingMusic}
              />
            </label>
          </div>
          {mediaLibrary.filter((m) => m.type === 'audio').length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Aucune piste envoyée pour l'instant.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {mediaLibrary.filter((m) => m.type === 'audio').map((media) => (
                <div key={media.id} className="flex flex-wrap items-center gap-2 p-2 rounded border border-[var(--border)]">
                  <span className="text-sm truncate flex-1 min-w-[8rem]" title={media.label}>🎵 {media.label}</span>
                  <audio src={media.url} controls className="h-8 max-w-full" />
                  <button
                    onClick={() => handlePickMusic(media)}
                    className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]"
                  >
                    Utiliser
                  </button>
                  <button
                    onClick={() => onDeleteMedia(media)}
                    className="text-[10px] text-red-500 hover:underline shrink-0"
                  >
                    suppr.
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showMonsterLibrary && (
        <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-sm">🗡️ Bibliothèque d'ennemis</h3>
            <input
              type="text"
              placeholder="Rechercher (ex: gobelin, ours...)"
              value={monsterSearch}
              onChange={(e) => setMonsterSearch(e.target.value)}
              className="px-2 py-1 text-sm rounded bg-[var(--bg-input)] border border-[var(--border)]"
            />
          </div>
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
                          onClick={() => handleAddMonstre(m)}
                          title={`NC ${m.nc} · Déf ${m.defense} · PV ${m.pv} · Init ${m.initiative}`}
                          className="px-2 py-1 text-xs rounded-l border border-[var(--border)] hover:border-[var(--accent)]"
                        >
                          + {m.emoji || '❔'} {m.name} <span className="text-[var(--text-secondary)]">NC{m.nc}</span>
                        </button>
                        <button
                          onClick={() => setEditingMonstreId((id) => (id === m.id ? null : m.id))}
                          title="Personnaliser l'emoji/l'image par défaut de ce monstre"
                          className={`px-1.5 text-xs rounded-r border border-l-0 border-[var(--border)] hover:border-[var(--accent)] ${
                            editingMonstreId === m.id ? 'bg-[var(--bg-input)]' : ''
                          }`}
                        >
                          ✏️
                        </button>
                      </div>
                      {editingMonstreId === m.id && (
                        <div className="flex items-center gap-1.5 px-1.5 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)]">
                          <input
                            key={m.id}
                            type="text"
                            maxLength={4}
                            defaultValue={m.emoji || ''}
                            onBlur={(e) => handleMonstreEmojiBlur(m, e)}
                            title="Emoji par défaut"
                            className="w-10 px-1 py-0.5 text-sm text-center rounded bg-[var(--bg-card)] border border-[var(--border)]"
                          />
                          <label className="px-2 py-0.5 text-[10px] rounded border border-[var(--border)] cursor-pointer hover:border-[var(--accent)] whitespace-nowrap">
                            {m.image_url ? '🖼️ Changer' : '🖼️ Image'}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => e.target.files?.[0] && handleMonstreImageUpload(m, e.target.files[0])}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {withCamera && (
        <InitiativeTracker board={board} isGm onNext={onInitiativeNext} onReset={onInitiativeReset} />
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        <BoardCanvas
          board={board}
          isGm
          className="relative flex-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]"
          style={{ aspectRatio: '16 / 9' }}
          hudPlayers={hudPlayers}
          hudEnemies={hudEnemies}
          selectedToken={selectedToken}
          onSelectToken={(token) => { setCameraSelected(false); setSelectedZone(null); setSelectedTokenId(token.id); }}
          onTokenDragEnd={onMoveToken}
          selectedZone={selectedZone}
          onSelectZone={(zone) => { setCameraSelected(false); setSelectedTokenId(null); setSelectedZone(zone); }}
          onZoneDragEnd={onMoveZone}
          showCameraFrame={withCamera}
          cameraSelected={cameraSelected}
          onSelectCamera={() => { setSelectedTokenId(null); setSelectedZone(null); setCameraSelected(true); }}
          onCameraDragEnd={onCameraDragEnd}
          onCameraResizeEnd={onCameraResizeEnd}
          onBackgroundClick={() => { setSelectedTokenId(null); setSelectedZone(null); setCameraSelected(false); }}
          pingMode={pingArmed}
          onPing={(x, y) => { onPing(x, y); setPingArmed(false); }}
          pings={pings}
        />

        {/* Always rendered at a fixed width (not conditionally mounted) — otherwise the board's
            flex-1 width jumps every time a selection appears/disappears, resizing the whole
            16:9 canvas under the GM's cursor mid-session. */}
        <div className="w-full lg:w-64 shrink-0 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-3 h-fit">
          {withCamera && cameraSelected ? (
            <>
              <h3 className="font-semibold">🎥 Cadre projeté</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Ce que les joueurs voient sur le mode projecteur. Fais glisser son étiquette pour le déplacer.
              </p>

              <div className="flex items-center justify-between text-sm">
                <span>Zoom</span>
                <div className="flex gap-1">
                  <button onClick={() => onCameraZoom(10)} className="w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)]">−</button>
                  <button onClick={() => onCameraZoom(-10)} className="w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)]">+</button>
                </div>
              </div>

              <button
                onClick={onCameraReset}
                className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]"
              >
                Recentrer sur tout le plateau
              </button>
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

              {selectedToken.hp_max != null && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span>PV {selectedToken.hp_current}/{selectedToken.hp_max}</span>
                    <div className="flex gap-1">
                      <button onClick={() => handleTokenHp(-1)} className="w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)]">−</button>
                      <button onClick={() => handleTokenHp(1)} className="w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)]">+</button>
                    </div>
                  </div>

                  <button
                    onClick={handleToggleHideHp}
                    className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]"
                  >
                    {selectedToken.hide_hp_from_players ? '🙈 Vie cachée aux joueurs' : '👁️ Vie visible des joueurs'}
                  </button>

                  {selectedToken.hide_hp_from_players && (
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-[var(--text-secondary)]">Indicateur montré aux joueurs (optionnel)</span>
                      <input
                        key={selectedToken.id}
                        type="text"
                        maxLength={20}
                        placeholder="ex : 🩸🩸, Blessé, ??"
                        defaultValue={selectedToken.player_hp_label || ''}
                        onBlur={handlePlayerHpLabelBlur}
                        className="px-2 py-1.5 text-sm rounded bg-[var(--bg-input)] border border-[var(--border)]"
                      />
                    </label>
                  )}
                </>
              )}

              {withCamera && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-[var(--text-secondary)]">État</span>
                <div className="flex flex-wrap gap-1">
                  {STATUS_PRESETS.map(([icon, name]) => (
                    <button
                      key={icon}
                      onClick={() => handleToggleStatusIcon(icon)}
                      title={name}
                      className={`w-8 h-8 text-base rounded border hover:border-[var(--accent)] ${
                        selectedToken.status_icons?.includes(icon) ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)]'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <form onSubmit={handleAddCustomStatusIcon} className="flex gap-1">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="Autre emoji"
                    value={customStatusIcon}
                    onChange={(e) => setCustomStatusIcon(e.target.value)}
                    className="w-24 px-2 py-1 text-sm rounded bg-[var(--bg-input)] border border-[var(--border)]"
                  />
                  <button type="submit" className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]">
                    Ajouter
                  </button>
                </form>
              </div>
              )}

              <label className="px-3 py-1.5 text-sm text-center rounded border border-[var(--border)] cursor-pointer hover:border-[var(--accent)]">
                Image du pion
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onUploadTokenImage(selectedToken, e.target.files[0])}
                />
              </label>

              <button
                onClick={() => handleToggleTokenVisible(selectedToken)}
                className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]"
              >
                {selectedToken.visible_to_players ? 'Cacher aux joueurs' : 'Montrer aux joueurs'}
              </button>

              <button
                onClick={() => handleDeleteToken(selectedToken)}
                className="px-3 py-1.5 text-sm rounded border border-red-400 text-red-500 hover:bg-red-500/10"
              >
                Supprimer le pion
              </button>
            </>
          ) : selectedZone ? (
            <>
              <h3 className="font-semibold">
                Zone — {ZONE_SHAPES.find(([s]) => s === selectedZone.shape)?.[1]}
              </h3>

              <label className="flex items-center justify-between text-sm">
                Couleur
                <input type="color" value={selectedZone.color} onChange={handleZoneColor} className="w-8 h-8 rounded border border-[var(--border)]" />
              </label>

              <div className="flex items-center justify-between text-sm">
                <span>{selectedZone.shape === 'circle' ? 'Rayon' : 'Longueur'}</span>
                <div className="flex gap-1">
                  <button onClick={() => handleZoneSize(-2)} className="w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)]">−</button>
                  <button onClick={() => handleZoneSize(2)} className="w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)]">+</button>
                </div>
              </div>

              {selectedZone.shape !== 'circle' && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span>Largeur</span>
                    <div className="flex gap-1">
                      <button onClick={() => handleZoneWidth(-2)} className="w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)]">−</button>
                      <button onClick={() => handleZoneWidth(2)} className="w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)]">+</button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Rotation</span>
                    <div className="flex gap-1">
                      <button onClick={() => handleZoneRotation(-15)} className="w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)]">↺</button>
                      <button onClick={() => handleZoneRotation(15)} className="w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)]">↻</button>
                    </div>
                  </div>
                </>
              )}

              <button
                onClick={handleToggleZoneVisible}
                className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]"
              >
                {selectedZone.visible_to_players ? 'Cacher aux joueurs' : 'Montrer aux joueurs'}
              </button>

              <button
                onClick={handleDeleteZone}
                className="px-3 py-1.5 text-sm rounded border border-red-400 text-red-500 hover:bg-red-500/10"
              >
                Supprimer la zone
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                Sélectionne un pion, une zone{withCamera ? ' ou le cadre projeté (son étiquette)' : ''} pour le modifier.
              </p>
              {withCamera && (
                // Fallback entry point: at camera_width=100 the frame's corner sits at (0,0)
                // and its badge (shifted further up to sit above that corner) gets clipped
                // outside the board's overflow-hidden bounds, with no other way to reach it.
                <button
                  onClick={() => { setSelectedTokenId(null); setSelectedZone(null); setCameraSelected(true); }}
                  className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]"
                >
                  🎥 Modifier le cadre projeté
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
