import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import BoardCanvas from '../components/BoardCanvas';
import InitiativeTracker from '../components/InitiativeTracker';
import { getBoard, getBoardStreamUrl } from '../utils/api';

// Same fields board.js's own stripEnemyStats nulls out for a player-role fetch — kept in sync
// by hand since this path never actually calls the backend as a player (see below).
const HIDDEN_CREATURE_FIELDS = [
  'hp_current', 'hp_max',
  'monstre_name', 'monstre_category', 'monstre_nc', 'monstre_defense',
  'monstre_initiative', 'monstre_attaques', 'monstre_caracteristiques', 'monstre_capacites',
];

// This is opened from the GM's own logged-in browser (a second tab/window cast to a TV), so
// the backend sees a GM-role request and returns the unfiltered board — hidden tokens/zones
// and enemy stats included. The projector is exactly the screen players are meant to watch,
// so it applies the same player-facing filtering itself instead of trusting the fetch's role.
function playerSafeBoard(board) {
  return {
    ...board,
    tokens: board.tokens
      .filter((t) => t.visible_to_players)
      .map((t) => {
        if (!t.hide_hp_from_players) return t;
        const stripped = { ...t };
        for (const field of HIDDEN_CREATURE_FIELDS) stripped[field] = null;
        return stripped;
      }),
    zones: board.zones.filter((z) => z.visible_to_players),
  };
}

// Fullscreen, read-only board — meant to be cast to a TV or vidéoprojecteur during a session.
// No header, no controls: just the background, grid, zones, visible tokens, and the party's
// HUD (never the enemies' — see playerSafeBoard above). cameraCrop makes it show only the
// GM's chosen window of the scene (board.camera_x/y/width), not the full map — the GM's own
// Board.jsx view is unaffected and always shows everything.
export default function BoardProjector() {
  const { id: campaignId } = useParams();
  const [board, setBoard] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    getBoard(campaignId).then(setBoard).catch(() => {});
  }, [campaignId]);

  useEffect(() => {
    const source = new EventSource(getBoardStreamUrl(campaignId));
    source.addEventListener('board', (event) => setBoard(JSON.parse(event.data)));
    return () => source.close();
  }, [campaignId]);

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
      />
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
