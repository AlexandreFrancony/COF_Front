import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getCharacter, getProfils, getVoies, raiseCharacterVoieRang, addCharacterVoie, orphanExchange,
} from '../utils/api';
import { NIVEAU_REQUIS_PAR_RANG } from '../utils/rules';
import { evolvingDieForLevel } from '../utils/evolvingDice';

const CATEGORY_META = {
  own: { color: '#C9973E', fallbackIcon: '⚔️', label: 'Profil' },
  hybride: { color: '#5FB0D9', fallbackIcon: '🔀', label: 'Hybride' },
  homebrew: { color: '#79C26A', fallbackIcon: '✨', label: 'Homebrew' },
  orphelin: { color: '#B9AE96', fallbackIcon: '🍀', label: 'Point orphelin' },
};

const ORPHAN_CHOICES = [
  { choice: 'pc', name: '+1 Chance', icon: '🍀', description: 'Bonus immédiat, sans capacité associée.' },
  { choice: 'dr', name: '+1 Récupération', icon: '💤', description: 'Un dé de récupération supplémentaire.' },
  { choice: 'pv', name: '+2 Vigueur max', icon: '❤️', description: 'Ajouté directement au grand livre de PV.' },
  { choice: 'pm', name: '+2 Mana max', icon: '🔮', description: 'Réserve de mana permanente.' },
];

function rarityFor(rang) {
  if (rang >= 5) return 'prismatic';
  if (rang >= 3) return 'gold';
  return 'silver';
}

function AugmentCard({ card, busy, onPick }) {
  const rarity = rarityFor(card.rang);
  const meta = CATEGORY_META[card.category];
  return (
    <button
      type="button"
      className={`aug-card aug-${rarity}`}
      disabled={card.locked || busy}
      onClick={() => onPick(card)}
      title={card.lockedReason || undefined}
    >
      <span className="aug-corner" style={{ top: 6, left: 6 }} />
      <span className="aug-corner" style={{ top: 6, right: 6 }} />
      <span className="aug-corner" style={{ bottom: 6, left: 6 }} />
      <span className="aug-corner" style={{ bottom: 6, right: 6 }} />
      <div className="aug-frame">
        <div className="aug-frame-inner">
          <div style={{ position: 'relative', width: 44, height: 44, marginTop: 2 }}>
            <svg width="44" height="44" viewBox="0 0 48 48" style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
              <polygon className="medallion-ring" points="24,1 47,24 24,47 1,24" fill="none" strokeWidth="1.5" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', background: meta.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
              }}>
                {card.icon || meta.fallbackIcon}
              </div>
            </div>
          </div>
          <div className="aug-title">{card.name}</div>
          <div className="aug-sub">{card.subtitle}</div>
          <div className="aug-rule" />
          <div className="aug-desc">{card.description}</div>
          {card.locked ? (
            <div className="aug-locked">🔒 {card.lockedReason}</div>
          ) : (
            <div className="aug-cost">{card.cost} point{card.cost > 1 ? 's' : ''}</div>
          )}
        </div>
      </div>
    </button>
  );
}

