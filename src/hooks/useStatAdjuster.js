import { useState } from 'react';
import toast from 'react-hot-toast';

// Shared by every "+/- a current/max resource" control (the character sheet's own PV/PM/Chance/
// DR StatAdjuster, and the board's compact AdjustableStatBar) — clamp to [0, max], skip the
// call entirely if the click wouldn't change anything (e.g. already at max and hitting +), and
// disable while a request is in flight so a rapid double-click can't fire two overlapping
// updates. Deliberately not the atomic-server-delta pattern board tokens/zones use for the same
// class of problem: those endpoints don't require the extra round trip a stat-owning resource
// (a character) does here, and disabling the button for the ~100ms request is not a UX cost
// worth a second delta-computing code path on the backend for this in particular.
export function useStatAdjuster(current, max, onChange) {
  const [busy, setBusy] = useState(false);

  const adjust = async (delta) => {
    const next = Math.max(0, Math.min(max, current + delta));
    if (next === current || busy) return;
    setBusy(true);
    try {
      await onChange(next);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return { busy, adjust };
}
