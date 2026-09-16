// A character-linked token uses its character's initiative; a bestiary monster pawn has no
// character_id but carries its own monstre_initiative — a golem/plain pawn has neither and
// never gets its own turn (it acts on its creator's turn).
function tokenInitiative(t) {
  return t.character_id != null ? t.initiative : t.monstre_initiative;
}

// Turn order is never stored — it's whoever currently has a character-linked or bestiary
// monster token on the board, sorted by their already-computed initiative, highest first
// (mirrors board.js's own initiativeOrder()). Recomputing it here means a token added/removed
// mid-combat just slots into the strip on the next render instead of the client and server list
// drifting apart. A hidden enemy (visible_to_players false) never reaches this component in the
// first place for a player/projector fetch — buildBoardForRole (board.js) already filtered
// board.tokens down to visible ones server-side — so no extra visibility check is needed here;
// the GM's own fetch is the full board, so their tracker always includes hidden enemies too.
function initiativeOrder(tokens) {
  return tokens
    .filter((t) => t.character_id != null || t.monstre_id != null)
    // Ties break on the GM's own session "destin" d6 (higher wins), same rule as board.js's
    // own initiativeOrder() — kept in sync since both compute the same order independently.
    .sort((a, b) => (tokenInitiative(b) ?? 0) - (tokenInitiative(a) ?? 0) || (b.destin ?? 0) - (a.destin ?? 0) || a.id - b.id);
}

import Kbd from './Kbd';

// isGm shows the Suivant/Réinitialiser controls; the read-only board/projector pass isGm=false
// for a plain display strip. Renders nothing if there's no one to track (an empty board, or a
// scene with only free-floating pawns) — a combat tool has nothing useful to say then.
//
// onSelectToken/selectedTokenId (GM only): clicking a name jumps straight to that token's panel
// instead of hunting for its pawn on the board — useful once a fight has several tokens stacked
// or off the visible canvas edge.
export default function InitiativeTracker({ board, isGm = false, onNext, onReset, onSelectToken, selectedTokenId }) {
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
          const Tag = isGm ? 'button' : 'div';
          return (
            <Tag
              key={t.id}
              onClick={isGm ? () => onSelectToken(t) : undefined}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs whitespace-nowrap border-l-4 shrink-0 ${
                active ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-input)]'
              } ${isGm ? 'hover:brightness-110 cursor-pointer' : ''} ${
                t.id === selectedTokenId ? 'ring-2 ring-[var(--accent)]' : ''
              }`}
              style={{ borderLeftColor: active ? '#fff' : t.color || '#c65d3b' }}
            >
              <span className="font-medium">{t.character_name || t.label}</span>
              <span className="opacity-70">{tokenInitiative(t)}</span>
              {t.destin != null && <span className="opacity-60 text-[10px]" title="Destin (départage l'initiative)">🎲{t.destin}</span>}
            </Tag>
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
            Suivant → <Kbd>N</Kbd>
          </button>
        </div>
      )}
    </div>
  );
}
