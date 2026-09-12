import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import BoardCanvas from '../components/BoardCanvas';
import {
  getBoard, updateBoardBackground, updateBoardGrid, uploadBoardImage, createBoardToken,
  updateBoardToken, deleteBoardToken, createBoardZone, updateBoardZone, deleteBoardZone,
  getBoardStreamUrl, getCampaign, getCampaignCharacters,
  getBoardMedia, uploadBoardMedia, deleteBoardMedia,
} from '../utils/api';

const ZONE_SHAPES = [
  ['circle', 'Cercle'],
  ['cone', 'Cône'],
  ['rectangle', 'Ligne / rectangle'],
];

export default function Board() {
  const { id: campaignId } = useParams();
  const { isGm } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [board, setBoard] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [mediaLibrary, setMediaLibrary] = useState([]);
  const [showLibrary, setShowLibrary] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [campaignData, charactersData, boardData] = await Promise.all([
          getCampaign(campaignId),
          getCampaignCharacters(campaignId),
          getBoard(campaignId),
        ]);
        setCampaign(campaignData);
        setCharacters(charactersData);
        setBoard(boardData);
      } catch (error) {
        toast.error(error.message);
      }
    })();
  }, [campaignId]);

  useEffect(() => {
    if (isGm) getBoardMedia().then(setMediaLibrary).catch(() => {});
  }, [isGm]);

  useEffect(() => {
    const source = new EventSource(getBoardStreamUrl(campaignId));
    source.addEventListener('board', (event) => setBoard(JSON.parse(event.data)));
    return () => source.close();
  }, [campaignId]);

  const handleToggleGrid = async () => {
    try {
      setBoard(await updateBoardGrid(campaignId, { grid_visible: !board.grid_visible }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Every upload lands in the shared library first (so it's reusable next time / in another
  // campaign), then is immediately applied as this board's background.
  const handleBackgroundUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const media = await uploadBoardMedia(file);
      setMediaLibrary((prev) => [media, ...prev]);
      setBoard(await updateBoardBackground(campaignId, { url: media.url, type: media.type }));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handlePickMedia = async (media) => {
    try {
      setBoard(await updateBoardBackground(campaignId, { url: media.url, type: media.type }));
      setShowLibrary(false);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleDeleteMedia = async (media) => {
    try {
      await deleteBoardMedia(media.id);
      setMediaLibrary((prev) => prev.filter((m) => m.id !== media.id));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleAddToken = async (e) => {
    e.preventDefault();
    if (!newTokenLabel.trim()) return;
    try {
      setBoard(await createBoardToken(campaignId, { label: newTokenLabel.trim() }));
      setNewTokenLabel('');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleAddCharacterToken = async (character) => {
    try {
      setBoard(await createBoardToken(campaignId, { label: character.name, character_id: character.id }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleTokenDragEnd = async (tokenId, x, y) => {
    try {
      setBoard(await updateBoardToken(tokenId, { x, y }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleToggleTokenVisible = async (token) => {
    try {
      setBoard(await updateBoardToken(token.id, { visible_to_players: !token.visible_to_players }));
      setSelectedToken(null);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleDeleteToken = async (token) => {
    try {
      setBoard(await deleteBoardToken(token.id));
      setSelectedToken(null);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleTokenImageUpload = async (token, file) => {
    try {
      const { url } = await uploadBoardImage(campaignId, file);
      setBoard(await updateBoardToken(token.id, { image_url: url }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleAddZone = async (shape) => {
    try {
      const created = await createBoardZone(campaignId, { shape });
      setBoard(created);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleZoneDragEnd = async (zoneId, x, y) => {
    try {
      setBoard(await updateBoardZone(zoneId, { x, y }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const patchSelectedZone = async (data) => {
    try {
      const updated = await updateBoardZone(selectedZone.id, data);
      setBoard(updated);
      setSelectedZone(updated.zones.find((z) => z.id === selectedZone.id) || null);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleToggleZoneVisible = () => patchSelectedZone({ visible_to_players: !selectedZone.visible_to_players });
  const handleZoneColor = (e) => patchSelectedZone({ color: e.target.value });
  // Deltas, applied atomically server-side — a client-computed absolute value would drop
  // clicks fired in quick succession, before the previous request's response updates selectedZone.
  const handleZoneSize = (delta) => patchSelectedZone({ size_delta: delta });
  const handleZoneWidth = (delta) => patchSelectedZone({ width_delta: delta });
  const handleZoneRotation = (delta) => patchSelectedZone({ rotation_delta: delta });

  const handleDeleteZone = async () => {
    try {
      setBoard(await deleteBoardZone(selectedZone.id));
      setSelectedZone(null);
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (!campaign || !board) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  const tokenlessCharacters = characters.filter((c) => !board.tokens.some((t) => t.character_id === c.id));
  // The HUD shows one card per token linked to a character — never for a free-floating pawn.
  // Enemy stats are only ever assembled for the GM: the backend already strips a PNJ token's
  // stats for a player-role fetch, this is the second layer that keeps them off-screen.
  const hudPlayers = board.tokens.filter((t) => t.character_id && !t.is_npc);
  const hudEnemies = isGm ? board.tokens.filter((t) => t.character_id && t.is_npc) : null;

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link to={`/campaigns/${campaignId}`} className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)]">
            ← {campaign.name}
          </Link>
          <h1 className="text-xl font-bold text-[var(--accent)]">Plateau</h1>
        </div>
        <a
          href={`/campaigns/${campaignId}/board/projector`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] hover:border-[var(--accent)]"
        >
          Mode projecteur ↗
        </a>
      </div>

      {isGm && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
          <label className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white cursor-pointer hover:bg-[var(--accent-hover)]">
            {uploading ? 'Envoi...' : 'Envoyer un fond (image ou vidéo)'}
            <input
              type="file"
              accept="image/*,video/mp4"
              onChange={handleBackgroundUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>

          <button
            onClick={() => setShowLibrary((v) => !v)}
            className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]"
          >
            Bibliothèque ({mediaLibrary.length})
          </button>

          <button
            onClick={handleToggleGrid}
            className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]"
          >
            {board.grid_visible ? 'Masquer la grille' : 'Afficher la grille'}
          </button>

          <form onSubmit={handleAddToken} className="flex gap-2">
            <input
              type="text"
              placeholder="Nom du pion"
              value={newTokenLabel}
              onChange={(e) => setNewTokenLabel(e.target.value)}
              className="px-2 py-1.5 text-sm rounded bg-[var(--bg-input)] border border-[var(--border)]"
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
                  onClick={() => handleAddCharacterToken(c)}
                  className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]"
                >
                  + {c.name}
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
      )}

      {isGm && showLibrary && (
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
                      onClick={() => handleDeleteMedia(media)}
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
          isGm={isGm}
          className="relative flex-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]"
          style={{ aspectRatio: '16 / 9' }}
          hudPlayers={hudPlayers}
          hudEnemies={hudEnemies}
          selectedToken={selectedToken}
          onSelectToken={setSelectedToken}
          onTokenDragEnd={handleTokenDragEnd}
          selectedZone={selectedZone}
          onSelectZone={setSelectedZone}
          onZoneDragEnd={handleZoneDragEnd}
          onBackgroundClick={() => { setSelectedToken(null); setSelectedZone(null); }}
        />

        {isGm && selectedToken && (
          <div className="w-full lg:w-64 shrink-0 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-3 h-fit">
            <h3 className="font-semibold">{selectedToken.label}</h3>

            <label className="px-3 py-1.5 text-sm text-center rounded border border-[var(--border)] cursor-pointer hover:border-[var(--accent)]">
              Image du pion
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleTokenImageUpload(selectedToken, e.target.files[0])}
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
          </div>
        )}

        {isGm && selectedZone && (
          <div className="w-full lg:w-64 shrink-0 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-3 h-fit">
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
          </div>
        )}
      </div>
    </div>
  );
}
