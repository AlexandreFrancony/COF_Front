import { useState, useCallback } from 'react';

// Shared by Board.jsx and BoardProjector.jsx: turns a stream of 'ping' SSE events (see
// BoardCanvas.jsx's Ping/pointer tool) into a short-lived list of markers to render. Each entry
// removes itself a moment after the CSS fade/expand animation (index.css's ping-marker, ~1.6s)
// would have finished, so the list never accumulates stale entries.
export function usePings() {
  const [pings, setPings] = useState([]);

  const addPing = useCallback(({ x, y }) => {
    const id = `${Date.now()}-${Math.random()}`;
    setPings((prev) => [...prev, { id, x, y }]);
    setTimeout(() => setPings((prev) => prev.filter((p) => p.id !== id)), 1800);
  }, []);

  return [pings, addPing];
}
