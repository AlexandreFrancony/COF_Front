// Rang → niveau requis (table p.39, commune aux voies normales et de prestige) — mirrors the
// backend's own copy in characterCalculations.js, which is the real enforcement; this one is
// display-only (deciding whether a card should render locked).
export const NIVEAU_REQUIS_PAR_RANG = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 7, 6: 9, 7: 11, 8: 13 };

// A prestige voie's capacités are numbered from its opening rang: 4..8, or 3..7 for the familier fantastique
export function prestigeStartRang(voie) {
  const rangs = (voie?.capacites || []).map((c) => c.rang);
  return rangs.length > 0 ? Math.min(...rangs) : 4;
}

// Mirrors the backend's rang-up gate: a prestige voie opening later than usual shifts its next
// rangs by +2 levels each (p.39); every other voie follows the plain table.
export function niveauRequisFor(voie, rang) {
  const base = NIVEAU_REQUIS_PAR_RANG[rang];
  if (voie?.type !== 'prestige') return base;
  return Math.max(base ?? 0, voie.niveau_prestige_requis + 2 * (rang - prestigeStartRang(voie)));
}
