// Some capacité descriptions contain a "d4°" placeholder for a die that grows with level
// (p.31: d4 → d6 → d8 → d10 → d12 at levels 1/6/9/12/15).
const DICE_PROGRESSION = ['d4', 'd6', 'd8', 'd10', 'd12'];

export function evolvingDieForLevel(level) {
  if (level < 6) return DICE_PROGRESSION[0];
  return DICE_PROGRESSION[Math.min(4, 1 + Math.floor((level - 6) / 3))];
}

export function resolveEvolvingDice(text, level) {
  if (!text) return text;
  const die = evolvingDieForLevel(level);
  return text.replace(/d4°/g, die);
}
