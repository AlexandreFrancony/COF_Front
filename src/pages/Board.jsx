import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import BoardCanvas from '../components/BoardCanvas';
import {
  getBoard, updateBoardBackground, updateBoardGrid, uploadBoardImage, createBoardToken,
  updateBoardToken, deleteBoardToken, createBoardZone, updateBoardZone, deleteBoardZone,
  getBoardStreamUrl, getCampaign, getCampaignCharacters,
} from '../utils/api';

const ZONE_SHAPES = [
  ['circle', 'Cercle'],
  ['cone', 'Cône'],
  ['rectangle', 'Ligne / rectangle'],
];

function CharacterHud({ character }) {
  if (!character) return null;
  return (
    <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] flex flex-wrap gap-4 text-sm">
      <span className="font-semibold">{character.name}</span>
      <span>PV {character.pv_current}/{character.pv_max}</span>
      {character.pm_max > 0 && <span>PM {character.pm_current}/{character.pm_max}</span>}
      <span>Chance {character.points_chance}</span>
      <span>DEF {character.defense}</span>
      <span>Init {character.initiative}</span>
    </div>
  );
}

export default function Board() {
  const { id: campaignId } = useParams();
  const { isGm, user } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [board, setBoard] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [uploading, setUploading] = useState(false);

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

  const handleBackgroundUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadBoardImage(campaignId, file);
      setBoard(await updateBoardBackground(campaignId, url));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setUploading(false);
      e.target.value = '';
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
  const handleZoneSize = (delta) => patchSelectedZone({ size: Math.max(1, selectedZone.size + delta) });
  const handleZoneWidth = (delta) => patchSelectedZone({ width: Math.max(1, selectedZone.width + delta) });
  const handleZoneRotation = (delta) => patchSelectedZone({ rotation: (selectedZone.rotation + delta + 360) % 360 });

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

  const myCharacter = !isGm ? characters.find((c) => c.user_id === user.id) : null;
  const tokenlessCharacters = characters.filter((c) => !board.tokens.some((t) => t.character_id === c.id));

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

      {!isGm && <CharacterHud character={myCharacter} />}

      {isGm && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
          <label className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white cursor-pointer hover:bg-[var(--accent-hover)]">
            {uploading ? 'Envoi...' : 'Changer le fond'}
            <input type="file" accept="image/*" onChange={handleBackgroundUpload} className="hidden" disabled={uploading} />
          </label>

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

      <div className="flex flex-col lg:flex-row gap-4">
        <BoardCanvas
          board={board}
          isGm={isGm}
          className="flex-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]"
          style={{ aspectRatio: '16 / 9' }}
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

      {isGm && characters.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => <CharacterHud key={c.id} character={c} />)}
        </div>
      )}
    </div>
  );
}
