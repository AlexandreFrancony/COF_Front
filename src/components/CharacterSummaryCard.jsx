import { useState } from 'react';
import toast from 'react-hot-toast';
import { resolveAvatar, StatBar } from './BoardCanvas';
import { updateCharacter } from '../utils/api';

// Same order/emoji as CharacterSheet.jsx's own CARACS/CARAC_EMOJI.
const CARACS = ['AGI', 'CON', 'FOR', 'PER', 'CHA', 'INT', 'VOL'];
const CARAC_EMOJI = { AGI: '🤸', CON: '🫀', FOR: '💪', PER: '👁️', CHA: '✨', INT: '🧠', VOL: '🔥' };

// +/- next to a StatBar, mutating the character directly (not board state) — same
// disable-while-in-flight guard as CharacterSheet.jsx's own StatAdjuster, rather than the
// board's atomic-server-delta pattern (board_tokens/zones), since this writes to a character
// the caller doesn't own state for: the fresh value arrives back via the board's own SSE push
// (broadcastCharacterChange, characters.js) same as every other live stat on this card.
function AdjustableStatBar({ label, current, max, kind, characterId, field }) {
  const [busy, setBusy] = useState(false);

  const adjust = async (delta) => {
    const next = Math.max(0, Math.min(max, current + delta));
    if (next === current || busy) return;
    setBusy(true);
    try {
      await updateCharacter(characterId, { [field]: next });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => adjust(-1)}
        disabled={busy || current <= 0}
        className="w-6 h-6 shrink-0 rounded border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-30 leading-none"
      >
        −
      </button>
      <StatBar label={label} current={current} max={max} kind={kind} barClassName="flex-1 h-6" textClassName="text-xs" />
      <button
        onClick={() => adjust(1)}
        disabled={busy || current >= max}
        className="w-6 h-6 shrink-0 rounded border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-30 leading-none"
      >
        +
      </button>
    </div>
  );
}

// Shown when a character's pawn or HUD card is clicked (on the live board and the read-only
// player view alike). PV/PM/Chance are directly adjustable here — same as a golem/monster
// pawn's own PV — so the GM can run combat from the board without switching to the character
// sheet; Caractéristiques/Déf/Init stay read-only display, same as before.
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
            <AdjustableStatBar
              label="PV" current={entry.pv_current} max={entry.pv_max} kind="pv"
              characterId={entry.character_id} field="pv_current"
            />
            {entry.pm_max > 0 && (
              <AdjustableStatBar
                label="PM" current={entry.pm_current} max={entry.pm_max} kind="pm"
                characterId={entry.character_id} field="pm_current"
              />
            )}
            <AdjustableStatBar
              label="Chance" current={entry.points_chance_current} max={entry.points_chance} kind="chance"
              characterId={entry.character_id} field="points_chance_current"
            />
          </div>

          <div className="flex justify-between text-sm text-[var(--text-secondary)]">
            <span className="whitespace-nowrap">🛡️ Déf {entry.defense}</span>
            <span className="whitespace-nowrap">⚡ Init {entry.initiative}</span>
          </div>

          {entry.caracteristiques && (
            <div className="flex flex-wrap justify-center gap-1.5 text-center">
              {CARACS.map((c) => (
                <div key={c} className="flex flex-col gap-0.5 p-1.5 rounded bg-[var(--bg-input)] basis-[22%] grow-0 shrink-0">
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
