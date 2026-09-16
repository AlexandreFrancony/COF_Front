import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import BoardCanvas from '../components/BoardCanvas';
import BoardEditor from '../components/BoardEditor';
import NotesPanel from '../components/NotesPanel';
import CharacterSummaryCard from '../components/CharacterSummaryCard';
import CreatureSummaryCard from '../components/CreatureSummaryCard';
import InitiativeTracker from '../components/InitiativeTracker';
import { usePings } from '../hooks/usePings';
import {
  getBoard, updateBoardBackground, updateBoardGrid, updateBoardTokenSize, uploadBoardImage, createBoardToken,
  updateBoardToken, deleteBoardToken, createBoardZone, updateBoardZone, deleteBoardZone,
  getBoardStreamUrl, getCampaign, getCampaignCharacters,
  getBoardMedia, uploadBoardMedia, deleteBoardMedia, updateBoardCamera, updateBoardMusic, pingBoard,
  setBoardInitiativeVisible, nextInitiativeTurn, resetInitiative,
  updateBoardFog, updateBoardHandout, addBoardDrawing, undoLastBoardDrawing, clearBoardDrawings,
} from '../utils/api';

export default function Board() {
  const { id: campaignId } = useParams();
  const { isGm } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [board, setBoard] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [mediaLibrary, setMediaLibrary] = useState([]);
  // id only (not the token object) — re-derived from the live `board` below so the card keeps
  // reflecting PV/PM as they change via SSE instead of freezing at the moment it was clicked.
  const [selectedTokenId, setSelectedTokenId] = useState(null);
  const [pings, addPing] = usePings();
  // Player-side drawing (GM has its own armed/color state inside BoardEditor.jsx — this page's
  // read-only branch has no such wrapper, so it owns the same two bits directly).
  const [playerDrawArmed, setPlayerDrawArmed] = useState(false);
  const [playerDrawColor, setPlayerDrawColor] = useState('#2563eb');

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
    source.addEventListener('ping', (event) => addPing(JSON.parse(event.data)));
    return () => source.close();
  }, [campaignId, addPing]);

  // Every upload lands in the shared library first (so it's reusable next time / in another
  // campaign), then is immediately applied as this board's background.
  const handleUploadBackground = async (file) => {
    try {
      const media = await uploadBoardMedia(file);
      setMediaLibrary((prev) => [media, ...prev]);
      setBoard(await updateBoardBackground(campaignId, { url: media.url, type: media.type }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handlePickBackground = async (media) => {
    try {
      setBoard(await updateBoardBackground(campaignId, { url: media.url, type: media.type }));
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

  // Same two-step pattern as background: upload lands in the shared library first, then is
  // immediately applied (music_playing: true, no reason to upload a track and not hear it).
  const handleUploadMusic = async (file) => {
    try {
      const media = await uploadBoardMedia(file);
      setMediaLibrary((prev) => [media, ...prev]);
      setBoard(await updateBoardMusic(campaignId, { music_url: media.url, music_playing: true }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handlePickMusic = async (media) => {
    try {
      setBoard(await updateBoardMusic(campaignId, { music_url: media.url, music_playing: true }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleUpdateMusic = async (data) => {
    try {
      setBoard(await updateBoardMusic(campaignId, data));
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Fire-and-forget — a ping is never part of board state, nothing here to apply to `board`.
  const handlePing = (x, y) => {
    pingBoard(campaignId, x, y).catch((error) => toast.error(error.message));
  };

  const handleTokenStatusIconsChange = async (token, icons) => {
    try {
      setBoard(await updateBoardToken(token.id, { status_icons: icons }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleUpdateFog = async (data) => {
    try {
      setBoard(await updateBoardFog(campaignId, data));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleShowHandout = async (url) => {
    try {
      setBoard(await updateBoardHandout(campaignId, url));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleHideHandout = () => handleShowHandout('');

  // Unlike background/music uploads, this only adds to the library — showing a document to
  // players is a deliberate, disruptive action that shouldn't happen automatically just because
  // the GM finished uploading it.
  const handleUploadHandoutMedia = async (file) => {
    try {
      const media = await uploadBoardMedia(file, 'handout');
      setMediaLibrary((prev) => [media, ...prev]);
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Any campaign member can draw (see board.js's POST /board/drawings) — this same handler is
  // wired to both the GM's BoardEditor and the player's own draw toggle below.
  const handleDraw = async (points, color) => {
    try {
      setBoard(await addBoardDrawing(campaignId, points, color));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleUndoDrawing = async () => {
    try {
      setBoard(await undoLastBoardDrawing(campaignId));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleClearDrawings = async () => {
    try {
      setBoard(await clearBoardDrawings(campaignId));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleToggleGrid = async () => {
    try {
      setBoard(await updateBoardGrid(campaignId, { grid_visible: !board.grid_visible }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleTokenSize = async (delta) => {
    try {
      setBoard(await updateBoardTokenSize(campaignId, delta));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleAddToken = async (label, hpMax, ownerCharacterId, monstreId) => {
    try {
      setBoard(await createBoardToken(campaignId, {
        label, hp_max: hpMax, owner_character_id: ownerCharacterId, monstre_id: monstreId,
      }));
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
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleDeleteToken = async (token) => {
    try {
      setBoard(await deleteBoardToken(token.id));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleTokenHpChange = async (tokenId, delta) => {
    try {
      const updated = await updateBoardToken(tokenId, { hp_delta: delta });
      setBoard(updated);
      return updated;
    } catch (error) {
      toast.error(error.message);
      return board;
    }
  };

  const handleToggleTokenHideHp = async (token) => {
    try {
      setBoard(await updateBoardToken(token.id, { hide_hp_from_players: !token.hide_hp_from_players }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleTokenPlayerLabelChange = async (token, label) => {
    try {
      setBoard(await updateBoardToken(token.id, { player_hp_label: label }));
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
      return created;
    } catch (error) {
      toast.error(error.message);
      return board;
    }
  };

  const handleZoneDragEnd = async (zoneId, x, y) => {
    try {
      setBoard(await updateBoardZone(zoneId, { x, y }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handlePatchZone = async (zoneId, data) => {
    try {
      const updated = await updateBoardZone(zoneId, data);
      setBoard(updated);
      return updated;
    } catch (error) {
      toast.error(error.message);
      return board;
    }
  };

  const handleDeleteZone = async (zone) => {
    try {
      setBoard(await deleteBoardZone(zone.id));
    } catch (error) {
      toast.error(error.message);
    }
  };

  // The camera is what the projector actually shows — the GM's own view always renders the
  // full scene, this frame is just an overlay preview of that window. Dragging sends the
  // final center directly (like tokens/zones); zoom is a server-side atomic delta (same
  // reasoning as board_zones' size_delta — see the PATCH /board docstring in board.js).
  const handleCameraDragEnd = async (x, y) => {
    try {
      setBoard(await updateBoardCamera(campaignId, { camera_x: x, camera_y: y }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleCameraResizeEnd = async (width) => {
    try {
      setBoard(await updateBoardCamera(campaignId, { camera_width: width }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleCameraZoom = async (delta) => {
    try {
      setBoard(await updateBoardCamera(campaignId, { camera_width_delta: delta }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleCameraReset = async () => {
    try {
      setBoard(await updateBoardCamera(campaignId, { camera_x: 50, camera_y: 50, camera_width: 100 }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleInitiativeVisibleChange = async (visible) => {
    try {
      setBoard(await setBoardInitiativeVisible(campaignId, visible));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleInitiativeNext = async () => {
    try {
      setBoard(await nextInitiativeTurn(campaignId));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleInitiativeReset = async () => {
    try {
      setBoard(await resetInitiative(campaignId));
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

  // The HUD shows one card per token linked to a character — never for a free-floating pawn.
  // Enemy stats are only ever assembled for the GM: the backend already strips a PNJ token's
  // stats for a player-role fetch, this is the second layer that keeps them off-screen.
  const hudPlayers = board.tokens.filter((t) => t.character_id && !t.is_npc);
  const hudEnemies = isGm ? board.tokens.filter((t) => t.character_id && t.is_npc) : null;
  // Re-derived from the live board (not stored as the clicked object) so the player-side
  // summary card keeps tracking PV/PM as they change via SSE instead of freezing on selection.
  const selectedToken = board.tokens.find((t) => t.id === selectedTokenId) || null;

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

      {isGm ? (
        <BoardEditor
          board={board}
          characters={characters}
          mediaLibrary={mediaLibrary}
          onUploadBackground={handleUploadBackground}
          onPickBackground={handlePickBackground}
          onDeleteMedia={handleDeleteMedia}
          onUploadMusic={handleUploadMusic}
          onPickMusic={handlePickMusic}
          onUpdateMusic={handleUpdateMusic}
          onToggleGrid={handleToggleGrid}
          onTokenSize={handleTokenSize}
          onAddToken={handleAddToken}
          onAddCharacterToken={handleAddCharacterToken}
          onMoveToken={handleTokenDragEnd}
          onToggleTokenVisible={handleToggleTokenVisible}
          onDeleteToken={handleDeleteToken}
          onUploadTokenImage={handleTokenImageUpload}
          onTokenHpChange={handleTokenHpChange}
          onToggleTokenHideHp={handleToggleTokenHideHp}
          onTokenPlayerLabelChange={handleTokenPlayerLabelChange}
          onTokenStatusIconsChange={handleTokenStatusIconsChange}
          onPing={handlePing}
          pings={pings}
          onUpdateFog={handleUpdateFog}
          onShowHandout={handleShowHandout}
          onHideHandout={handleHideHandout}
          onUploadHandoutMedia={handleUploadHandoutMedia}
          onDraw={handleDraw}
          onUndoDrawing={handleUndoDrawing}
          onClearDrawings={handleClearDrawings}
          onAddZone={handleAddZone}
          onMoveZone={handleZoneDragEnd}
          onPatchZone={handlePatchZone}
          onDeleteZone={handleDeleteZone}
          withCamera
          onCameraDragEnd={handleCameraDragEnd}
          onCameraResizeEnd={handleCameraResizeEnd}
          onCameraZoom={handleCameraZoom}
          onCameraReset={handleCameraReset}
          onInitiativeVisibleChange={handleInitiativeVisibleChange}
          onInitiativeNext={handleInitiativeNext}
          onInitiativeReset={handleInitiativeReset}
          hudPlayers={hudPlayers}
          hudEnemies={hudEnemies}
        />
      ) : (
        // Read-only board for players: no toolbar, no camera frame overlay — the full scene
        // as-is (unlike the projector, which crops to the GM's chosen window). The sidebar
        // mirrors where the GM has the camera/token/zone panel, but with the campaign's
        // shared notes instead — handy to jot down or check during a live session without
        // leaving the board. The initiative tracker only shows up here once the GM has
        // toggled it on (BoardEditor's checkbox) — most sessions have no active combat.
        <div className="flex flex-col gap-3">
          {board.initiative_visible && <InitiativeTracker board={board} />}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPlayerDrawArmed((v) => !v)}
              className={`px-3 py-1.5 text-sm rounded-lg border hover:border-[var(--accent)] ${
                playerDrawArmed ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'border-[var(--border)]'
              }`}
            >
              ✏️ Dessiner
            </button>
            {playerDrawArmed && (
              <input
                type="color"
                value={playerDrawColor}
                onChange={(e) => setPlayerDrawColor(e.target.value)}
                className="w-8 h-8 rounded border border-[var(--border)]"
              />
            )}
          </div>
          <div className="flex flex-col lg:flex-row gap-4">
            <BoardCanvas
              board={board}
              isGm={false}
              className="relative flex-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]"
              style={{ aspectRatio: '16 / 9' }}
              hudPlayers={hudPlayers}
              selectedToken={selectedToken}
              onSelectToken={(token) => setSelectedTokenId(token.id)}
              onBackgroundClick={() => setSelectedTokenId(null)}
              pings={pings}
              drawMode={playerDrawArmed}
              drawColor={playerDrawColor}
              onDraw={handleDraw}
            />
            <div className="w-full lg:w-64 shrink-0 flex flex-col gap-3">
              {selectedToken?.character_id ? (
                <CharacterSummaryCard entry={selectedToken} />
              ) : selectedToken?.hp_max != null ? (
                <CreatureSummaryCard entry={selectedToken} />
              ) : null}
              <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] h-fit">
                <NotesPanel campaignId={campaignId} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
