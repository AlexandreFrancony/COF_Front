import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import BoardCanvas from '../components/BoardCanvas';
import BoardEditor from '../components/BoardEditor';
import {
  getBoard, updateBoardBackground, updateBoardGrid, updateBoardTokenSize, uploadBoardImage, createBoardToken,
  updateBoardToken, deleteBoardToken, createBoardZone, updateBoardZone, deleteBoardZone,
  getBoardStreamUrl, getCampaign, getCampaignCharacters,
  getBoardMedia, uploadBoardMedia, deleteBoardMedia, updateBoardCamera,
} from '../utils/api';

export default function Board() {
  const { id: campaignId } = useParams();
  const { isGm } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [board, setBoard] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [mediaLibrary, setMediaLibrary] = useState([]);

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

  const handleAddToken = async (label) => {
    try {
      setBoard(await createBoardToken(campaignId, { label }));
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
          onToggleGrid={handleToggleGrid}
          onTokenSize={handleTokenSize}
          onAddToken={handleAddToken}
          onAddCharacterToken={handleAddCharacterToken}
          onMoveToken={handleTokenDragEnd}
          onToggleTokenVisible={handleToggleTokenVisible}
          onDeleteToken={handleDeleteToken}
          onUploadTokenImage={handleTokenImageUpload}
          onAddZone={handleAddZone}
          onMoveZone={handleZoneDragEnd}
          onPatchZone={handlePatchZone}
          onDeleteZone={handleDeleteZone}
          withCamera
          onCameraDragEnd={handleCameraDragEnd}
          onCameraResizeEnd={handleCameraResizeEnd}
          onCameraZoom={handleCameraZoom}
          onCameraReset={handleCameraReset}
          hudPlayers={hudPlayers}
          hudEnemies={hudEnemies}
        />
      ) : (
        // Read-only for players: no toolbar, no side panel, no camera frame overlay — the
        // full scene as-is (unlike the projector, which crops to the GM's chosen window).
        <BoardCanvas
          board={board}
          isGm={false}
          className="relative rounded-lg bg-[var(--bg-card)] border border-[var(--border)]"
          style={{ aspectRatio: '16 / 9' }}
          hudPlayers={hudPlayers}
        />
      )}
    </div>
  );
}
