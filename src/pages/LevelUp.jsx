import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getCharacter, getProfils, getVoies, raiseCharacterVoieRang, addCharacterVoie, orphanExchange,
} from '../utils/api';
import { NIVEAU_REQUIS_PAR_RANG } from '../utils/rules';
import { evolvingDieForLevel } from '../utils/evolvingDice';
import { computePvBodyGain, computePmMax, costForRang, pvMaxConTerm, flatBonusFor } from '../utils/characterPreview';

const CATEGORY_META = {
  own: { color: '#C9973E', fallbackIcon: '⚔️' },
  hybride: { color: '#5FB0D9', fallbackIcon: '🔀' },
  homebrew: { color: '#79C26A', fallbackIcon: '✨' },
  orphelin: { color: '#B9AE96', fallbackIcon: '🍀' },
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

function AugmentCard({ card, disabled, pickedCount, onPick, onRemove }) {
  const rarity = rarityFor(card.rang);
  const meta = CATEGORY_META[card.category];
  return (
    <div className={`aug-card aug-${rarity}${pickedCount > 0 ? ' aug-card--picked' : ''}`}>
      {pickedCount > 0 && (
        // A separate button, sibling to the pick button below (never nested — a button inside a
        // button is invalid HTML and the outer one being disabled would swallow the click) — so
        // "remove this choice" still works even once the card itself is greyed out for lacking
        // points to add another increment.
        <button
          type="button"
          className="aug-check"
          onClick={() => onRemove(card)}
          title="Retirer ce choix (pas encore enregistré)"
          aria-label={`Retirer ${card.name} de la sélection`}
        >
          ✓{pickedCount > 1 ? ` ${pickedCount}` : ''}
        </button>
      )}
      <span className="aug-corner" style={{ top: 6, left: 6 }} />
      <span className="aug-corner" style={{ top: 6, right: 6 }} />
      <span className="aug-corner" style={{ bottom: 6, left: 6 }} />
      <span className="aug-corner" style={{ bottom: 6, right: 6 }} />
      <button
        type="button"
        className="aug-card-btn"
        disabled={card.locked || disabled}
        onClick={() => onPick(card)}
        title={card.lockedReason || undefined}
      >
        <div className="aug-frame">
          {/* Each card is its own rang now (a fresh entry in the list, not a mutating one), so
              this plays automatically the moment it mounts — exactly when rang 2 first appears
              next to the rang-1 card it was revealed from. */}
          <div className="aug-frame-inner aug-content-slide">
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
    </div>
  );
}

export default function LevelUp() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [character, setCharacter] = useState(null);
  const [profils, setProfils] = useState([]);
  const [customVoies, setCustomVoies] = useState([]);
  const [allProfilVoies, setAllProfilVoies] = useState([]);
  const [peupleVoies, setPeupleVoies] = useState([]);
  const [mageVoies, setMageVoies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialStats, setInitialStats] = useState(null);
  // Nothing here is saved until "Terminer" — lets a player try a combination, see the preview,
  // and change their mind before anything reaches the server. Each entry represents every point
  // spent so far (this session) on one voie or one orphan choice; the real commit replays them,
  // in order, through the same endpoints a single click used to call immediately.
  const [draft, setDraft] = useState([]);

  useEffect(() => {
    getCharacter(id)
      .then((char) => {
        setCharacter(char);
        setInitialStats({
          pv_max: char.pv_max, pm_max: char.pm_max, points_chance: char.points_chance,
          defense: char.defense, initiative: char.initiative,
        });
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    getProfils().then(setProfils).catch(() => {});
    getVoies({ type: 'custom' }).then(setCustomVoies).catch(() => {});
    getVoies({ type: 'profil' }).then(setAllProfilVoies).catch(() => {});
    getVoies({ type: 'peuple' }).then(setPeupleVoies).catch(() => {});
    getVoies({ type: 'mage' }).then(setMageVoies).catch(() => {});
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }
  if (!character) return null;

  const voieCatalog = [...allProfilVoies, ...customVoies, ...peupleVoies, ...mageVoies];
  const resumeFor = (voieId, rang) =>
    voieCatalog.find((v) => v.id === voieId)?.capacites?.find((c) => c.rang === rang)?.resume || '';
  const profilVoies = allProfilVoies.filter((v) => v.profil_id === character.profil_id);

  const realOwnedVoieIds = new Set((character.voies || []).map((v) => v.voie_id));
  const draftVoieEntries = draft.filter((e) => e.kind === 'voie');
  const effectiveRang = (voieId) => {
    const draftEntry = draftVoieEntries.find((e) => e.voieId === voieId);
    const real = (character.voies || []).find((v) => v.voie_id === voieId)?.rang || 0;
    return real + (draftEntry?.count || 0);
  };
  const draftCountFor = (voieId) => draftVoieEntries.find((e) => e.voieId === voieId)?.count || 0;
  const draftCountForOrphan = (choice) => draft.find((e) => e.kind === 'orphan' && e.choice === choice)?.count || 0;

  const draftPointsSpent = draft.reduce((sum, e) => {
    if (e.kind === 'orphan') return sum + e.count;
    const startingRang = (character.voies || []).find((v) => v.voie_id === e.voieId)?.rang || 0;
    let cost = 0;
    for (let i = 1; i <= e.count; i++) cost += costForRang(startingRang + i);
    return sum + cost;
  }, 0);
  const effectivePoints = character.capacity_points_available - draftPointsSpent;

  const plannedVoieIds = new Set(character.planned_voie_ids || []);
  const hasPlan = plannedVoieIds.size > 0;

  // Stable list membership: every pool below is computed from REAL ownership + the roadmap
  // only, never from the draft — a card must keep the exact same slot in the grid all session,
  // picked or not, or the whole layout reflows every click and the player loses their place. A
  // card's own CONTENT still reflects the draft (via effectiveRang below), just never its
  // position.
  const realRaisableVoies = (character.voies || [])
    .filter((v) => !(v.rang_cap && v.rang >= v.rang_cap) && !v.nested_under_capacite_id && v.type !== 'prestige');
  const unownedProfilVoies = profilVoies.filter((v) => !realOwnedVoieIds.has(v.id) && (!hasPlan || plannedVoieIds.has(v.id)));
  const unownedCustomVoies = customVoies.filter(
    (v) => !realOwnedVoieIds.has(v.id) && (v.origine_pj_character_id == null || v.origine_pj_character_id === character.id)
      && (!hasPlan || plannedVoieIds.has(v.id))
  );
  // Hybrid eligibility DOES react to the draft — picking enough own-profil voies this session
  // can legitimately close off hybrid picks, same as it would for real. That's a rule
  // consequence, not a cosmetic reorder: unlike the pools above, hybrid CARDS (plural, as a
  // group) are allowed to disappear mid-session; an individual card never moves between pools.
  const effectiveOwnedVoieIds = new Set([...realOwnedVoieIds, ...draftVoieEntries.map((e) => e.voieId)]);
  const effectiveOwnProfilOwnedCount = [...effectiveOwnedVoieIds].filter((vid) => profilVoies.some((pv) => pv.id === vid)).length;
  const hybridAllowed = effectiveOwnProfilOwnedCount < 5;
  const hybridVoies = hybridAllowed
    ? allProfilVoies.filter((v) => !realOwnedVoieIds.has(v.id) && v.profil_id !== character.profil_id && (!hasPlan || plannedVoieIds.has(v.id)))
    : [];

  const cards = [];

  // Shared builder: `info` is either a character.voies entry (has voie_id/name/icon/type) or a
  // catalog voie (has id/name/icon/type) — both shapes carry what's needed. Produces a CHAIN of
  // cards, not one mutating card: each already-picked rang gets its own frozen card (content
  // never changes once picked, matching what the player actually clicked), and at most one more
  // "next rang" card is appended after it — revealed only while a point remains to spend on it,
  // as if it slid out from behind the card that was just taken. This also means a voie simply
  // stops producing new cards once its last real rang is picked, instead of the previous design
  // where the one mutating card vanished the moment there was nothing further to unlock.
  const buildVoieCardChain = (voieId, info, category, newSubtitle) => {
    const baseRang = (character.voies || []).find((v) => v.voie_id === voieId)?.rang || 0;
    const pickedCount = draftCountFor(voieId);
    const chain = [];
    for (let step = 0; step <= pickedCount; step += 1) {
      const isPicked = step < pickedCount;
      // Only reveal a further tier while there's still a point to spend on it — the voie's very
      // first offer (step 0) always shows regardless, same as every other never-picked card.
      if (!isPicked && step > 0 && effectivePoints <= 0) break;
      const stepCurrentRang = baseRang + step;
      const stepTargetRang = stepCurrentRang + 1;
      const capaciteExists = voieCatalog.find((v) => v.id === voieId)?.capacites?.some((c) => c.rang === stepTargetRang);
      if (!capaciteExists) break; // maxed out — no further card, picked or not
      const niveauRequis = NIVEAU_REQUIS_PAR_RANG[stepTargetRang];
      const tooLow = niveauRequis != null && character.level < niveauRequis;
      chain.push({
        key: `voie-${voieId}-r${stepTargetRang}`, kind: 'voie', voieId, name: info.name, icon: info.icon,
        subtitle: stepCurrentRang > 0 ? `Rang ${stepCurrentRang} → ${stepTargetRang}` : newSubtitle,
        category, rang: stepTargetRang, cost: costForRang(stepTargetRang), locked: tooLow,
        lockedReason: tooLow ? `Niveau ${niveauRequis} requis` : null,
        description: resumeFor(voieId, stepTargetRang),
        profilId: voieCatalog.find((v) => v.id === voieId)?.profil_id ?? null,
        picked: isPicked,
        pickStep: step + 1,
      });
    }
    return chain;
  };

  realRaisableVoies.forEach((v) => {
    const category = v.type === 'custom' ? 'homebrew'
      : v.type === 'peuple' || v.type === 'mage' ? 'own'
      : profilVoies.some((pv) => pv.id === v.voie_id) ? 'own' : 'hybride';
    cards.push(...buildVoieCardChain(v.voie_id, v, category, null));
  });

  unownedProfilVoies.forEach((v) => {
    cards.push(...buildVoieCardChain(v.id, v, 'own', 'Nouvelle voie, rang 1'));
  });

  unownedCustomVoies.forEach((v) => {
    cards.push(...buildVoieCardChain(v.id, v, 'homebrew', 'Homebrew, rang 1'));
  });

  hybridVoies.forEach((v) => {
    cards.push(...buildVoieCardChain(v.id, v, 'hybride', `Hybride — ${profils.find((p) => p.id === v.profil_id)?.name}`));
  });

  // Point orphelin (p.42) : réservé au cas où aucune autre capacité n'est accessible.
  const hasOtherOption = cards.length > 0;
  ORPHAN_CHOICES.forEach((o) => cards.push({
    key: `orphan-${o.choice}`, kind: 'orphan', choice: o.choice, name: o.name,
    subtitle: 'Point orphelin', category: 'orphelin', rang: 1, cost: 1,
    locked: hasOtherOption, lockedReason: hasOtherOption ? "D'autres voies restent ouvertes" : null,
    icon: o.icon, description: o.description,
  }));

  const pickCard = (card) => {
    if (card.locked || effectivePoints <= 0) return;
    setDraft((prev) => {
      const key = card.kind === 'orphan' ? `orphan-${card.choice}` : `voie-${card.voieId}`;
      const existing = prev.find((e) => (e.kind === 'orphan' ? `orphan-${e.choice}` : `voie-${e.voieId}`) === key);
      if (existing) {
        return prev.map((e) => (e === existing ? { ...e, count: e.count + 1 } : e));
      }
      if (card.kind === 'orphan') {
        return [...prev, { kind: 'orphan', choice: card.choice, name: card.name, icon: card.icon, count: 1 }];
      }
      return [...prev, {
        kind: 'voie', voieId: card.voieId, name: card.name, icon: card.icon,
        profilId: card.profilId, count: 1,
      }];
    });
  };

  // Takes a card (from `cards`), not a draft entry directly — the checkmark badge lives on the
  // card, which is rebuilt fresh every render, so it can only ever hand back the card it knows.
  // For a voie, removing rang N also drops every rang picked after it for that same voie (you
  // can't keep rang 3 while un-picking rang 2, its prerequisite) — pickStep - 1 is exactly the
  // count that leaves everything before this card intact.
  const removeDraftEntry = (card) => {
    setDraft((prev) => {
      if (card.kind === 'orphan') {
        return prev.filter((e) => !(e.kind === 'orphan' && e.choice === card.choice));
      }
      return prev
        .map((e) => (e.kind === 'voie' && e.voieId === card.voieId ? { ...e, count: card.pickStep - 1 } : e))
        .filter((e) => e.kind !== 'voie' || e.voieId !== card.voieId || e.count > 0);
    });
  };

  // --- Preview: every derived stat as if the draft were committed. Mirrors the backend's
  // stat_substitute_max and flat_bonus_by_rang capacité effects (pv_max/pm_max/défense/
  // initiative below); best-effort only for a capacité that grants a permanent caractéristique
  // increase (stat_permanent_increase, e.g. Esprit supérieur) — picking one of those this same
  // level won't retroactively bump the preview's AGI/PER/VOL. The real commit always goes
  // through the authoritative backend regardless, so a gap here can only make the PREVIEW
  // slightly off, never the saved data.
  const effectiveSortsCount = () => {
    let count = 0;
    effectiveOwnedVoieIds.forEach((voieId) => {
      const rang = effectiveRang(voieId);
      const caps = voieCatalog.find((v) => v.id === voieId)?.capacites || [];
      count += caps.filter((c) => c.rang <= rang && c.est_sort).length;
    });
    return count;
  };
  // { effect, voieRang } pairs mirroring what the backend's own flatBonusFor/pvMaxConTerm read —
  // "current" from real ownership (character.voies already comes rang-gated from the backend),
  // "draft" recomputed at the draft's effective rang for every voie touched this session
  // (including a voie not owned yet, resolved through voieCatalog since it isn't in
  // character.voies at all until committed).
  const currentCapaciteEffects = (character.voies || []).flatMap(
    (v) => (v.capacites || []).map((c) => ({ effect: c.effect, voieRang: v.rang })).filter((e) => e.effect)
  );
  const draftCapaciteEffects = [...effectiveOwnedVoieIds].flatMap((voieId) => {
    const rang = effectiveRang(voieId);
    const caps = voieCatalog.find((v) => v.id === voieId)?.capacites || [];
    return caps.filter((c) => c.rang <= rang && c.effect).map((c) => ({ effect: c.effect, voieRang: rang }));
  });

  const pmBonusOrphanDraft = draftCountForOrphan('pm') * 2;
  const previewPmMax = computePmMax(effectiveSortsCount(), character.caracteristiques.VOL) + character.pm_bonus_orphan
    + pmBonusOrphanDraft + flatBonusFor(draftCapaciteEffects, 'pm_max');
  // Défense/initiative aren't a per-level ledger like pv_max — the backend recomputes them
  // instantly after every single voie mutation, not just once a level's points are all spent —
  // so the preview reacts to the draft immediately too, as a delta over the character's current
  // (already-live) value rather than a from-scratch formula (which would need armor/shield data
  // the level-up page doesn't have).
  const previewDefense = character.defense
    + flatBonusFor(draftCapaciteEffects, 'defense') - flatBonusFor(currentCapaciteEffects, 'defense');
  const previewInitiative = character.initiative
    + flatBonusFor(draftCapaciteEffects, 'initiative') - flatBonusFor(currentCapaciteEffects, 'initiative');

  const previewPvBodyTotal = () => {
    if (effectivePoints > 0) return character.pv_body_total; // not finalized yet, like today
    const familleCodes = [];
    draftVoieEntries.forEach((e) => {
      if (e.profilId == null) return; // peuple/custom/mage voies don't feed the family ledger
      const profil = profils.find((p) => p.id === e.profilId);
      if (profil?.famille_code) {
        for (let i = 0; i < e.count; i++) familleCodes.push(profil.famille_code);
      }
    });
    const pvOrphanDraft = draftCountForOrphan('pv') * 2;
    if (familleCodes.length === 0) return character.pv_body_total + pvOrphanDraft;
    const pvBases = familleCodes
      .map((code) => profils.find((p) => p.famille_code === code)?.pv_base)
      .filter((x) => x != null);
    const { gain } = computePvBodyGain(pvBases, character.pv_pending_half);
    return character.pv_body_total + gain + pvOrphanDraft;
  };
  // Nothing about pv_max actually changes until the level's points are all finalized (matches
  // real behavior) — showing a recomputed value in the meantime, even a correct one, would flash
  // a bogus swing every click. Once it does finalize, mirror the same CON/INT-substitution
  // capacité effects (e.g. Grosse tête) the real formula applies, using the character's own
  // already-fetched capacités — a plain CON × level here would show a false regression for
  // anyone with that kind of effect.
  const previewPvMax = effectivePoints > 0
    ? character.pv_max
    : previewPvBodyTotal() + pvMaxConTerm(character.caracteristiques, draftCapaciteEffects.map((e) => e.effect), character.level);
  const previewChance = character.points_chance + draftCountForOrphan('pc');

  const prevDie = evolvingDieForLevel(character.level - 1);
  const currDie = evolvingDieForLevel(character.level);
  const diceChanged = prevDie !== currDie;
  const evolvingCapacites = diceChanged
    ? (character.voies || []).flatMap((v) => (v.capacites || []).filter((c) => (c.resume || c.description || '').includes('d4°')))
    : [];

  const statRow = (label, icon, before, now) => (
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

  const commit = async () => {
    if (draft.length === 0) {
      navigate(`/characters/${id}`);
      return;
    }
    setSaving(true);
    try {
      for (const entry of draft) {
        if (entry.kind === 'orphan') {
          for (let i = 0; i < entry.count; i++) {
            // eslint-disable-next-line no-await-in-loop
            await orphanExchange(character.id, entry.choice);
          }
          continue;
        }
        let rang = (character.voies || []).find((v) => v.voie_id === entry.voieId)?.rang || 0;
        if (rang === 0) {
          // eslint-disable-next-line no-await-in-loop
          await addCharacterVoie(character.id, { voie_id: entry.voieId, obtained_at_level: character.level });
          rang = 1;
        }
        const targetRang = ((character.voies || []).find((v) => v.voie_id === entry.voieId)?.rang || 0) + entry.count;
        for (let i = rang; i < targetRang; i++) {
          // eslint-disable-next-line no-await-in-loop
          await raiseCharacterVoieRang(character.id, entry.voieId);
        }
      }
      toast.success('Montée de niveau enregistrée !');
      navigate(`/characters/${id}`);
    } catch (e) {
      toast.error(e.message);
      setDraft([]);
      getCharacter(id).then(setCharacter).catch(() => {});
    } finally {
      setSaving(false);
    }
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
            {statRow('Vigueur max', '❤️', initialStats.pv_max, previewPvMax)}
            {statRow('Mana max', '🔮', initialStats.pm_max, previewPmMax)}
            {statRow('Chance', '🍀', initialStats.points_chance, previewChance)}
            {statRow('Défense', '🛡️', initialStats.defense, previewDefense)}
            {statRow('Initiative', '⚡', initialStats.initiative, previewInitiative)}
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
              {Array.from({ length: character.capacity_points_available }).map((_, i) => (
                <div
                  key={i}
                  className="w-[22px] h-[22px] rounded"
                  style={i < effectivePoints
                    ? { background: 'var(--accent)', border: '1px solid var(--accent-hover)' }
                    : { background: 'transparent', border: '1px solid var(--border)' }}
                />
              ))}
            </div>
          </div>

          {character.capacity_points_available === 0 && draft.length === 0 ? (
            <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border)] p-8 text-center text-[var(--text-secondary)]">
              Tous les points de ce niveau sont dépensés.
            </div>
          ) : (
            <div className="flex gap-4 flex-wrap">
              {cards.map((card) => (
                <AugmentCard
                  key={card.key}
                  card={card}
                  disabled={saving || card.picked || (effectivePoints <= 0 && !card.locked)}
                  pickedCount={card.kind === 'orphan' ? draftCountForOrphan(card.choice) : (card.picked ? 1 : 0)}
                  onPick={pickCard}
                  onRemove={removeDraftEntry}
                />
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={commit}
              disabled={saving}
              className="px-8 py-3 rounded-lg bg-[var(--accent)] text-white font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : draft.length > 0 ? 'Valider ces choix' : 'Terminer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
