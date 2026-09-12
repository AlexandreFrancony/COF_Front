import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import BoardCanvas from '../components/BoardCanvas';
import { getBoard, getBoardStreamUrl } from '../utils/api';

// Fullscreen, read-only board — meant to be cast to a TV or vidéoprojecteur during a session.
// No header, no controls: just the background, grid, zones and visible tokens.
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

  return (
    <BoardCanvas
      board={board}
      isGm={false}
      className="fixed inset-0"
      style={{ backgroundColor: 'black' }}
    />
  );
}
