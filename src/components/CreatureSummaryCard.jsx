// Same order/emoji as CharacterSheet.jsx's/CharacterSummaryCard's own CARACS/CARAC_EMOJI.
const CARACS = ['AGI', 'CON', 'FOR', 'PER', 'CHA', 'INT', 'VOL'];
const CARAC_EMOJI = { AGI: '🤸', CON: '🫀', FOR: '💪', PER: '👁️', CHA: '✨', INT: '🧠', VOL: '🔥' };

// Fixed per the "Golem" capacité itself (rules_capacites, voie 79 "Voie du golem", rang 2) —
// "GOLEM (créature non vivante) : AGI -1 | CON +10 | FOR +1 | PER -3 | CHA -4 | INT -3 | VOL
// +4." Same for every golem regardless of who built it (unlike DEF/attack, which scale with
// the forgesort's own rang/level) — not read from the owner, just documented as belonging to
// this construct type.
const GOLEM_CARACS = { AGI: -1, CON: 10, FOR: 1, PER: -3, CHA: -4, INT: -3, VOL: 4 };

// Shown when a creature pawn (hp_max set, no character_id — e.g. a golem) is selected. Unlike
// CharacterSummaryCard, there's no PV bar here: the pawn's PV is already shown live via the
// board's own +/- adjuster right below this card (BoardEditor.jsx), so repeating it as a
// read-only bar here would just be the same number twice. This card is for what the adjuster
// doesn't cover — identity and the owner-derived stats (a golem's DEF/attack come from its
// forgesort, not from the pawn itself, per the "Golem" capacité, rules_capacites voie 79).
export default function CreatureSummaryCard({ entry }) {
  const defense = entry.owner_golem_rang != null ? 10 + entry.owner_golem_rang : null;
  // Only ever shown once we know this pawn actually is a golem (owner_golem_rang resolved) —
  // a generic creature pawn with no owner link has no fixed caracteristiques to show.
  const isGolem = entry.owner_golem_rang != null;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
      <div className="flex items-center gap-3">
        <div
          className="w-14 h-14 shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-input)] flex items-center justify-center"
          style={{ backgroundColor: entry.color || '#8a8a8a' }}
        >
          <span style={{ fontSize: 28, lineHeight: 1 }}>🗿</span>
        </div>
        <div>
          <h3 className="font-semibold text-lg leading-tight">{entry.label}</h3>
          {entry.owner_character_name && (
            <p className="text-xs text-[var(--text-secondary)]">Golem de {entry.owner_character_name}</p>
          )}
        </div>
      </div>

      {defense != null && (
        <div className="flex justify-between text-sm text-[var(--text-secondary)]">
          <span>🛡️ Déf {defense}</span>
          {entry.owner_attaque_magique != null && (
            <span>⚔️ Attaque {entry.owner_attaque_magique} · DM 1d4°+1</span>
          )}
        </div>
      )}

      {isGolem && (
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {CARACS.map((c) => (
            <div key={c} className="flex flex-col gap-0.5 p-1.5 rounded bg-[var(--bg-input)]">
              <span className="text-[10px] text-[var(--text-secondary)]">{CARAC_EMOJI[c]} {c}</span>
              <span className="font-semibold">
                {GOLEM_CARACS[c] >= 0 ? '+' : ''}{GOLEM_CARACS[c]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
