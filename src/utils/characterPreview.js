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
