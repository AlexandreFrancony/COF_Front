// Some capacités force a one-time choice at creation (an origin, a weapon category...).
// The résumé stays generic (shared across every character with that capacité), but the
// sheet can show the actual choice a given character made, in bold, next to it — and, while
// unset, let the player (or GM) pick it right there instead of leaving a dead "au choix"
// with no way to act on it.
// Keyed by capacité code — add an entry whenever a new choice becomes character-tracked data.

// Voie de l'Humain — rang 1 "Diversité" (p.46) : origine géographique/sociale to choose,
// which grants +3 to two narrative domains tied to it (not modeled here) + 1 PC (backend-computed).
export const HUMAN_ORIGINS = [
  'Montagnard (escalade, résistance au froid)',
  'Citadin (commerce, résistance aux maladies)',
  'Campagnard (météorologie, équitation)',
  'Riverain (natation, navigation)',
  'Sauvage (chasser, pister)',
  'Nomade (orientation, résistance à la chaleur/au froid)',
];

export const CAPACITE_CHOICE_RESOLVERS = {
  'peuple-humain-r1': {
    field: 'origine_humaine',
    options: HUMAN_ORIGINS,
    customPlaceholder: 'Ou un gagne-pain personnalisé (ex: forgeron, scribe, pickpocket...)',
  },
};

export function resolveCapaciteChoice(capacite, character) {
  const entry = CAPACITE_CHOICE_RESOLVERS[capacite.code];
  return (entry && character[entry.field]) || null;
}

// Returns the editable choice definition for this capacité, or null if it isn't a
// character-tracked choice at all (most capacités).
export function getCapaciteChoiceEditor(capacite) {
  return CAPACITE_CHOICE_RESOLVERS[capacite.code] || null;
}
