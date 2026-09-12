import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
  getBoard, updateBoardBackground, updateBoardGrid, uploadBoardImage, createBoardToken,
  updateBoardToken, deleteBoardToken, getBoardStreamUrl,
  getCampaign, getCampaignCharacters,
} from '../utils/api';

// The board area is a fixed 16:9 rectangle; background-size percentages are relative to
// width and height separately, so a horizontal cell needs a taller vertical percentage
// (by the aspect ratio) to render as a visual square.
const BOARD_ASPECT_RATIO = 16 / 9;
function gridBackgroundStyle(gridSize) {
  const cell = 100 / gridSize;
  const cellV = cell * BOARD_ASPECT_RATIO;
  return {
    backgroundImage:
      'linear-gradient(to right, rgba(0,0,0,.35) 1px, transparent 1px), ' +
      'linear-gradient(to bottom, rgba(0,0,0,.35) 1px, transparent 1px)',
    backgroundSize: `${cell}% ${cellV}%`,
  };
}

function Token({ token, isGm, selected, onSelect, onDragEnd }) {
  const ref = useRef(null);

  const handlePointerDown = (e) => {
    if (!isGm) return;
    e.preventDefault();
    e.stopPropagation();
    const container = ref.current.parentElement;
    const rect = container.getBoundingClientRect();

    const move = (ev) => {
      const x = Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(100, Math.max(0, ((ev.clientY - rect.top) / rect.height) * 100));
      ref.current.style.left = `${x}%`;
      ref.current.style.top = `${y}%`;
      ref.current.dataset.x = x;
      ref.current.dataset.y = y;
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const x = parseFloat(ref.current.dataset.x ?? token.x);
      const y = parseFloat(ref.current.dataset.y ?? token.y);
      onDragEnd(token.id, x, y);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={ref}
      onPointerDown={handlePointerDown}
      onClick={(e) => {
        e.stopPropagation();
        isGm && onSelect(token);
      }}
      className={`absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 ${isGm ? 'cursor-move' : ''}`}
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

  const handleDragEnd = async (tokenId, x, y) => {
    try {
      setBoard(await updateBoardToken(tokenId, { x, y }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleToggleVisible = async (token) => {
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
      <div>
        <Link to={`/campaigns/${campaignId}`} className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)]">
          ← {campaign.name}
        </Link>
        <h1 className="text-xl font-bold text-[var(--accent)]">Plateau</h1>
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
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        <div
          onClick={() => setSelectedToken(null)}
          className="relative flex-1 rounded-lg overflow-hidden bg-[var(--bg-card)] border border-[var(--border)] bg-cover bg-center"
          style={{
            aspectRatio: '16 / 9',
            backgroundImage: board.background_url ? `url(${board.background_url})` : undefined,
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
          {board.tokens.map((token) => (
            <Token
              key={token.id}
              token={token}
              isGm={isGm}
              selected={selectedToken?.id === token.id}
              onSelect={setSelectedToken}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>

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
              onClick={() => handleToggleVisible(selectedToken)}
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
      </div>

      {isGm && characters.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => <CharacterHud key={c.id} character={c} />)}
        </div>
      )}
    </div>
  );
}
