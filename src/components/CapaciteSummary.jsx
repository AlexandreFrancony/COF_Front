import { resolveEvolvingDice } from '../utils/evolvingDice';

// Shows a capacité's short résumé (fast reading) with a link to its full description
// in the glossaire, instead of always printing the full rulebook paragraph inline.
export default function CapaciteSummary({ capacite, level, voieId }) {
  const linkedVoieId = voieId ?? capacite.voie_id;
  return (
    <span className="text-[var(--text-secondary)]">
      {' '}
      —{' '}
      {capacite.resume ? (
        <span className="font-medium text-[var(--accent)]">{capacite.resume}</span>
      ) : (
        resolveEvolvingDice(capacite.description, level)
      )}
      {linkedVoieId && (
        <a
          href={`/glossaire?voie=${linkedVoieId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 hover:opacity-70"
          title="Voir la voie complète dans le glossaire"
        >
          📖
        </a>
      )}
    </span>
  );
}
