// "12" = 12 damage (the common case at the table), "-12" the same, "+5" heals 5, "=20" sets the
// PV to 20. Returns null for anything else so a typo never silently changes a pawn's life.
export function parseHpInput(text) {
  const m = String(text).trim().match(/^([+=-]?)\s*(\d+)$/);
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === '=') return { set: n };
  return { delta: m[1] === '+' ? n : -n };
}

// The delta to send for a parsed entry on a pawn currently at `current` PV.
export const hpDelta = ({ delta, set }, current) => (set != null ? set - current : delta);
