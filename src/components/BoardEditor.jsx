import { useState } from 'react';
import BoardCanvas from './BoardCanvas';
import CharacterSummaryCard from './CharacterSummaryCard';

const ZONE_SHAPES = [
  ['circle', 'Cercle'],
  ['cone', 'Cône'],
  ['rectangle', 'Ligne / rectangle'],
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
  onToggleGrid, onTokenSize,
  onAddToken, onAddCharacterToken, onMoveToken, onToggleTokenVisible, onDeleteToken, onUploadTokenImage,
  onTokenHpChange,
  onAddZone, onMoveZone, onPatchZone, onDeleteZone,
  withCamera = false, onCameraDragEnd, onCameraResizeEnd, onCameraZoom, onCameraReset,
  hudPlayers = null, hudEnemies = null,
}) {
  const [selectedToken, setSelectedToken] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [cameraSelected, setCameraSelected] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [newTokenHp, setNewTokenHp] = useState('');
  const [uploadingBg, setUploadingBg] = useState(false);

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

  const handleAddToken = (e) => {
    e.preventDefault();
    if (!newTokenLabel.trim()) return;
    onAddToken(newTokenLabel.trim(), newTokenHp ? Number(newTokenHp) : undefined);
    setNewTokenLabel('');
    setNewTokenHp('');
  };

  // hp_delta applies server-side atomically (see board.js's PATCH /board/tokens/:tokenId) —
  // selectedToken is re-synced from the response (not left stale) so repeated +/- clicks read
  // the actual persisted value, same pattern as the zone panel's own handlePatchZone.
  const handleTokenHp = async (delta) => {
    const updated = await onTokenHpChange(selectedToken.id, delta);
    setSelectedToken(updated.tokens.find((t) => t.id === selectedToken.id) || null);
  };

  const handleToggleTokenVisible = (token) => {
    onToggleTokenVisible(token);
    setSelectedToken(null);
  };

  const handleDeleteToken = (token) => {
    onDeleteToken(token);
    setSelectedToken(null);
  };

  const handleAddZone = async (shape) => {
    const updated = await onAddZone(shape);
    // New zones always spawn at the board's center (50/50) — exactly where the camera frame
    // usually sits too, so without auto-selecting it the GM has no way to grab it out from
    // under the frame (zones have no HUD card to click, unlike tokens).
    setCameraSelected(false);
    setSelectedToken(null);
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
          Bibliothèque ({mediaLibrary.length})
        </button>

        <button
          onClick={onToggleGrid}
          className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]"
        >
          {board.grid_visible ? 'Masquer la grille' : 'Afficher la grille'}
        </button>

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
            onChange={(e) => setNewTokenLabel(e.target.value)}
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
          {mediaLibrary.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Aucun fond envoyé pour l'instant.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {mediaLibrary.map((media) => (
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

      <div className="flex flex-col lg:flex-row gap-4">
        <BoardCanvas
          board={board}
          isGm
          className="relative flex-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]"
          style={{ aspectRatio: '16 / 9' }}
          hudPlayers={hudPlayers}
          hudEnemies={hudEnemies}
          selectedToken={selectedToken}
          onSelectToken={(token) => { setCameraSelected(false); setSelectedZone(null); setSelectedToken(token); }}
          onTokenDragEnd={onMoveToken}
          selectedZone={selectedZone}
          onSelectZone={(zone) => { setCameraSelected(false); setSelectedToken(null); setSelectedZone(zone); }}
          onZoneDragEnd={onMoveZone}
          showCameraFrame={withCamera}
          cameraSelected={cameraSelected}
          onSelectCamera={() => { setSelectedToken(null); setSelectedZone(null); setCameraSelected(true); }}
          onCameraDragEnd={onCameraDragEnd}
          onCameraResizeEnd={onCameraResizeEnd}
          onBackgroundClick={() => { setSelectedToken(null); setSelectedZone(null); setCameraSelected(false); }}
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
              ) : (
                <h3 className="font-semibold">{selectedToken.label}</h3>
              )}

              {selectedToken.hp_max != null && (
                <div className="flex items-center justify-between text-sm">
                  <span>PV {selectedToken.hp_current}/{selectedToken.hp_max}</span>
                  <div className="flex gap-1">
                    <button onClick={() => handleTokenHp(-1)} className="w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)]">−</button>
                    <button onClick={() => handleTokenHp(1)} className="w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)]">+</button>
                  </div>
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
                  onClick={() => { setSelectedToken(null); setSelectedZone(null); setCameraSelected(true); }}
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
