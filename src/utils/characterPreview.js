// Client-side mirror of two pure formulas from the backend's characterCalculations.js, used only
// to preview "what if I pick this" on the level-up page before anything is actually saved. The
// real commit always goes through the authoritative backend endpoints (LevelUp.jsx's "Valider"),
// so a gap here (a capacité effect not mirrored, say) can only make the PREVIEW slightly off,
// never the saved data.
export function computePvBodyGain(pvBases, pendingHalf) {
  const avg = pvBases.reduce((a, b) => a + b, 0) / pvBases.length;
  if (Number.isInteger(avg)) return { gain: avg, pendingHalf };
  return pendingHalf
    ? { gain: Math.ceil(avg), pendingHalf: false }
    : { gain: Math.floor(avg), pendingHalf: true };
}

export function computePmMax(sortsCount, vol) {
  return sortsCount > 0 ? sortsCount + vol : 0;
}

export function costForRang(rang) {
  return rang >= 3 ? 2 : 1;
}

// Mirrors characterCalculations.js's pvMaxConTerm — a handful of capacités (e.g. the forgesort's
// Grosse tête) swap a better caractéristique in for CON, but only for the level-1 unit of the
// per-level sum. capaciteEffects is a flat array of every effect JSONB the character currently
// owns (already rang-gated by the caller).
export function pvMaxConTerm(caracteristiques, capaciteEffects, level) {
  let level1Stat = caracteristiques.CON;
  for (const effect of capaciteEffects) {
    if (effect?.type === 'stat_substitute_max' && effect.in === 'pv_max' && effect.scope === 'level1') {
      level1Stat = Math.max(level1Stat, caracteristiques[effect.with]);
    }
  }
  return level1Stat + caracteristiques.CON * (level - 1);
}
