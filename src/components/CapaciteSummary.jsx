import { resolveEvolvingDice } from '../utils/evolvingDice';
import { resolveCapaciteChoice } from '../utils/capaciteChoices';
import { openGlossaire, isPlainLeftClick } from '../utils/openGlossaire';

// Shows a capacité's short résumé (fast reading) with a link to its full description
// in the glossaire, instead of always printing the full rulebook paragraph inline.
export default function CapaciteSummary({ capacite, level, voieId, character }) {
  const linkedVoieId = voieId ?? capacite.voie_id;
  const choice = character ? resolveCapaciteChoice(capacite, character) : null;
  return (
    <span className="text-[var(--text-secondary)]">
      {' '}
      —{' '}
      {capacite.resume ? (
        <span className="font-medium text-[var(--accent)]">{capacite.resume}</span>
      ) : (
        resolveEvolvingDice(capacite.description, level)
      )}
      {choice && (
        <>
          {' — '}
          <span className="font-bold text-[var(--text-primary)]">{choice}</span>
        </>
      )}
      {linkedVoieId && (
        <a
          href={`/glossaire?voie=${linkedVoieId}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (!isPlainLeftClick(e)) return;
            e.preventDefault();
            openGlossaire(`/glossaire?voie=${linkedVoieId}`);
          }}
          className="ml-1 hover:opacity-70"
          title="Voir la voie complète dans le glossaire"
        >
          📖
        </a>
      )}
    </span>
  );
}
