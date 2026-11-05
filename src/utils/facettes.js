// Augustin Moëdec's homebrew schizophrenia — hardcoded to these exact voie_ids, not a general
// multi-personality system. Voie des artefacts (76) and Voie de transition (139) are common to
// both facettes (never inactive, absent from both lists below on purpose); Voie du métal (78)
// and Voie des runes (80) only under the threshold ("calme"); Voie de la magie destructrice (82)
// and Voie de la magie élémentaire (83) only above it ("mage fou"). Gated on
// character.custom_data.threshold_percent being set (only true for him), so this is a no-op for
// every other character. Mirrors the backend's FACETTE_*_VOIE_IDS in routes/characters.js.
export const FACETTE_VOIE_GROUPS = { calme: [78, 80], mage: [82, 83] };

export const FACETTE_META = {
  calme: { icon: '😌', label: 'Calme' },
  mage: { icon: '🌀', label: 'Mage fou' },
};

export function facetteOfVoie(voieId) {
  if (FACETTE_VOIE_GROUPS.calme.includes(voieId)) return 'calme';
  if (FACETTE_VOIE_GROUPS.mage.includes(voieId)) return 'mage';
  return 'commun';
}

// PM current at or above which he tips into the mage fou facette.
export function mageThresholdPm(thresholdPercent, pmMax) {
  return Math.ceil((thresholdPercent * pmMax) / 100);
}

// Facette is driven by the character's OWN current/max PM ratio (not the artefact's stored
// reserve) — above the threshold his magic overflows and he loses himself to it ("facette
// mage fou"); the artefact (Voie de transition, rang 1) exists precisely so he can bleed PM
// out of his own body into external storage to stay under the threshold on purpose.
export function getFacette(character) {
  const threshold = character.custom_data?.threshold_percent;
  if (threshold == null || !character.pm_max) return null;
  const percent = (character.pm_current / character.pm_max) * 100;
  const active = percent >= threshold ? 'mage' : 'calme';
  return {
    threshold,
    percent,
    active,
    inactiveVoieIds: FACETTE_VOIE_GROUPS[active === 'mage' ? 'calme' : 'mage'],
  };
}
