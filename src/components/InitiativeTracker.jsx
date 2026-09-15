// Turn order is never stored — it's whoever currently has a character-linked token on the
// board, sorted by their already-computed Initiative, highest first (mirrors board.js's own
// initiativeOrder()). Recomputing it here means a token added/removed mid-combat just slots
// into the strip on the next render instead of the client and server list drifting apart.
function initiativeOrder(tokens) {
  return tokens
    .filter((t) => t.character_id != null)
    .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0) || a.id - b.id);
}

// isGm shows the Suivant/Réinitialiser controls; the read-only board/projector pass isGm=false
// for a plain display strip. Renders nothing if there's no one to track (an empty board, or a
// scene with only free-floating pawns) — a combat tool has nothing useful to say then.
export default function InitiativeTracker({ board, isGm = false, onNext, onReset }) {
  const order = initiativeOrder(board.tokens);
  if (order.length === 0) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] overflow-x-auto">
      <span className="text-xs font-semibold text-[var(--text-secondary)] shrink-0">
        Round {board.initiative_round}
      </span>
      <div className="flex gap-1.5 min-w-0">
        {order.map((t) => {
          const active = t.id === board.initiative_current_token_id;
          return (
            <div
              key={t.id}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs whitespace-nowrap border-l-4 shrink-0 ${
                active ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-input)]'
              }`}
              style={{ borderLeftColor: active ? '#fff' : t.color || '#c65d3b' }}
            >
              <span className="font-medium">{t.character_name || t.label}</span>
              <span className="opacity-70">{t.initiative}</span>
            </div>
          );
        })}
      </div>
      {isGm && (
        <div className="flex gap-1.5 ml-auto shrink-0">
          <button
            onClick={onReset}
            title="Revenir au début du round 1"
            className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]"
          >
            ↺ Réinitialiser
          </button>
          <button
            onClick={onNext}
            className="px-2 py-1 text-xs rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  );
}
