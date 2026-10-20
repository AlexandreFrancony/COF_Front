import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import CharacterSummaryCard from './CharacterSummaryCard';
import CreatureSummaryCard from './CreatureSummaryCard';
import { hpDelta, parseHpInput } from '../utils/hp';

function CreatureHp({ token, onHp }) {
  const [text, setText] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const parsed = parseHpInput(text);
    if (!parsed) return toast.error('Écris 12 (dégâts), +5 (soin) ou =20 (nouvelle valeur)');
    const d = hpDelta(parsed, token.hp_current);
    if (d) onHp(token, d);
    setText('');
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-[var(--text-secondary)]">PV {token.hp_current}/{token.hp_max}</span>
      <div className="flex gap-1">
        {[-5, -1, 1, 5].map((d) => (
          <button key={d} onClick={() => onHp(token, d)} className="w-9 h-7 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]">
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-1">
        <input
          type="text" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="12 dégâts · +5 soin · =20"
          className="flex-1 min-w-0 px-2 py-1 text-sm rounded bg-[var(--bg-input)] border border-[var(--border)]"
        />
        <button type="submit" className="px-2 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]">OK</button>
      </form>
    </div>
  );
}

/**
 * A player's own corner of the board: their character's live card (PV/PM adjustable, same card
 * as the GM's) with a link to the full sheet, and every creature they own (golem, familiar)
 * with its PV. Shown on the player's board page and in the projector's slide-out panel.
 * myCharacterIds: the player's characters in this campaign (GET /characters already returns
 * only those for a player).
 */
export default function PlayerCharacterPanel({ board, characters, myCharacterIds, onCreatureHp }) {
  const myTokens = board.tokens.filter((t) => myCharacterIds.has(t.character_id));
  const myCreatures = board.tokens.filter((t) => t.character_id == null && myCharacterIds.has(t.owner_character_id));
  const offBoard = characters.filter((c) => myCharacterIds.has(c.id) && !myTokens.some((t) => t.character_id === c.id));

  return (
    <div className="flex flex-col gap-3">
      {myTokens.map((t) => (
        <div key={t.id} className="flex flex-col gap-1.5">
          <CharacterSummaryCard entry={t} />
          <Link to={`/characters/${t.character_id}`} className="text-xs text-[var(--accent)] hover:underline">📜 Ouvrir ma fiche complète</Link>
        </div>
      ))}
      {offBoard.map((c) => (
        <p key={c.id} className="text-sm text-[var(--text-secondary)]">
          {c.name} n'est pas encore sur le plateau.{' '}
          <Link to={`/characters/${c.id}`} className="text-[var(--accent)] hover:underline">Ouvrir sa fiche</Link>
        </p>
      ))}
      {myCreatures.map((t) => (
        <div key={t.id} className="flex flex-col gap-1.5 p-2 rounded border border-[var(--border)]">
          <CreatureSummaryCard entry={t} />
          <CreatureHp token={t} onHp={onCreatureHp} />
        </div>
      ))}
      {(myTokens.length > 0 || myCreatures.length > 0) && (
        <p className="text-xs text-[var(--text-secondary)]">Tu peux déplacer ton pion{myCreatures.length ? ' et tes créatures' : ''} directement sur le plateau.</p>
      )}
    </div>
  );
}