export default function LevelUp() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [character, setCharacter] = useState(null);
  const [profils, setProfils] = useState([]);
  const [profilVoies, setProfilVoies] = useState([]);
  const [customVoies, setCustomVoies] = useState([]);
  const [allProfilVoies, setAllProfilVoies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [initialStats, setInitialStats] = useState(null);
  const [initialPoints, setInitialPoints] = useState(null);

  useEffect(() => {
    getCharacter(id)
      .then((char) => {
        setCharacter(char);
        setInitialStats({
          pv_max: char.pv_max, pm_max: char.pm_max, points_chance: char.points_chance,
          defense: char.defense, initiative: char.initiative,
        });
        setInitialPoints(char.capacity_points_available);
        return getVoies({ profil_id: char.profil_id, type: 'profil' });
      })
      .then(setProfilVoies)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    getProfils().then(setProfils).catch(() => {});
    getVoies({ type: 'custom' }).then(setCustomVoies).catch(() => {});
    getVoies({ type: 'profil' }).then(setAllProfilVoies).catch(() => {});
  }, [id]);

  const refresh = () => getCharacter(id).then(setCharacter).catch((e) => toast.error(e.message));

  const runCard = async (card) => {
    if (card.locked || busy) return;
    setBusy(true);
    try {
      if (card.kind === 'raise') {
        await raiseCharacterVoieRang(character.id, card.voieId);
      } else if (card.kind === 'new') {
        await addCharacterVoie(character.id, { voie_id: card.voieId, obtained_at_level: character.level });
      } else {
        await orphanExchange(character.id, card.choice);
      }
      await refresh();
      toast.success(card.name);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }
  if (!character) return null;

  const points = character.capacity_points_available;
  const ownedVoieIds = new Set((character.voies || []).map((v) => v.voie_id));
  const plannedVoieIds = new Set(character.planned_voie_ids || []);
  const hasPlan = plannedVoieIds.size > 0;
  // Full catalog (own profil is a subset of allProfilVoies) — used to look up the resume text of
  // the NEXT rang for a card, since character.voies only carries capacités up to the current rang.
  const voieCatalog = [...allProfilVoies, ...customVoies];
  const resumeFor = (voieId, rang) =>
    voieCatalog.find((v) => v.id === voieId)?.capacites?.find((c) => c.rang === rang)?.resume || '';

  const unownedProfilVoies = profilVoies.filter((v) => !ownedVoieIds.has(v.id) && (!hasPlan || plannedVoieIds.has(v.id)));
  const unownedCustomVoies = customVoies.filter(
    (v) => !ownedVoieIds.has(v.id) && (v.origine_pj_character_id == null || v.origine_pj_character_id === character.id)
      && (!hasPlan || plannedVoieIds.has(v.id))
  );
  const ownProfilOwnedCount = (character.voies || []).filter((v) => profilVoies.some((pv) => pv.id === v.voie_id)).length;
  const hybridAllowed = ownProfilOwnedCount < 5;
  const hybridVoies = hybridAllowed
    ? allProfilVoies.filter((v) => !ownedVoieIds.has(v.id) && v.profil_id !== character.profil_id && (!hasPlan || plannedVoieIds.has(v.id)))
    : [];
  const raisable = (character.voies || []).filter((v) => !(v.rang_cap && v.rang >= v.rang_cap) && !v.nested_under_capacite_id);

  const cards = [];

  raisable.forEach((v) => {
    const targetRang = v.rang + 1;
    const niveauRequis = NIVEAU_REQUIS_PAR_RANG[targetRang];
    const tooLow = niveauRequis != null && character.level < niveauRequis;
    const category = v.type === 'custom' ? 'homebrew'
      : v.type === 'peuple' || v.type === 'mage' ? 'own'
      : profilVoies.some((pv) => pv.id === v.voie_id) ? 'own' : 'hybride';
    cards.push({
      key: `raise-${v.voie_id}`, kind: 'raise', voieId: v.voie_id, name: v.name,
      subtitle: `Rang ${v.rang} → ${targetRang}`, category, rang: targetRang,
      cost: targetRang >= 3 ? 2 : 1, locked: tooLow,
      lockedReason: tooLow ? `Niveau ${niveauRequis} requis` : null,
      description: resumeFor(v.voie_id, targetRang),
    });
  });

  unownedProfilVoies.forEach((v) => cards.push({
    key: `new-profil-${v.id}`, kind: 'new', voieId: v.id, name: v.name,
    subtitle: 'Nouvelle voie, rang 1', category: 'own', rang: 1, cost: 1, locked: false,
    description: resumeFor(v.id, 1),
  }));

  unownedCustomVoies.forEach((v) => cards.push({
    key: `new-custom-${v.id}`, kind: 'new', voieId: v.id, name: v.name,
    subtitle: 'Homebrew, rang 1', category: 'homebrew', rang: 1, cost: 1, locked: false,
    description: resumeFor(v.id, 1),
  }));

  hybridVoies.forEach((v) => cards.push({
    key: `new-hybrid-${v.id}`, kind: 'new', voieId: v.id, name: v.name,
    subtitle: `Hybride — ${profils.find((p) => p.id === v.profil_id)?.name}`, category: 'hybride', rang: 1, cost: 1, locked: false,
    description: resumeFor(v.id, 1),
  }));

  // Point orphelin (p.42) : réservé au cas où aucune autre capacité n'est accessible.
  const hasOtherOption = cards.length > 0;
  ORPHAN_CHOICES.forEach((o) => cards.push({
    key: `orphan-${o.choice}`, kind: 'orphan', choice: o.choice, name: o.name,
    subtitle: 'Point orphelin', category: 'orphelin', rang: 1, cost: 1,
    locked: hasOtherOption, lockedReason: hasOtherOption ? "D'autres voies restent ouvertes" : null,
    icon: o.icon, description: o.description,
  }));

  const prevDie = evolvingDieForLevel(character.level - 1);
  const currDie = evolvingDieForLevel(character.level);
  const diceChanged = prevDie !== currDie;
  const evolvingCapacites = diceChanged
    ? (character.voies || []).flatMap((v) => (v.capacites || []).filter((c) => (c.resume || c.description || '').includes('d4°')))
    : [];

  const statRow = (label, icon, key) => {
    const before = initialStats[key];
    const now = character[key];
    return (
      <div className="flex items-center justify-between">
        <span className="text-[13.5px]">{icon} {label}</span>
        {before === now ? (
          <span className="cof-display text-[14.5px] font-bold">{now}</span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="cof-display text-[14.5px] text-[var(--text-secondary)]">{before}</span>
            <span className="text-[var(--accent)]">→</span>
            <span className="cof-display text-[14.5px] font-bold text-[var(--positive)]">{now}</span>
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <div className="flex flex-col gap-1">
          <Link to={`/characters/${id}`} className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-hover)]">
            ← Retour à la fiche de {character.name}
          </Link>
          <h1 className="cof-display text-2xl font-bold text-[var(--accent-hover)]">Montée de niveau</h1>
        </div>
        <div className="px-4 py-1.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-sm">
          Niveau <span className="cof-display font-bold">{character.level}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5 items-start">
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-5 flex flex-col gap-4">
          <h2 className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Ce qui évolue</h2>
          <div className="flex flex-col gap-2.5">
            {statRow('Vigueur max', '❤️', 'pv_max')}
            {statRow('Mana max', '🔮', 'pm_max')}
            {statRow('Chance', '🍀', 'points_chance')}
            {statRow('Défense', '🛡️', 'defense')}
            {statRow('Initiative', '⚡', 'initiative')}
          </div>
          {diceChanged && evolvingCapacites.length > 0 && (
            <>
              <div className="h-px bg-[var(--border)] opacity-50" />
              <div className="flex flex-col gap-2">
                <h3 className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">Dés évolutifs</h3>
                {evolvingCapacites.map((c) => (
                  <div key={c.id} className="rounded-lg bg-[var(--bg-input)] border border-[var(--border)] px-2.5 py-2 flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium">{c.name}</span>
                    <span className="text-[13px]">
                      <span className="text-[var(--text-secondary)]">{prevDie}°</span>
                      <span className="text-[var(--accent)]"> → </span>
                      <span className="font-bold text-[var(--positive)]">{currDie}°</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-xl bg-[var(--bg-card)] border border-[var(--border)] px-5 py-3">
            <span className="text-sm text-[var(--text-secondary)]">Points de compétence restants</span>
            <div className="flex gap-2">
              {Array.from({ length: initialPoints || 0 }).map((_, i) => (
                <div
                  key={i}
                  className="w-[22px] h-[22px] rounded"
                  style={i < points
                    ? { background: 'var(--accent)', border: '1px solid var(--accent-hover)' }
                    : { background: 'transparent', border: '1px solid var(--border)' }}
                />
              ))}
            </div>
          </div>

          {points === 0 ? (
            <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-8 text-center text-[var(--text-secondary)]">
              Tous les points de ce niveau sont dépensés.
            </div>
          ) : (
            <div className="flex gap-4 flex-wrap">
              {cards.map((card) => (
                <AugmentCard key={card.key} card={card} busy={busy} onPick={runCard} />
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => navigate(`/characters/${id}`)}
              className="px-8 py-3 rounded-lg bg-[var(--accent)] text-white font-semibold hover:bg-[var(--accent-hover)]"
            >
              Terminer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
