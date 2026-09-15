// Same order/emoji as CharacterSheet.jsx's/CharacterSummaryCard's own CARACS/CARAC_EMOJI.
const CARACS = ['AGI', 'CON', 'FOR', 'PER', 'CHA', 'INT', 'VOL'];
const CARAC_EMOJI = { AGI: '🤸', CON: '🫀', FOR: '💪', PER: '👁️', CHA: '✨', INT: '🧠', VOL: '🔥' };

// Fixed per the "Golem" capacité itself (rules_capacites, voie 79 "Voie du golem", rang 2) —
// "GOLEM (créature non vivante) : AGI -1 | CON +10 | FOR +1 | PER -3 | CHA -4 | INT -3 | VOL
// +4." Same for every golem regardless of who built it (unlike DEF/attack, which scale with
// the forgesort's own rang/level) — not read from the owner, just documented as belonging to
// this construct type.
const GOLEM_CARACS = { AGI: -1, CON: 10, FOR: 1, PER: -3, CHA: -4, INT: -3, VOL: 4 };

// Shown when a creature pawn (hp_max set, no character_id) is selected — a golem (owner-derived
// stats), a bestiary monster (monstre_id, stats joined live from rules_monstres so a later data
// fix reaches every pawn already on a board), or a plain creature pawn with just a name/PV. No
// PV bar here in any case: the pawn's PV is already shown live via the board's own +/- adjuster
// right below this card (BoardEditor.jsx) — repeating it as a read-only bar would just be the
// same number twice. This card is for what the adjuster doesn't cover.
export default function CreatureSummaryCard({ entry }) {
  const isGolem = entry.owner_golem_rang != null;
  const isMonstre = entry.monstre_name != null;

  const defense = isGolem ? 10 + entry.owner_golem_rang : isMonstre ? entry.monstre_defense : null;
  const caracs = isGolem ? GOLEM_CARACS : isMonstre ? entry.monstre_caracteristiques : null;
  // A monster's caracteristiques keep the book's raw notation as strings (e.g. "+3*") since
  // they're display-only, never fed into a formula — printed as-is instead of the +/- math
  // CharacterSummaryCard does for a character's own numeric caracteristiques.
  const caracsAreRaw = isMonstre;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
      <div className="flex items-center gap-3">
        <div
          className="w-14 h-14 shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-input)] flex items-center justify-center"
          style={{ backgroundColor: entry.color || '#8a8a8a' }}
        >
          <span style={{ fontSize: 28, lineHeight: 1 }}>{isMonstre ? '🗡️' : '🗿'}</span>
        </div>
        <div>
          <h3 className="font-semibold text-lg leading-tight">{entry.label}</h3>
          {isGolem && entry.owner_character_name && (
            <p className="text-xs text-[var(--text-secondary)]">Golem de {entry.owner_character_name}</p>
          )}
          {isMonstre && (
            <p className="text-xs text-[var(--text-secondary)]">{entry.monstre_name} · NC {entry.monstre_nc}</p>
          )}
        </div>
      </div>

      {defense != null && (
        <div className="flex justify-between text-sm text-[var(--text-secondary)]">
          <span>🛡️ Déf {defense}</span>
          {isGolem && entry.owner_attaque_magique != null && (
            <span>⚔️ Attaque {entry.owner_attaque_magique} · DM 1d4°+1</span>
          )}
          {isMonstre && <span>⚡ Init {entry.monstre_initiative}</span>}
        </div>
      )}

      {isMonstre && entry.monstre_attaques && (
        <p className="text-sm whitespace-pre-line">{entry.monstre_attaques}</p>
      )}

      {caracs && (
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {CARACS.map((c) => (
            <div key={c} className="flex flex-col gap-0.5 p-1.5 rounded bg-[var(--bg-input)]">
              <span className="text-[10px] text-[var(--text-secondary)]">{CARAC_EMOJI[c]} {c}</span>
              <span className="font-semibold">
                {caracsAreRaw ? caracs[c] : `${caracs[c] >= 0 ? '+' : ''}${caracs[c]}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {isMonstre && entry.monstre_capacites?.length > 0 && (
        <div className="flex flex-col gap-1.5 text-sm">
          {entry.monstre_capacites.map((cap) => (
            <div key={cap.name}>
              <span className="font-medium">{cap.name}</span>
              {cap.resume && <span className="text-[var(--text-secondary)]"> — {cap.resume}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
