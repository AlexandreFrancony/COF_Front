import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import BoardCanvas, { playerSafeBoard } from '../components/BoardCanvas';
import InitiativeTracker from '../components/InitiativeTracker';
import PlayerCharacterPanel from '../components/PlayerCharacterPanel';
import { useAuth } from '../context/AuthContext';
import { usePings } from '../hooks/usePings';
import { getBoard, getBoardStreamUrl, getCampaign, getCampaignCharacters, updateOwnBoardToken } from '../utils/api';

// Fullscreen, read-only board — meant to be cast to a TV or vidéoprojecteur during a session.
// No header, no controls: just the background, grid, zones, visible tokens, and the party's
// HUD (never the enemies' — see playerSafeBoard in BoardCanvas.jsx). cameraCrop makes it show only the
// GM's chosen window of the scene (board.camera_x/y/width), not the full map — the GM's own
// Board.jsx view is unaffected and always shows everything.
// A player can open it too (with the GM's stream on Discord, or at home): they then get their
// own slide-out character panel (C, or the tab on the right edge) and can drag their own pawn and
// the creatures they own. The GM casting it never gets either — nothing on it is theirs to move.
export default function BoardProjector() {
  const { id: campaignId } = useParams();
  const [board, setBoard] = useState(null);
  const audioRef = useRef(null);
  const [pings, addPing] = usePings();
  const { user } = useAuth();
  const [myCharacters, setMyCharacters] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    getBoard(campaignId).then(setBoard).catch(() => {});
    // A player's GET /characters only returns their own; the GM's returns everyone, so the GM
    // (the one casting the TV) is filtered out here and never gets a panel.
    Promise.all([getCampaign(campaignId), getCampaignCharacters(campaignId)])
      .then(([campaign, characters]) => setMyCharacters(campaign.gm_id === user?.id ? [] : characters.filter((c) => c.user_id === user?.id)))
      .catch(() => {});
  }, [campaignId, user?.id]);

  const myIds = new Set(myCharacters.map((c) => c.id));
  const isMine = (t) => myIds.has(t.character_id) || (t.character_id == null && myIds.has(t.owner_character_id));

  useEffect(() => {
    if (!myCharacters.length) return undefined;
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'c') setPanelOpen((v) => !v);
      if (e.key === 'Escape') setPanelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [myCharacters.length]);

  const sendOwn = async (tokenId, data) => {
    try {
      setBoard(await updateOwnBoardToken(tokenId, data));
    } catch (error) {
      toast.error(error.message);
    }
  };

  useEffect(() => {
    const source = new EventSource(getBoardStreamUrl(campaignId));
    source.addEventListener('board', (event) => setBoard(JSON.parse(event.data)));
    source.addEventListener('ping', (event) => addPing(JSON.parse(event.data)));
    return () => source.close();
  }, [campaignId, addPing]);

  // Only this page ever plays the ambiance track — never the GM's own editing view or an
  // individual player's phone, both of which would double up the sound or play it somewhere
  // nobody's listening. .play() can reject here if the browser's autoplay policy hasn't seen a
  // user gesture on this page yet (opening the projector via a click normally satisfies it, but
  // silently swallow the rejection either way rather than spamming the console every SSE tick).
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = board?.music_volume ?? 0.5;
  }, [board?.music_volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (board?.music_playing) el.play().catch(() => {});
    else el.pause();
  }, [board?.music_playing, board?.music_url]);

  if (!board) return <div className="fixed inset-0 bg-black" />;

  const safeBoard = playerSafeBoard(board);
  const hudPlayers = safeBoard.tokens.filter((t) => t.character_id && !t.is_npc);
  // Big "whose turn" banner, readable from across the room or on a stream; only when the GM
  // shows the initiative and the active pawn is one the players can see.
  const turnToken = safeBoard.initiative_visible
    ? safeBoard.tokens.find((t) => t.id === safeBoard.initiative_current_token_id)
    : null;

  return (
    <div className="fixed inset-0">
      {board.music_url && <audio key={board.music_url} ref={audioRef} src={board.music_url} loop />}
      <BoardCanvas
        board={safeBoard}
        isGm={false}
        className="absolute inset-0"
        style={{ backgroundColor: 'black' }}
        hudPlayers={hudPlayers}
        cameraCrop
        pings={pings}
        canDragToken={myCharacters.length ? isMine : null}
        onTokenDragEnd={(tokenId, x, y) => sendOwn(tokenId, { x, y })}
      />
      {turnToken && (
        <div key={turnToken.id} className="turn-banner absolute top-3 left-1/2 -translate-x-1/2 z-50 px-6 py-2 rounded-full bg-black/75 border-2 border-[var(--accent)] text-white text-2xl font-bold shadow-2xl whitespace-nowrap pointer-events-none">
          ⚔️ Au tour de {turnToken.character_name || turnToken.label}
        </div>
      )}
      {myCharacters.length > 0 && (
        <>
          <button
            onClick={() => setPanelOpen((v) => !v)}
            title="Ma fiche (C)"
            className={`absolute top-1/2 -translate-y-1/2 z-[70] px-1.5 py-3 rounded-l-lg bg-[var(--bg-card)] border border-r-0 border-[var(--accent)] text-sm [writing-mode:vertical-rl] transition-[right] ${panelOpen ? 'right-80' : 'right-0'}`}
          >
            🧙 Ma fiche (C)
          </button>
          <div className={`absolute top-0 bottom-0 right-0 z-[70] w-80 p-3 overflow-y-auto bg-[var(--bg-card)] border-l border-[var(--accent)] shadow-2xl transition-transform ${panelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <PlayerCharacterPanel
              board={board}
              characters={myCharacters}
              myCharacterIds={myIds}
              onCreatureHp={(token, delta) => sendOwn(token.id, { hp_delta: delta })}
            />
          </div>
        </>
      )}
      {/* Outside BoardCanvas (not affected by its cameraCrop transform), same reasoning as the
          HUD staying fixed regardless of framing — the turn order isn't part of the scene. */}
      {safeBoard.initiative_visible && (
        <div className="absolute bottom-0 inset-x-0 z-50 p-3">
          <InitiativeTracker board={safeBoard} />
        </div>
      )}
    </div>
  );
}
