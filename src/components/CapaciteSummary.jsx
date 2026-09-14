import { useState } from 'react';
import toast from 'react-hot-toast';
import { resolveEvolvingDice } from '../utils/evolvingDice';
import { resolveCapaciteChoice, getCapaciteChoiceEditor } from '../utils/capaciteChoices';
import { openGlossaire, isPlainLeftClick } from '../utils/openGlossaire';
import { updateCharacter } from '../utils/api';

// A capacité like Diversité (Voie de l'Humain, rang 1) forces a one-time choice — the résumé
// text alone just said "(au choix)" with no way to actually act on it. This lets the player
// (or GM) pick it right here once, from the real options in CAPACITE_CHOICE_RESOLVERS.
function ChoiceEditor({ character, editor, onRefresh }) {
  const [customValue, setCustomValue] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (value) => {
    const trimmed = value.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await updateCharacter(character.id, { [editor.field]: trimmed });
      await onRefresh?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      {editor.options.map((o) => (
        <button
          key={o}
          type="button"
          disabled={saving}
          onClick={() => save(o)}
          className="px-2 py-0.5 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-50"
        >
          {o}
        </button>
      ))}
      <input
        type="text"
        value={customValue}
        onChange={(e) => setCustomValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save(customValue);
          }
        }}
        onBlur={() => save(customValue)}
        placeholder={editor.customPlaceholder}
        disabled={saving}
        className="px-2 py-0.5 text-xs rounded border border-[var(--border)] bg-[var(--bg-input)] disabled:opacity-50"
      />
    </span>
  );
}

// Shows a capacité's short résumé (fast reading) with a link to its full description
// in the glossaire, instead of always printing the full rulebook paragraph inline.
export default function CapaciteSummary({ capacite, level, voieId, character, onRefresh }) {
  const linkedVoieId = voieId ?? capacite.voie_id;
  const choice = character ? resolveCapaciteChoice(capacite, character) : null;
  const editor = character && !choice ? getCapaciteChoiceEditor(capacite) : null;
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
      {editor && <ChoiceEditor character={character} editor={editor} onRefresh={onRefresh} />}
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
