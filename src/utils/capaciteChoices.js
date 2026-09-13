// Some capacités force a one-time choice at creation (an origin, a weapon category...).
// The résumé stays generic (shared across every character with that capacité), but the
// sheet can show the actual choice a given character made, in bold, next to it.
// Keyed by capacité code — add an entry whenever a new choice becomes character-tracked data.
export const CAPACITE_CHOICE_RESOLVERS = {
  'peuple-humain-r1': (character) => character.origine_humaine || null,
};

export function resolveCapaciteChoice(capacite, character) {
  return CAPACITE_CHOICE_RESOLVERS[capacite.code]?.(character) || null;
}
