import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import BoardCanvas from '../components/BoardCanvas';
import { getBoard, getBoardStreamUrl } from '../utils/api';

// This is opened from the GM's own logged-in browser (a second tab/window cast to a TV), so
// the backend sees a GM-role request and returns the unfiltered board — hidden tokens/zones
// and enemy stats included. The projector is exactly the screen players are meant to watch,
// so it applies the same player-facing filtering itself instead of trusting the fetch's role.
function playerSafeBoard(board) {
  return {
    ...board,
    tokens: board.tokens.filter((t) => t.visible_to_players),
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

  useEffect(() => {
    getBoard(campaignId).then(setBoard).catch(() => {});
  }, [campaignId]);

  useEffect(() => {
    const source = new EventSource(getBoardStreamUrl(campaignId));
    source.addEventListener('board', (event) => setBoard(JSON.parse(event.data)));
    return () => source.close();
  }, [campaignId]);

  if (!board) return <div className="fixed inset-0 bg-black" />;

  const safeBoard = playerSafeBoard(board);
  const hudPlayers = safeBoard.tokens.filter((t) => t.character_id && !t.is_npc);

  return (
    <BoardCanvas
      board={safeBoard}
      isGm={false}
      className="fixed inset-0"
      style={{ backgroundColor: 'black' }}
      hudPlayers={hudPlayers}
      cameraCrop
    />
  );
}
