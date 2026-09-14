import { resolveAvatar, StatBar } from './BoardCanvas';

// Same order/emoji as CharacterSheet.jsx's own CARACS/CARAC_EMOJI — kept as a separate literal
// here rather than a shared import since CharacterSheet.jsx isn't otherwise a dependency of the
// board (avoids pulling its whole module graph in for 7 emoji).
const CARACS = ['AGI', 'CON', 'FOR', 'PER', 'CHA', 'INT', 'VOL'];
const CARAC_EMOJI = { AGI: '🤸', CON: '🫀', FOR: '💪', PER: '👁️', CHA: '✨', INT: '🧠', VOL: '🔥' };

// Shown when a character's pawn or HUD card is clicked (on the live board and the read-only
// player view alike) — the exact same stats already broadcast in the HUD, just bigger and
// spelled out, since it's the summary of what's already visible rather than a deeper look
// (that would mean fetching the full character, which a player can't do for a teammate's).
export default function CharacterSummaryCard({ entry }) {
  const { imageUrl, emoji } = resolveAvatar(entry);

  return (
    <div className="flex flex-col gap-3 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
      <div className="flex items-center gap-3">
        <div
          className="w-14 h-14 shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-input)] bg-cover bg-center flex items-center justify-center"
          style={{
            backgroundColor: entry.color || '#c65d3b',
            backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
          }}
        >
          {emoji && <span style={{ fontSize: 28, lineHeight: 1 }}>{emoji}</span>}
        </div>
        <h3 className="font-semibold text-lg leading-tight">{entry.character_name || entry.label}</h3>
      </div>

      {/* pv_max is null for an enemy pawn a player can see but whose stats the GM hasn't
          exposed (the backend strips them for a player-role fetch) — nothing to summarize
          beyond the avatar/name in that case. */}
      {entry.pv_max != null && (
        <>
          <div className="flex flex-col gap-1.5">
            <StatBar label="PV" current={entry.pv_current} max={entry.pv_max} kind="pv" barClassName="w-full h-6" textClassName="text-xs" />
            {entry.pm_max > 0 && (
              <StatBar label="PM" current={entry.pm_current} max={entry.pm_max} kind="pm" barClassName="w-full h-6" textClassName="text-xs" />
            )}
          </div>

          <div className="flex justify-between text-sm text-[var(--text-secondary)]">
            <span>🍀 Chance {entry.points_chance}</span>
            <span>🛡️ Déf {entry.defense}</span>
            <span>⚡ Init {entry.initiative}</span>
          </div>

          {entry.caracteristiques && (
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {CARACS.map((c) => (
                <div key={c} className="flex flex-col gap-0.5 p-1.5 rounded bg-[var(--bg-input)]">
                  <span className="text-[10px] text-[var(--text-secondary)]">{CARAC_EMOJI[c]} {c}</span>
                  <span className="font-semibold">
                    {entry.caracteristiques[c] >= 0 ? '+' : ''}{entry.caracteristiques[c]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
