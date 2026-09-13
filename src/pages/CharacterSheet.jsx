import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
  getCharacter, getProfils, getPeuples, getVoies,
  updateCharacter, addCharacterVoie, raiseCharacterVoieRang, setCharacterVoieRang, forgetCharacterVoie,
  levelUpCharacter, orphanExchange, getArmures, createArmure, deleteArmure,
  getArmes, createArme, deleteArme,
} from '../utils/api';
import CapaciteSummary from '../components/CapaciteSummary';

const CARACS = ['AGI', 'CON', 'FOR', 'PER', 'CHA', 'INT', 'VOL'];
const CARAC_LABELS = {
  AGI: 'Agilité', CON: 'Constitution', FOR: 'Force', PER: 'Perception',
  CHA: 'Charisme', INT: 'Intelligence', VOL: 'Volonté',
};
// Quick-scan emoji for stats/caracs — purely cosmetic, no meaning encoded beyond "PV vs PM vs
// Chance etc. look different at a glance".
const CARAC_EMOJI = { AGI: '🤸', CON: '🫀', FOR: '💪', PER: '👁️', CHA: '✨', INT: '🧠', VOL: '🔥' };
const STAT_EMOJI = { PV: '❤️', PM: '🔮', Chance: '🍀', DR: '💤', Défense: '🛡️', Initiative: '⚡' };

// Voie de l'Humain — rang 1 "Diversité" (p.46) : origine géographique/sociale à choisir,
// qui donne +3 à deux domaines narratifs liés (non modélisés ici) + 1 PC (calculé côté backend).
const HUMAN_ORIGINS = [
  'Montagnard (escalade, résistance au froid)',
  'Citadin (commerce, résistance aux maladies)',
  'Campagnard (météorologie, équitation)',
  'Riverain (natation, navigation)',
  'Sauvage (chasser, pister)',
  'Nomade (orientation, résistance à la chaleur/au froid)',
];

// Augustin Moëdec's homebrew schizophrenia — hardcoded to these exact voie_ids (Voie des
// artefacts=76, Voie du métal=78 for "facette calme" · Voie de la magie destructrice=82,
// Voie de la magie élémentaire=83 for "facette mage fou"), not a general multi-personality
// system. Gated on character.custom_data.threshold_percent being set (only true for him),
// so this is a no-op for every other character.
const FACETTE_VOIE_GROUPS = { calme: [76, 78], mage: [82, 83] };

// Facette is driven by the character's OWN current/max PM ratio (not the artefact's stored
// reserve) — above the threshold his magic overflows and he loses himself to it ("facette
// mage fou"); the artefact (Voie de transition, rang 1) exists precisely so he can bleed PM
// out of his own body into external storage to stay under the threshold on purpose.
function getFacette(character) {
  const threshold = character.custom_data?.threshold_percent;
  if (threshold == null || !character.pm_max) return null;
  const percent = (character.pm_current / character.pm_max) * 100;
  const active = percent >= threshold ? 'mage' : 'calme';
  return {
    threshold,
    percent,
    active,
    inactiveVoieIds: FACETTE_VOIE_GROUPS[active === 'mage' ? 'calme' : 'mage'],
  };
}

function Card({ children, className = '' }) {
  return (
    <div className={`p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] ${className}`}>
      {children}
    </div>
  );
}

// Recursive: a capacité that itself grants a further borrowed pick (e.g. Augustin's Voie du
// Mage rang 1 → Voie du Gnome's "Don étrange" → Voie de l'envoûteur's "Injonction") nests to
// arbitrary depth, not just one level — each nested voie's own capacité may have its own
// nestedVoiesByCapacite entry in turn.
function NestedCapacites({ parentCapaciteId, nestedVoiesByCapacite, level, character }) {
  const nested = nestedVoiesByCapacite[parentCapaciteId];
  if (!nested?.length) return null;
  return nested.map((nv) => (
    <ul key={nv.voie_id} className="mt-1.5 ml-3 pl-2 border-l-2 border-[var(--border)] flex flex-col gap-1.5">
      {nv.capacites?.map((nc) => (
        <li key={nc.id}>
          <span className="text-xs text-[var(--text-secondary)]">via {nv.name} — </span>
          <span className="font-medium">
            {nc.name}
            {nc.est_sort && <span className="ml-1 text-xs text-[var(--accent)]">(sort)</span>}
          </span>
          <CapaciteSummary capacite={nc} level={level} voieId={nv.voie_id} character={character} />
          <NestedCapacites parentCapaciteId={nc.id} nestedVoiesByCapacite={nestedVoiesByCapacite} level={level} character={character} />
        </li>
      ))}
    </ul>
  ));
}

function StepButton({ onClick, disabled, children, primary = true }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        primary
          ? 'px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50'
          : 'px-4 py-2 rounded-lg border border-[var(--border)] hover:border-[var(--accent)]'
      }
    >
      {children}
    </button>
  );
}

export default function CharacterSheet() {
  const { id } = useParams();
  const { isGm } = useAuth();
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profils, setProfils] = useState([]);
  const [peuples, setPeuples] = useState([]);
  const [step, setStep] = useState(0);
  const [editMode, setEditMode] = useState(false);

  const [profilId, setProfilId] = useState(null);
  const [peupleId, setPeupleId] = useState(null);
  const [caracteristiques, setCaracteristiques] = useState(null);
  const [profilVoies, setProfilVoies] = useState([]);
  const [peupleVoie, setPeupleVoie] = useState(null);
  const [demiElfeChoices, setDemiElfeChoices] = useState(null);
  const [voieDuMage, setVoieDuMage] = useState(null);
  const [replaceWithMage, setReplaceWithMage] = useState(false);
  const [selectedVoieIds, setSelectedVoieIds] = useState([]);
  const [mageBonusVoieId, setMageBonusVoieId] = useState(null);
  const [hybridCreation, setHybridCreation] = useState(false);
  const [allProfilVoies, setAllProfilVoies] = useState([]);
  const [hybridPickId, setHybridPickId] = useState('');
  const [origineHumaine, setOrigineHumaine] = useState('');
  const [equipement, setEquipement] = useState('');
  const [saving, setSaving] = useState(false);
  const [armures, setArmures] = useState([]);
  const [armes, setArmes] = useState([]);
  const [expandedVoies, setExpandedVoies] = useState(new Set());

  useEffect(() => {
    Promise.all([getCharacter(id), getProfils(), getPeuples(), getArmures(), getArmes()])
      .then(([char, profilsData, peuplesData, armuresData, armesData]) => {
        setCharacter(char);
        setProfils(profilsData);
        setPeuples(peuplesData);
        setArmures(armuresData);
        setArmes(armesData);
        if (char.profil_id) setProfilId(char.profil_id);
        if (char.peuple_id) setPeupleId(char.peuple_id);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const profil = profils.find((p) => p.id === profilId);
  const peuple = peuples.find((p) => p.id === peupleId);

  const refreshCharacter = async () => {
    try {
      setCharacter(await getCharacter(id));
    } catch (e) {
      toast.error(e.message);
    }
  };

  useEffect(() => {
    if (character?.profil_id && character.pv_max > 0 && profilVoies.length === 0) {
      getVoies({ profil_id: character.profil_id, type: 'profil' })
        .then(setProfilVoies)
        .catch((e) => toast.error(e.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]);

  // --- Step 2→3: initialize caracteristiques from the série rapide once a profil is chosen ---
  const goToCaracteristiques = () => {
    const base = Object.fromEntries(CARACS.map((c) => [c, 0]));
    profil.caracteristiques_prioritaires.forEach((c, i) => {
      base[c] = [3, 2, 1][i] ?? 0;
    });
    setCaracteristiques(base);
    setStep(3);
  };

  const remainingCaracs = caracteristiques
    ? CARACS.filter((c) => !profil.caracteristiques_prioritaires.includes(c))
    : [];

  const assignBonus = (carac) => {
    setCaracteristiques((prev) => {
      const next = { ...prev };
      // clear any previous +1 among remaining caracs
      remainingCaracs.forEach((c) => { if (next[c] === 1) next[c] = 0; });
      next[carac] = 1;
      return next;
    });
  };

  const assignMalus = (carac) => {
    setCaracteristiques((prev) => {
      const next = { ...prev };
      remainingCaracs.forEach((c) => { if (next[c] === -1) next[c] = 0; });
      next[carac] = -1;
      return next;
    });
  };

  const applyPeupleAjustement = (bonusCarac, malusCarac) => {
    setCaracteristiques((prev) => {
      const next = { ...prev };
      if (bonusCarac) next[bonusCarac] = (next[bonusCarac] || 0) + 1;
      if (malusCarac) next[malusCarac] = (next[malusCarac] || 0) - 1;
      return next;
    });
    goToVoies();
  };

  const goToVoies = async () => {
    try {
      const [pv, peV] = await Promise.all([
        getVoies({ profil_id: profilId, type: 'profil' }),
        getVoies({ peuple_id: peupleId, type: 'peuple' }),
      ]);
      setProfilVoies(pv);

      if (peV.length > 0) {
        setPeupleVoie(peV[0]);
      } else if (peuple.code === 'demi-elfe') {
        // Le demi-elfe n'a pas de voie de peuple dédiée (p.46) : il choisit
        // entre celle de l'humain, de l'elfe haut ou de l'elfe sylvain.
        const allPeupleVoies = await getVoies({ type: 'peuple' });
        setDemiElfeChoices(
          allPeupleVoies.filter((v) => ['peuple-humain', 'peuple-elfe-haut', 'peuple-elfe-sylvain'].includes(v.code))
        );
      }

      if (profil.famille_code === 'mages') {
        const mageVoies = await getVoies({ type: 'mage' });
        if (mageVoies.length > 0) setVoieDuMage(mageVoies[0]);
      }

      // Only the GM can build a hybrid from level 1 (a deliberate exception to the normal
      // creation rules — a player's own creation always follows RAW: 2 voies from their profil).
      if (isGm) {
        const all = await getVoies({ type: 'profil' });
        setAllProfilVoies(all);
      }

      setStep(4);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const toggleVoie = (voieId) => {
    setSelectedVoieIds((prev) => {
      if (prev.includes(voieId)) return prev.filter((v) => v !== voieId);
      if (prev.length >= 2) return prev;
      return [...prev, voieId];
    });
  };

  const finalizeCreation = async () => {
    setSaving(true);
    try {
      await updateCharacter(id, {
        profil_id: profilId,
        peuple_id: peupleId,
        level: 1,
        caracteristiques,
        equipement: equipement.split(',').map((s) => s.trim()).filter(Boolean),
        ...(peupleVoie?.code === 'peuple-humain' ? { origine_humaine: origineHumaine.trim() } : {}),
      });

      const voiesToAdd = [
        ...selectedVoieIds.map((voieId) => ({ voieId, rangCap: null })),
        // Replacing the peuple voie with the voie du mage freezes it at rang 1 forever (p.60).
        ...(peupleVoie ? [{ voieId: peupleVoie.id, rangCap: replaceWithMage ? 1 : null }] : []),
        ...(replaceWithMage && voieDuMage ? [{ voieId: voieDuMage.id, rangCap: null }] : []),
      ];
      for (const { voieId, rangCap } of voiesToAdd) {
        const rang = voieId === mageBonusVoieId ? 2 : 1;
        await addCharacterVoie(id, {
          voie_id: voieId, obtained_at_level: 1, spend_points: false, rang, rang_cap: rangCap,
        });
      }

      setCharacter(await getCharacter(id));
      toast.success('Personnage créé !');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  // --- Finished sheet view ---
  if (character.profil_id && character.pv_max > 0) {
    // A voie added purely to lend one borrowed capacité (e.g. Augustin's Injonction, fetched
    // via his Gnome peuple capacité) carries nested_under_capacite_id and is rendered indented
    // under that capacité instead of as its own top-level accordion entry.
    const topLevelVoies = character.voies?.filter((v) => !v.nested_under_capacite_id) || [];
    const nestedVoiesByCapacite = {};
    for (const v of character.voies || []) {
      if (v.nested_under_capacite_id) {
        (nestedVoiesByCapacite[v.nested_under_capacite_id] ??= []).push(v);
      }
    }
    const allVoiesIds = topLevelVoies.map((v) => v.voie_id);
    const allExpanded = allVoiesIds.length > 0 && allVoiesIds.every((vid) => expandedVoies.has(vid));
    const toggleVoieExpanded = (voieId) => setExpandedVoies((prev) => {
      const next = new Set(prev);
      next.has(voieId) ? next.delete(voieId) : next.add(voieId);
      return next;
    });

    const facette = getFacette(character);
    // Voie de transition rang (Voie de transition = voie_id 139) gates the artefact's storage cap
    // (rang 4: +2×VOL instead of +VOL) and withdrawal precision (rang 3: choose the amount instead
    // of an all-or-nothing dump).
    const transitionRang = character.voies?.find((v) => v.voie_id === 139)?.rang || 0;
    const artefactMax = (character.pm_max || 0) + (character.caracteristiques?.VOL || 0) * (transitionRang >= 4 ? 2 : 1);
    const artefactCurrent = character.custom_data?.artefact_reserve_current || 0;
    // Draining himself into the artefact (rang 1) is the controlled half of the mechanic — he
    // bleeds mana out one point at a time to stay under the threshold on purpose.
    const handleArtefactStore = (delta) => {
      const nextReserve = Math.min(artefactMax, artefactCurrent + delta);
      const actualDelta = nextReserve - artefactCurrent;
      const nextPm = Math.max(0, character.pm_current - actualDelta);
      updateCharacter(id, { pm_current: nextPm, custom_data: { artefact_reserve_current: nextReserve } }).then(refreshCharacter);
    };
    // Recovering mana below rang 3 is uncontrolled: using the artefact dumps its ENTIRE reserve
    // back into him in one go, not a selectable amount — whatever doesn't fit under pm_max simply
    // vanishes (lost) rather than staying safely stored for a later attempt.
    const handleArtefactEmpty = () => {
      const nextPm = Math.min(character.pm_max, character.pm_current + artefactCurrent);
      updateCharacter(id, { pm_current: nextPm, custom_data: { artefact_reserve_current: 0 } }).then(refreshCharacter);
    };
    // From rang 3, he can pick the exact amount to withdraw (one point at a time) instead of an
    // all-or-nothing dump — no waste as long as he doesn't ask for more than fits under pm_max.
    const handleArtefactWithdraw = (delta) => {
      const actualDelta = Math.min(delta, artefactCurrent);
      const nextPm = Math.min(character.pm_max, character.pm_current + actualDelta);
      const nextReserve = artefactCurrent - actualDelta;
      updateCharacter(id, { pm_current: nextPm, custom_data: { artefact_reserve_current: nextReserve } }).then(refreshCharacter);
    };

    return (
      <div className="p-6 max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--accent)]">
              {character.name}
              {character.is_npc && <span className="ml-2 text-sm text-[var(--text-secondary)] font-normal">(PNJ)</span>}
            </h1>
            <p className="text-[var(--text-secondary)]">
              Niveau {character.level} — {profils.find((p) => p.id === character.profil_id)?.name} · {peuples.find((p) => p.id === character.peuple_id)?.name}
            </p>
            {character.origine_humaine && (
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Origine : {character.origine_humaine}</p>
            )}
          </div>
          {isGm && (
            <button
              onClick={() => setEditMode((v) => !v)}
              className={`shrink-0 px-3 py-1.5 rounded-lg border text-sm ${
                editMode ? 'border-[var(--accent)] bg-[var(--bg-input)] text-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--accent)]'
              }`}
            >
              {editMode ? 'Quitter le mode édition' : 'Mode édition'}
            </button>
          )}
        </div>

        {editMode ? (
          <GmEditPanel
            character={character}
            profils={profils}
            peuples={peuples}
            armures={armures}
            onArmuresChange={setArmures}
            armes={armes}
            onArmesChange={setArmes}
            onRefresh={refreshCharacter}
          />
        ) : (
        <>
        <Card className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <StatAdjuster
            label={`${STAT_EMOJI.PV} PV`} current={character.pv_current} max={character.pv_max}
            onChange={(v) => updateCharacter(id, { pv_current: v }).then(refreshCharacter)}
          />
          <StatAdjuster
            label={`${STAT_EMOJI.PM} PM`} current={character.pm_current} max={character.pm_max} koLabel={false}
            onChange={(v) => updateCharacter(id, { pm_current: v }).then(refreshCharacter)}
          />
          <StatAdjuster
            label={`${STAT_EMOJI.Chance} Chance`} current={character.points_chance_current} max={character.points_chance} koLabel={false}
            onChange={(v) => updateCharacter(id, { points_chance_current: v }).then(refreshCharacter)}
          />
          <StatAdjuster
            label={`${STAT_EMOJI.DR} DR`} current={character.dr_current} max={character.dr_max} koLabel={false}
            suffix={character.dr_die ? ` ${character.dr_die}` : ''}
            onChange={(v) => updateCharacter(id, { dr_current: v }).then(refreshCharacter)}
          />
          {[
            ['Défense', character.defense],
            ['Initiative', character.initiative],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-xs text-[var(--text-secondary)]">{STAT_EMOJI[label]} {label}</div>
              <div className="font-bold text-lg">{value}</div>
            </div>
          ))}
        </Card>

        {facette && (
          <Card className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <span className="text-xs text-[var(--text-secondary)]">Facette actuelle ({Math.round(facette.percent)}% PM, seuil {facette.threshold}%)</span>
              <div className="font-semibold">
                {facette.active === 'mage' ? '🌀 Mage fou' : '😌 Calme'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)]">🏺 Réserve de l'artéfact</span>
              {transitionRang >= 3 ? (
                <button
                  onClick={() => handleArtefactWithdraw(1)}
                  disabled={artefactCurrent <= 0 || character.pm_current >= character.pm_max}
                  title="Retirer 1 PM de l'artéfact (rang 3 : quantité choisie, pas de perte)"
                  className="w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-40"
                >
                  ←
                </button>
              ) : (
                <button
                  onClick={handleArtefactEmpty}
                  disabled={artefactCurrent <= 0}
                  title="Vider l'artéfact d'un coup (tout ce qui dépasse le PM max est perdu)"
                  className="px-2 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-40 text-xs"
                >
                  Vider ↩
                </button>
              )}
              <span className="font-semibold text-sm w-14 text-center">{artefactCurrent}/{artefactMax}</span>
              <button
                onClick={() => handleArtefactStore(1)}
                disabled={artefactCurrent >= artefactMax || character.pm_current <= 0}
                title="Stocker 1 PM dans l'artéfact"
                className="w-7 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-40"
              >
                →
              </button>
            </div>
          </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <Card>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold">Voies</h2>
                {allVoiesIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpandedVoies(allExpanded ? new Set() : new Set(allVoiesIds))}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)]"
                  >
                    {allExpanded ? 'Tout replier' : 'Tout déplier'}
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {topLevelVoies.map((v) => {
                  const isOpen = expandedVoies.has(v.voie_id);
                  const capCount = v.capacites?.length || 0;
                  const isInactiveFacette = facette?.inactiveVoieIds.includes(v.voie_id);
                  return (
                    <div
                      key={v.voie_id}
                      className={`rounded-lg border border-[var(--border)] overflow-hidden ${isInactiveFacette ? 'opacity-50' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleVoieExpanded(v.voie_id)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--bg-input)]"
                      >
                        <span className="font-medium text-sm">
                          {v.name} — rang {v.rang}
                          {v.rang_cap && v.rang >= v.rang_cap && (
                            <span className="ml-1 text-xs text-[var(--text-secondary)] font-normal">(figée)</span>
                          )}
                          {isInactiveFacette && (
                            <span className="ml-1 text-xs text-[var(--text-secondary)] font-normal">🔒 facette inactive</span>
                          )}
                        </span>
                        <span className="text-xs text-[var(--text-secondary)] shrink-0">
                          {capCount} capacité{capCount > 1 ? 's' : ''} {isOpen ? '▲' : '▼'}
                        </span>
                      </button>
                      {isOpen && (
                        <ul className="text-sm flex flex-col gap-1.5 px-3 pb-3">
                          {v.capacites?.map((c) => (
                            <li key={c.id}>
                              <span className="font-medium">
                                {c.name}
                                {c.est_sort && <span className="ml-1 text-xs text-[var(--accent)]">(sort)</span>}
                              </span>
                              <CapaciteSummary capacite={c} level={character.level} voieId={v.voie_id} character={character} />
                              <NestedCapacites
                                parentCapaciteId={c.id}
                                nestedVoiesByCapacite={nestedVoiesByCapacite}
                                level={character.level}
                                character={character}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            <LevelUpPanel character={character} profilVoies={profilVoies} profils={profils} onRefresh={refreshCharacter} />
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <h2 className="font-semibold mb-2">Caractéristiques</h2>
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                {CARACS.map((c) => (
                  <div key={c}>
                    <div className="text-[var(--text-secondary)]">{CARAC_EMOJI[c]} {c}</div>
                    <div className="font-bold">{character.caracteristiques[c] >= 0 ? '+' : ''}{character.caracteristiques[c]}</div>
                  </div>
                ))}
              </div>
            </Card>

            <ArmureSelector
              character={character}
              armures={armures}
              isGm={isGm}
              onArmuresChange={setArmures}
              onRefresh={refreshCharacter}
            />

            <ArmeSelector
              character={character}
              armes={armes}
              isGm={isGm}
              onArmesChange={setArmes}
              onRefresh={refreshCharacter}
            />
          </div>
        </div>
        </>
        )}
      </div>
    );
  }

  // --- Creation wizard ---
  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-[var(--accent)]">Créer {character.name}</h1>
      <p className="text-sm text-[var(--text-secondary)]">
        Étape {{ 0: 1, 1: 2, 3: 3, 4: 4, 5: 5 }[step]} / 5
      </p>

      {step === 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">1. Profil</h2>
          <div className="grid gap-2">
            {profils.map((p) => (
              <button
                key={p.id}
                onClick={() => setProfilId(p.id)}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  profilId === p.id ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'
                }`}
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {p.famille_name} — {p.caracteristiques_prioritaires.join(', ')}
                </div>
              </button>
            ))}
          </div>
          <StepButton onClick={() => setStep(1)} disabled={!profilId}>Suivant</StepButton>
        </Card>
      )}

      {step === 1 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">2. Peuple</h2>
          <div className="grid grid-cols-2 gap-2">
            {peuples.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeupleId(p.id)}
                className={`p-3 rounded-lg border ${
                  peupleId === p.id ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <StepButton onClick={() => setStep(0)} primary={false}>Retour</StepButton>
            <StepButton onClick={goToCaracteristiques} disabled={!peupleId}>Suivant</StepButton>
          </div>
        </Card>
      )}

      {step === 3 && caracteristiques && (
        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">3. Caractéristiques</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Série rapide : {profil.caracteristiques_prioritaires.join(' +3, ')} +3/+2/+1 déjà assignés.
            Choisissez le +1 et le -1 restants parmi les autres.
          </p>
          <div className="grid grid-cols-4 gap-2 text-center text-sm mb-2">
            {CARACS.map((c) => (
              <div key={c}>
                <div className="text-[var(--text-secondary)]">{CARAC_EMOJI[c]} {c}</div>
                <div className="font-bold">{caracteristiques[c] >= 0 ? '+' : ''}{caracteristiques[c]}</div>
              </div>
            ))}
          </div>
          <div>
            <p className="text-sm mb-1">+1 supplémentaire :</p>
            <div className="flex flex-wrap gap-2">
              {remainingCaracs.map((c) => (
                <button
                  key={c}
                  onClick={() => assignBonus(c)}
                  className={`px-2 py-1 rounded border text-sm ${caracteristiques[c] === 1 ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'}`}
                >
                  {CARAC_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm mb-1">-1 :</p>
            <div className="flex flex-wrap gap-2">
              {remainingCaracs.map((c) => (
                <button
                  key={c}
                  onClick={() => assignMalus(c)}
                  className={`px-2 py-1 rounded border text-sm ${caracteristiques[c] === -1 ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'}`}
                >
                  {CARAC_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {peuple?.ajustements && (
            <PeupleAjustement peuple={peuple} caracteristiques={caracteristiques} onConfirm={applyPeupleAjustement} />
          )}

          <StepButton onClick={() => setStep(1)} primary={false}>Retour</StepButton>
        </Card>
      )}

      {step === 4 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">4. Voies</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Choisissez 2 des 5 voies de {profil.name}{hybridCreation ? ', ou une voie hors profil ci-dessous' : ''}.
            {' '}Voie de peuple automatique : {peupleVoie?.name || '—'}.
          </p>

          {isGm && (
            <div className="border-b border-[var(--border)] pb-3 mb-1">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={hybridCreation}
                  onChange={(e) => setHybridCreation(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <strong>Personnage hybride dès la création</strong> — exception aux règles normales
                  (le perso est déjà formé à un autre art au niveau 1, ex. un guerrier-mage). Permet de
                  piocher une des 2 voies de départ dans un autre profil.
                </span>
              </label>

              {hybridCreation && (
                <>
                  <div className="mt-2 flex gap-2">
                    <select
                      value={hybridPickId}
                      onChange={(e) => setHybridPickId(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
                    >
                      <option value="">— choisir une voie hors profil —</option>
                      {profils.filter((p) => p.id !== profilId).map((op) => {
                        const voies = allProfilVoies.filter((v) => v.profil_id === op.id);
                        if (voies.length === 0) return null;
                        return (
                          <optgroup key={op.id} label={op.name}>
                            {voies.map((v) => (
                              <option key={v.id} value={v.id} disabled={selectedVoieIds.includes(v.id)}>
                                {v.name}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (!hybridPickId) return;
                        toggleVoie(Number(hybridPickId));
                        setHybridPickId('');
                      }}
                      disabled={!hybridPickId || selectedVoieIds.length >= 2}
                      className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-50"
                    >
                      Ajouter
                    </button>
                  </div>

                  {selectedVoieIds.filter((id) => !profilVoies.some((v) => v.id === id)).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedVoieIds.filter((id) => !profilVoies.some((v) => v.id === id)).map((id) => {
                        const v = allProfilVoies.find((av) => av.id === id);
                        return (
                          <span
                            key={id}
                            className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--accent)] bg-[var(--bg-input)] text-xs"
                          >
                            {v?.name} ({profils.find((p) => p.id === v?.profil_id)?.name})
                            <button
                              type="button"
                              onClick={() => toggleVoie(id)}
                              className="text-[var(--text-secondary)] hover:text-red-500"
                            >
                              ✕
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {demiElfeChoices && (
            <div className="border-b border-[var(--border)] pb-3 mb-1">
              <p className="text-sm mb-2">
                Le demi-elfe n'a pas de voie dédiée — choisissez celle de l'humain, de l'elfe haut ou de l'elfe sylvain :
              </p>
              <div className="flex flex-wrap gap-2">
                {demiElfeChoices.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setPeupleVoie(v)}
                    className={`px-2 py-1 rounded border text-sm ${peupleVoie?.id === v.id ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'}`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {peupleVoie?.code === 'peuple-humain' && (
            <div className="border-b border-[var(--border)] pb-3 mb-1">
              <p className="text-sm mb-2">
                Diversité — origine géographique ou sociale (+3 à deux domaines liés, +1 PC) :
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {HUMAN_ORIGINS.map((o) => (
                  <button
                    key={o}
                    onClick={() => setOrigineHumaine(o)}
                    className={`px-2 py-1 rounded border text-sm ${origineHumaine === o ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'}`}
                  >
                    {o}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Ou un gagne-pain personnalisé (ex: forgeron, scribe, pickpocket...)"
                value={HUMAN_ORIGINS.includes(origineHumaine) ? '' : origineHumaine}
                onChange={(e) => setOrigineHumaine(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
              />
            </div>
          )}

          {voieDuMage && peupleVoie && (
            <div className="border-b border-[var(--border)] pb-3 mb-1">
              <p className="text-sm mb-2">
                Remplacer la voie de peuple ({peupleVoie.name}) par la <strong>Voie du mage</strong> ? Vous
                conservez la capacité de rang 1 de la voie de peuple, mais elle ne progressera plus jamais.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setReplaceWithMage(false); setMageBonusVoieId(null); }}
                  className={`px-2 py-1 rounded border text-sm ${!replaceWithMage ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'}`}
                >
                  Non, garder {peupleVoie.name}
                </button>
                <button
                  onClick={() => { setReplaceWithMage(true); setMageBonusVoieId(null); }}
                  className={`px-2 py-1 rounded border text-sm ${replaceWithMage ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'}`}
                >
                  Oui, Voie du mage
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            {profilVoies.map((v) => (
              <button
                key={v.id}
                onClick={() => toggleVoie(v.id)}
                className={`text-left p-3 rounded-lg border ${
                  selectedVoieIds.includes(v.id) ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'
                }`}
              >
                <div className="font-medium">
                  {v.name}
                  {v.capacites[0]?.est_sort && (
                    <span className="ml-1 text-xs text-[var(--accent)]">(sort)</span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-secondary)] font-medium mt-1">
                  {v.capacites[0]?.name}
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {v.capacites[0]?.resume ? (
                    <span className="font-medium text-[var(--accent)]">{v.capacites[0].resume}</span>
                  ) : (
                    v.capacites[0]?.description
                  )}
                </div>
              </button>
            ))}
          </div>

          {profil.famille_code === 'mages' && selectedVoieIds.length === 2 && (
            <div className="border-t border-[var(--border)] pt-3">
              <p className="text-sm mb-2">
                Bonus mage : capacité de rang 2 gratuite dans l'une des deux voies choisies.
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedVoieIds.map((vid) => {
                  const v = profilVoies.find((pv) => pv.id === vid) || allProfilVoies.find((pv) => pv.id === vid);
                  return (
                    <button
                      key={vid}
                      onClick={() => setMageBonusVoieId(vid)}
                      className={`px-2 py-1 rounded border text-sm ${mageBonusVoieId === vid ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'}`}
                    >
                      {v?.name}
                    </button>
                  );
                })}
                {replaceWithMage && voieDuMage && (
                  <button
                    onClick={() => setMageBonusVoieId(voieDuMage.id)}
                    className={`px-2 py-1 rounded border text-sm ${mageBonusVoieId === voieDuMage.id ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'}`}
                  >
                    Voie du mage (Maîtrise de la magie)
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <StepButton onClick={() => setStep(3)} primary={false}>Retour</StepButton>
            <StepButton
              onClick={() => setStep(5)}
              disabled={
                selectedVoieIds.length !== 2 || (demiElfeChoices && !peupleVoie) ||
                (peupleVoie?.code === 'peuple-humain' && !origineHumaine.trim())
              }
            >
              Suivant
            </StepButton>
          </div>
        </Card>
      )}

      {step === 5 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">5. Équipement</h2>
          <textarea
            placeholder="Équipement, séparé par des virgules (ex: épée courte, sac d'aventurier, couverture...)"
            value={equipement}
            onChange={(e) => setEquipement(e.target.value)}
            rows={4}
            className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
          />
          <div className="flex gap-2">
            <StepButton onClick={() => setStep(4)} primary={false}>Retour</StepButton>
            <StepButton onClick={finalizeCreation} disabled={saving}>
              {saving ? 'Création...' : 'Terminer la création'}
            </StepButton>
          </div>
        </Card>
      )}
    </div>
  );
}

function PeupleAjustement({ peuple, caracteristiques, onConfirm }) {
  const [bonusChoice, setBonusChoice] = useState(null);
  const { bonus = [], malus = [] } = peuple.ajustements;

  const isPlusFaible = bonus[0] === 'plus_faible';
  const min = Math.min(...CARACS.map((c) => caracteristiques[c]));
  const bonusOptions = isPlusFaible ? CARACS.filter((c) => caracteristiques[c] === min) : bonus;

  const [malusChoice, setMalusChoice] = useState(null);

  return (
    <div className="border-t border-[var(--border)] pt-3">
      <p className="text-sm mb-1">Ajustement de peuple ({peuple.name}) :</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {bonusOptions.map((c) => (
          <button
            key={c}
            onClick={() => setBonusChoice(c)}
            className={`px-2 py-1 rounded border text-sm ${bonusChoice === c ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'}`}
          >
            +1 {CARAC_LABELS[c]}
          </button>
        ))}
      </div>
      {malus.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {malus.map((c) => (
            <button
              key={c}
              onClick={() => setMalusChoice(c)}
              className={`px-2 py-1 rounded border text-sm ${malusChoice === c ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'}`}
            >
              -1 {CARAC_LABELS[c]}
            </button>
          ))}
        </div>
      )}
      <StepButtonInline
        onClick={() => onConfirm(bonusChoice, malusChoice)}
        disabled={!bonusChoice || (malus.length > 0 && !malusChoice)}
      />
    </div>
  );
}

function StepButtonInline({ onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
    >
      Valider et choisir les voies
    </button>
  );
}

function LevelUpPanel({ character, profilVoies, profils, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const [customVoies, setCustomVoies] = useState([]);
  const [allProfilVoies, setAllProfilVoies] = useState([]);
  const [prestigeVoies, setPrestigeVoies] = useState([]);
  const [hybridSearch, setHybridSearch] = useState('');
  const [openHybridProfil, setOpenHybridProfil] = useState(null);
  const points = character.capacity_points_available;

  useEffect(() => {
    getVoies({ type: 'custom' }).then(setCustomVoies).catch(() => {});
    getVoies({ type: 'profil' }).then(setAllProfilVoies).catch(() => {});
    getVoies({ type: 'prestige' }).then(setPrestigeVoies).catch(() => {});
  }, []);

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
      await onRefresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Changement d'orientation (p.42-43) : ne peut jamais descendre sous rang 1 une voie
  // acquise gratuitement à la création — le reste peut toujours être oublié (rang le plus
  // haut uniquement, ce qui empêche les trous dans une voie).
  const forgets = character.forgets_available || 0;
  const forgettableVoies = (character.voies || []).filter((v) => !(v.obtained_at_level === 1 && v.rang <= 1));

  const forgetSection = forgets > 0 && (
    <Card className="flex flex-col gap-2 border-[var(--accent)]">
      <h2 className="font-semibold">
        Changement d'orientation — {forgets} disponible{forgets > 1 ? 's' : ''}
      </h2>
      <p className="text-xs text-[var(--text-secondary)]">
        Oublie le rang le plus haut d'une voie et récupère son coût en points de capacité.
      </p>
      {forgettableVoies.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {forgettableVoies.map((v) => (
            <button
              key={v.voie_id}
              onClick={() => run(() => forgetCharacterVoie(character.id, v.voie_id))}
              disabled={busy}
              className="px-2 py-1 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)] disabled:opacity-50"
            >
              Oublier {v.name} (rang {v.rang})
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">Aucune voie oubliable pour l'instant.</p>
      )}
    </Card>
  );

  if (points === 0) {
    return (
      <div className="flex flex-col gap-3">
        {forgetSection}
        <Card>
          <StepButton
            onClick={() => run(() => levelUpCharacter(character.id).then(() => toast.success('Niveau supérieur !')))}
            disabled={busy}
          >
            Passer au niveau {character.level + 1}
          </StepButton>
        </Card>
      </div>
    );
  }

  const ownedVoieIds = new Set((character.voies || []).map((v) => v.voie_id));
  const unownedProfilVoies = profilVoies.filter((v) => !ownedVoieIds.has(v.id));
  const unownedCustomVoies = customVoies.filter((v) => !ownedVoieIds.has(v.id));

  // Profil hybride (p.176) : autorisé tant qu'il reste au moins une des 5 voies du profil
  // principal jamais touchée. Le backend fait la vérification faisant foi ; ceci ne sert
  // qu'à décider si la section doit s'afficher.
  const ownProfilOwnedCount = (character.voies || []).filter((v) => profilVoies.some((pv) => pv.id === v.voie_id)).length;
  const hybridAllowed = ownProfilOwnedCount < 5;
  const hybridVoies = hybridAllowed
    ? allProfilVoies.filter((v) => !ownedVoieIds.has(v.id) && v.profil_id !== character.profil_id)
    : [];

  // Grouped by profil (collapsed accordion) when browsing, or flattened across all groups when
  // searching — with 13 profils x ~5 voies each, a flat list of every hybrid option at once is
  // unusable.
  const hybridByProfil = {};
  hybridVoies.forEach((v) => { (hybridByProfil[v.profil_id] ??= []).push(v); });
  const hybridProfilIds = Object.keys(hybridByProfil).map(Number).sort((a, b) =>
    (profils.find((p) => p.id === a)?.name || '').localeCompare(profils.find((p) => p.id === b)?.name || '')
  );
  const hybridSearchLower = hybridSearch.trim().toLowerCase();
  const hybridSearchResults = hybridSearchLower
    ? hybridVoies.filter((v) =>
        v.name.toLowerCase().includes(hybridSearchLower) ||
        (profils.find((p) => p.id === v.profil_id)?.name || '').toLowerCase().includes(hybridSearchLower)
      )
    : null;

  // Voie de prestige (p.39) : une seule par carrière, ouverte à partir de niveau_prestige_requis.
  const hasPrestigeVoie = (character.voies || []).some((v) => v.type === 'prestige');
  const eligiblePrestigeVoies = hasPrestigeVoie
    ? []
    : prestigeVoies.filter((v) => character.level >= v.niveau_prestige_requis);

  return (
    <div className="flex flex-col gap-3">
      {forgetSection}
      <Card className="flex flex-col gap-3 border-[var(--accent)]">
        <h2 className="font-semibold">
          {points} point{points > 1 ? 's' : ''} de capacité à dépenser
        </h2>

      <div>
        <p className="text-sm mb-1">Augmenter une voie déjà acquise :</p>
        <div className="flex flex-wrap gap-2">
          {(character.voies || []).filter((v) => !(v.rang_cap && v.rang >= v.rang_cap)).map((v) => (
            <button
              key={v.voie_id}
              onClick={() => run(() => raiseCharacterVoieRang(character.id, v.voie_id))}
              disabled={busy}
              className="px-2 py-1 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)] disabled:opacity-50"
            >
              {v.name} (rang {v.rang} → {v.rang + 1})
            </button>
          ))}
        </div>
      </div>

      {unownedProfilVoies.length > 0 && (
        <div>
          <p className="text-sm mb-1">Nouvelle voie de profil (rang 1, 1 point) :</p>
          <div className="flex flex-wrap gap-2">
            {unownedProfilVoies.map((v) => (
              <button
                key={v.id}
                onClick={() => run(() => addCharacterVoie(character.id, { voie_id: v.id, obtained_at_level: character.level }))}
                disabled={busy}
                className="px-2 py-1 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)] disabled:opacity-50"
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {unownedCustomVoies.length > 0 && (
        <div>
          <p className="text-sm mb-1">Voie personnalisée (homebrew, rang 1, 1 point) :</p>
          <div className="flex flex-wrap gap-2">
            {unownedCustomVoies.map((v) => (
              <button
                key={v.id}
                onClick={() => run(() => addCharacterVoie(character.id, { voie_id: v.id, obtained_at_level: character.level }))}
                disabled={busy}
                className="px-2 py-1 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)] disabled:opacity-50"
              >
                {v.name} ({v.origine_pj})
              </button>
            ))}
          </div>
        </div>
      )}

      {hybridVoies.length > 0 && (
        <div>
          <p className="text-sm mb-1">
            Profil hybride — voie hors profil principal (rang 1, 1 point) :
          </p>
          <input
            type="text"
            placeholder="Rechercher une voie ou un profil..."
            value={hybridSearch}
            onChange={(e) => setHybridSearch(e.target.value)}
            className="w-full mb-2 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
          />
          {hybridSearchResults ? (
            hybridSearchResults.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)]">Aucun résultat.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {hybridSearchResults.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => run(() => addCharacterVoie(character.id, { voie_id: v.id, obtained_at_level: character.level }))}
                    disabled={busy}
                    className="px-2 py-1 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)] disabled:opacity-50"
                  >
                    {v.name} ({profils.find((p) => p.id === v.profil_id)?.name})
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-col gap-1">
              {hybridProfilIds.map((pid) => {
                const items = hybridByProfil[pid];
                const isOpen = openHybridProfil === pid;
                return (
                  <div key={pid} className="rounded-lg border border-[var(--border)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenHybridProfil(isOpen ? null : pid)}
                      className="w-full flex items-center justify-between px-2 py-1.5 text-sm text-left hover:bg-[var(--bg-input)]"
                    >
                      <span>{profils.find((p) => p.id === pid)?.name}</span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {items.length} voie{items.length > 1 ? 's' : ''} {isOpen ? '▲' : '▼'}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="flex flex-wrap gap-2 p-2 pt-0">
                        {items.map((v) => (
                          <button
                            key={v.id}
                            onClick={() => run(() => addCharacterVoie(character.id, { voie_id: v.id, obtained_at_level: character.level }))}
                            disabled={busy}
                            className="px-2 py-1 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)] disabled:opacity-50"
                          >
                            {v.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {eligiblePrestigeVoies.length > 0 && (
        <div>
          <p className="text-sm mb-1">Voie de prestige — une seule par carrière (rang 4, 2 points) :</p>
          <div className="flex flex-wrap gap-2">
            {eligiblePrestigeVoies.map((v) => (
              <button
                key={v.id}
                onClick={() => run(() => addCharacterVoie(character.id, { voie_id: v.id, obtained_at_level: character.level }))}
                disabled={busy}
                className="px-2 py-1 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)] disabled:opacity-50"
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-sm mb-1">Point orphelin (si aucune capacité n'est accessible) :</p>
        <div className="flex flex-wrap gap-2">
          {[
            ['pc', '+1 Chance'], ['dr', '+1 Récupération'], ['pv', '+2 PV'], ['pm', '+2 PM'],
          ].map(([choice, label]) => (
            <button
              key={choice}
              onClick={() => run(() => orphanExchange(character.id, choice))}
              disabled={busy}
              className="px-2 py-1 rounded border border-[var(--border)] text-sm hover:border-[var(--accent)] disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      </Card>
    </div>
  );
}

function GmEditPanel({ character, profils, peuples, armures, onArmuresChange, armes, onArmesChange, onRefresh }) {
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [allVoies, setAllVoies] = useState([]);
  const [addVoieId, setAddVoieId] = useState('');
  const [addVoieRang, setAddVoieRang] = useState(1);
  // Borrow-a-single-capacité mode (e.g. Gnome's "Don étrange" fetching one ensorceleur rang-1
  // capacité) — when a capacité is picked, only it is kept from the voie and it's rendered
  // nested under whichever of the character's own capacités granted the pick.
  const [addVoieOnlyCapId, setAddVoieOnlyCapId] = useState('');
  const [addVoieNestUnderId, setAddVoieNestUnderId] = useState('');

  const [form, setForm] = useState({
    profil_id: character.profil_id,
    peuple_id: character.peuple_id,
    level: character.level,
    caracteristiques: { ...character.caracteristiques },
    capacity_points_available: character.capacity_points_available,
    forgets_available: character.forgets_available,
    pv_body_total: character.pv_body_total,
    pc_bonus_orphan: character.pc_bonus_orphan,
    dr_bonus_orphan: character.dr_bonus_orphan,
    pm_bonus_orphan: character.pm_bonus_orphan,
    origine_humaine: character.origine_humaine || '',
    // Augustin Moëdec's facette threshold (% of PM current/max) — see getFacette() and
    // FACETTE_VOIE_GROUPS above. Empty for every other character; blank here disables it.
    facette_threshold_percent: character.custom_data?.threshold_percent ?? '',
  });

  useEffect(() => {
    getVoies({}).then(setAllVoies).catch(() => {});
  }, []);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setCarac = (c, value) => setForm((prev) => ({ ...prev, caracteristiques: { ...prev.caracteristiques, [c]: value } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { facette_threshold_percent, ...rest } = form;
      await updateCharacter(character.id, {
        ...rest,
        custom_data: { threshold_percent: facette_threshold_percent === '' ? null : Number(facette_threshold_percent) },
      });
      await onRefresh();
      toast.success('Fiche mise à jour');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const changeVoieRang = async (voieId, rang) => {
    setBusy(true);
    try {
      await setCharacterVoieRang(character.id, voieId, rang);
      await onRefresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAddVoie = async () => {
    if (!addVoieId) return;
    setBusy(true);
    try {
      await addCharacterVoie(character.id, {
        voie_id: Number(addVoieId),
        obtained_at_level: character.level,
        spend_points: false,
        rang: Number(addVoieRang) || 1,
        only_capacite_id: addVoieOnlyCapId ? Number(addVoieOnlyCapId) : null,
        nested_under_capacite_id: addVoieNestUnderId ? Number(addVoieNestUnderId) : null,
      });
      await onRefresh();
      setAddVoieId('');
      setAddVoieRang(1);
      setAddVoieOnlyCapId('');
      setAddVoieNestUnderId('');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const ownedVoieIds = new Set((character.voies || []).map((v) => v.voie_id));
  const availableVoies = allVoies.filter((v) => !ownedVoieIds.has(v.id));
  const addVoieCapacites = allVoies.find((v) => v.id === Number(addVoieId))?.capacites || [];
  const ownCapacites = (character.voies || []).flatMap((v) => v.capacites || []);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 border-[var(--accent)]">
        <h2 className="font-semibold">Édition MJ — contrôle total</h2>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm flex flex-col gap-1">
            Profil
            <select
              value={form.profil_id || ''}
              onChange={(e) => setField('profil_id', Number(e.target.value))}
              className="px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
            >
              {profils.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm flex flex-col gap-1">
            Peuple
            <select
              value={form.peuple_id || ''}
              onChange={(e) => setField('peuple_id', Number(e.target.value))}
              className="px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
            >
              {peuples.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm flex flex-col gap-1">
            Niveau
            <input
              type="number"
              value={form.level}
              onChange={(e) => setField('level', Number(e.target.value))}
              className="px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
            />
          </label>
        </div>

        <div>
          <p className="text-sm mb-1">Caractéristiques</p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {CARACS.map((c) => (
              <label key={c} className="text-xs flex flex-col items-center gap-1">
                {CARAC_EMOJI[c]} {c}
                <input
                  type="number"
                  value={form.caracteristiques[c]}
                  onChange={(e) => setCarac(c, Number(e.target.value))}
                  className="w-14 px-1 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)] text-center"
                />
              </label>
            ))}
          </div>
        </div>

        {peuples.find((p) => p.id === form.peuple_id)?.code === 'humain' && (
          <label className="text-sm flex flex-col gap-1">
            Origine (Diversité, +1 PC déjà inclus dans le calcul)
            <input
              type="text"
              value={form.origine_humaine}
              onChange={(e) => setField('origine_humaine', e.target.value)}
              placeholder="ex: Citadin (commerce, résistance aux maladies)"
              className="px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
            />
          </label>
        )}

        <label className="text-sm flex flex-col gap-1">
          Seuil de facette (% PM courant/max — vide = mécanisme désactivé)
          <input
            type="number"
            min="0"
            max="100"
            value={form.facette_threshold_percent}
            onChange={(e) => setField('facette_threshold_percent', e.target.value)}
            placeholder="ex: 60"
            className="w-24 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
          />
        </label>

        <div>
          <p className="text-sm mb-1">Grand livre / ressources brutes</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              ['capacity_points_available', 'Points de capacité'],
              ['forgets_available', "Jetons d'oubli"],
              ['pv_body_total', 'PV corps (grand livre)'],
              ['pc_bonus_orphan', 'Bonus PC orphelin'],
              ['dr_bonus_orphan', 'Bonus DR orphelin'],
              ['pm_bonus_orphan', 'Bonus PM orphelin'],
            ].map(([key, label]) => (
              <label key={key} className="text-xs flex flex-col gap-1">
                {label}
                <input
                  type="number"
                  value={form[key]}
                  onChange={(e) => setField(key, Number(e.target.value))}
                  className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)]"
                />
              </label>
            ))}
          </div>
        </div>

        <StepButton onClick={handleSave} disabled={saving}>
          {saving ? 'Sauvegarde...' : 'Sauvegarder les champs ci-dessus'}
        </StepButton>
      </Card>

      <ArmureSelector character={character} armures={armures} isGm onArmuresChange={onArmuresChange} onRefresh={onRefresh} />

      <ArmeSelector character={character} armes={armes} isGm onArmesChange={onArmesChange} onRefresh={onRefresh} />

      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Voies possédées</h2>
        {(character.voies || []).length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">Aucune voie.</p>
        )}
        <div className="flex flex-col gap-2">
          {(character.voies || []).map((v) => (
            <div key={v.voie_id} className="flex items-center justify-between gap-2 text-sm">
              <span>{v.name}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  defaultValue={v.rang}
                  min={0}
                  onBlur={(e) => {
                    const rang = Number(e.target.value);
                    if (rang !== v.rang) changeVoieRang(v.voie_id, rang);
                  }}
                  disabled={busy}
                  className="w-16 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)] text-center"
                />
                <button
                  onClick={() => changeVoieRang(v.voie_id, 0)}
                  disabled={busy}
                  className="px-2 py-1 rounded border border-[var(--border)] text-xs hover:border-red-500 disabled:opacity-50"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="font-semibold">Ajouter une voie (sans restriction)</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={addVoieId}
            onChange={(e) => setAddVoieId(e.target.value)}
            className="flex-1 min-w-[200px] px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
          >
            <option value="">— choisir une voie —</option>
            {availableVoies.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.type}{v.profil_id ? ' · ' + (profils.find((p) => p.id === v.profil_id)?.name || '') : ''})
              </option>
            ))}
          </select>
          <input
            type="number"
            value={addVoieRang}
            min={1}
            onChange={(e) => setAddVoieRang(e.target.value)}
            className="w-20 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-center"
          />
          <StepButton onClick={handleAddVoie} disabled={busy || !addVoieId}>Ajouter</StepButton>
        </div>
        {addVoieId && (
          <div className="flex flex-wrap gap-2 items-center pt-1 border-t border-[var(--border)] mt-1">
            <label className="text-xs text-[var(--text-secondary)] flex flex-col gap-1">
              Ne garder qu'une capacité (ex: un choix de rang 1 d'ailleurs)
              <select
                value={addVoieOnlyCapId}
                onChange={(e) => setAddVoieOnlyCapId(e.target.value)}
                className="min-w-[220px] px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
              >
                <option value="">— toute la voie —</option>
                {addVoieCapacites.map((c) => (
                  <option key={c.id} value={c.id}>Rang {c.rang} — {c.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--text-secondary)] flex flex-col gap-1">
              Imbriquer sous (affichage uniquement)
              <select
                value={addVoieNestUnderId}
                onChange={(e) => setAddVoieNestUnderId(e.target.value)}
                className="min-w-[220px] px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
              >
                <option value="">— entrée normale, pas imbriquée —</option>
                {ownCapacites.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </Card>
    </div>
  );
}

function armureOptionLabel(a) {
  const bits = [`${a.defense_bonus >= 0 ? '+' : ''}${a.defense_bonus} DEF`];
  if (a.agi_max != null) bits.push(`AGI max +${a.agi_max}`);
  if (a.prix) bits.push(a.prix);
  return `${a.name} (${bits.join(', ')})`;
}

// Armor and shield stack (p.188) — a character can equip one of each, both folded into
// character.defense by the backend recompute. Anyone with access to the character (owner or
// GM) can (un)equip either slot; only the GM curates the shared library itself (add/remove
// entries) — the list is seeded from the rulebook's own armor table (p.188), not guessed.
function ArmureSelector({ character, armures, isGm, onArmuresChange, onRefresh }) {
  const [showManage, setShowManage] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('armure');
  const [newBonus, setNewBonus] = useState(1);
  const [newAgiMax, setNewAgiMax] = useState('');
  const [newPrix, setNewPrix] = useState('');
  const [busy, setBusy] = useState(false);

  const armorOptions = armures.filter((a) => a.type !== 'bouclier');
  const shieldOptions = armures.filter((a) => a.type === 'bouclier');
  const currentArmure = armures.find((a) => a.id === character.armure_id);
  const currentBouclier = armures.find((a) => a.id === character.bouclier_id);
  const totalBonus = (currentArmure?.defense_bonus || 0) + (currentBouclier?.defense_bonus || 0);

  const handleSelect = async (field, value) => {
    setBusy(true);
    try {
      await updateCharacter(character.id, { [field]: value ? Number(value) : null });
      await onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const created = await createArmure({
        name: newName.trim(),
        type: newType,
        defense_bonus: Number(newBonus) || 0,
        agi_max: newAgiMax !== '' ? Number(newAgiMax) : null,
        prix: newPrix.trim() || null,
      });
      onArmuresChange([...armures, created]);
      setNewName('');
      setNewBonus(1);
      setNewAgiMax('');
      setNewPrix('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (armureId) => {
    setBusy(true);
    try {
      await deleteArmure(armureId);
      onArmuresChange(armures.filter((a) => a.id !== armureId));
      if (character.armure_id === armureId || character.bouclier_id === armureId) await onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">Armure &amp; bouclier</h2>
        {isGm && (
          <button
            type="button"
            onClick={() => setShowManage((v) => !v)}
            className="px-2 py-1 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)] whitespace-nowrap"
          >
            Gérer
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm flex flex-col gap-1">
          Armure
          <select
            value={character.armure_id || ''}
            onChange={(e) => handleSelect('armure_id', e.target.value)}
            disabled={busy}
            className="px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
          >
            <option value="">Aucune</option>
            {armorOptions.map((a) => (
              <option key={a.id} value={a.id}>{armureOptionLabel(a)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm flex flex-col gap-1">
          Bouclier
          <select
            value={character.bouclier_id || ''}
            onChange={(e) => handleSelect('bouclier_id', e.target.value)}
            disabled={busy}
            className="px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
          >
            <option value="">Aucun</option>
            {shieldOptions.map((a) => (
              <option key={a.id} value={a.id}>{armureOptionLabel(a)}</option>
            ))}
          </select>
        </label>
      </div>

      {(currentArmure || currentBouclier) && (
        <p className="text-xs text-[var(--text-secondary)] mt-2">
          Bonus total : {totalBonus >= 0 ? '+' : ''}{totalBonus} DEF (déjà inclus dans la Défense ci-dessus)
        </p>
      )}

      {isGm && showManage && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Nom (ex: Armure de cuir)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 min-w-[140px] px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
            >
              <option value="armure">Armure</option>
              <option value="bouclier">Bouclier</option>
            </select>
            <input
              type="number"
              value={newBonus}
              onChange={(e) => setNewBonus(e.target.value)}
              title="Bonus DEF"
              className="w-16 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm text-center"
            />
            <input
              type="number"
              placeholder="AGI max"
              value={newAgiMax}
              onChange={(e) => setNewAgiMax(e.target.value)}
              className="w-20 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm text-center"
            />
            <input
              type="text"
              placeholder="Prix (ex: 15 pa)"
              value={newPrix}
              onChange={(e) => setNewPrix(e.target.value)}
              className="w-24 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={busy || !newName.trim()}
              className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>

          {armures.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {armures.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--border)] text-xs"
                >
                  {a.type === 'bouclier' ? '🛡️' : '🧥'} {armureOptionLabel(a)}
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
                    className="text-[var(--text-secondary)] hover:text-red-500"
                    title="Supprimer de la bibliothèque"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function armeOptionLabel(a) {
  const bits = [a.damage_dice];
  if (a.type_degats) bits.push(a.type_degats);
  if (a.portee != null) bits.push(`portée ${a.portee} m`);
  if (a.prix) bits.push(a.prix);
  return `${a.name} (${bits.join(', ')})`;
}

// Nothing here feeds a computed stat — damage is rolled live at the table, so this just
// displays the equipped weapon's dice + FOR (for a contact weapon that isn't the rare
// for_applies=false exception, e.g. Stylet) alongside the character's own attack values
// (computed server-side but never shown anywhere on the sheet before this).
function armeDamageDisplay(arme, character) {
  if (!arme) return null;
  if (arme.category === 'contact' && arme.for_applies) {
    const forVal = character.caracteristiques.FOR;
    return `${arme.damage_dice} ${forVal >= 0 ? '+' : ''}${forVal} (FOR)`;
  }
  return arme.damage_dice;
}

// A character can wield up to two weapons (principale/secondaire — dual-wielding etc.,
// unenforced) from the shared library (p.182-184). Anyone with access (owner or GM) can
// (un)equip either slot; only the GM curates the library itself.
function ArmeSelector({ character, armes, isGm, onArmesChange, onRefresh }) {
  const [showManage, setShowManage] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('contact');
  const [newDice, setNewDice] = useState('');
  const [newTypeDegats, setNewTypeDegats] = useState('');
  const [newPortee, setNewPortee] = useState('');
  const [newPrix, setNewPrix] = useState('');
  const [newForApplies, setNewForApplies] = useState(true);
  const [newNotes, setNewNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const principale = armes.find((a) => a.id === character.arme_principale_id);
  const secondaire = armes.find((a) => a.id === character.arme_secondaire_id);
  const va = character.valeurs_attaque || {};

  const handleSelect = async (field, value) => {
    setBusy(true);
    try {
      await updateCharacter(character.id, { [field]: value ? Number(value) : null });
      await onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newDice.trim()) return;
    setBusy(true);
    try {
      const created = await createArme({
        name: newName.trim(),
        category: newCategory,
        damage_dice: newDice.trim(),
        type_degats: newTypeDegats.trim() || null,
        portee: newPortee !== '' ? Number(newPortee) : null,
        prix: newPrix.trim() || null,
        for_applies: newForApplies,
        notes: newNotes.trim() || null,
      });
      onArmesChange([...armes, created]);
      setNewName('');
      setNewDice('');
      setNewTypeDegats('');
      setNewPortee('');
      setNewPrix('');
      setNewForApplies(true);
      setNewNotes('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (armeId) => {
    setBusy(true);
    try {
      await deleteArme(armeId);
      onArmesChange(armes.filter((a) => a.id !== armeId));
      if (character.arme_principale_id === armeId || character.arme_secondaire_id === armeId) await onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">Armes</h2>
        {isGm && (
          <button
            type="button"
            onClick={() => setShowManage((v) => !v)}
            className="px-2 py-1 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)] whitespace-nowrap"
          >
            Gérer
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm flex flex-col gap-1">
          Arme principale
          <select
            value={character.arme_principale_id || ''}
            onChange={(e) => handleSelect('arme_principale_id', e.target.value)}
            disabled={busy}
            className="px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
          >
            <option value="">Aucune</option>
            <optgroup label="Contact">
              {armes.filter((a) => a.category === 'contact').map((a) => (
                <option key={a.id} value={a.id}>{armeOptionLabel(a)}</option>
              ))}
            </optgroup>
            <optgroup label="Distance">
              {armes.filter((a) => a.category === 'distance').map((a) => (
                <option key={a.id} value={a.id}>{armeOptionLabel(a)}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="text-sm flex flex-col gap-1">
          Arme secondaire
          <select
            value={character.arme_secondaire_id || ''}
            onChange={(e) => handleSelect('arme_secondaire_id', e.target.value)}
            disabled={busy}
            className="px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
          >
            <option value="">Aucune</option>
            <optgroup label="Contact">
              {armes.filter((a) => a.category === 'contact').map((a) => (
                <option key={a.id} value={a.id}>{armeOptionLabel(a)}</option>
              ))}
            </optgroup>
            <optgroup label="Distance">
              {armes.filter((a) => a.category === 'distance').map((a) => (
                <option key={a.id} value={a.id}>{armeOptionLabel(a)}</option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      {(principale || secondaire) && (
        <div className="mt-2 flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
          {principale && (
            <p>
              <strong>{principale.name}</strong> — Dégâts : {armeDamageDisplay(principale, character)}
              {principale.notes && <span> ({principale.notes})</span>}
            </p>
          )}
          {secondaire && (
            <p>
              <strong>{secondaire.name}</strong> — Dégâts : {armeDamageDisplay(secondaire, character)}
              {secondaire.notes && <span> ({secondaire.notes})</span>}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-4 text-sm mt-3 pt-3 border-t border-[var(--border)]">
        <span>Attaque contact <strong>{va.contact}</strong></span>
        <span>Attaque distance <strong>{va.distance}</strong></span>
        <span>Attaque magique <strong>{va.magique}</strong></span>
      </div>

      {isGm && showManage && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Nom (ex: Épée longue)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 min-w-[140px] px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
            >
              <option value="contact">Contact</option>
              <option value="distance">Distance</option>
            </select>
            <input
              type="text"
              placeholder="Dé (ex: 1d8)"
              value={newDice}
              onChange={(e) => setNewDice(e.target.value)}
              className="w-24 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
            />
            <input
              type="text"
              placeholder="Type DM"
              value={newTypeDegats}
              onChange={(e) => setNewTypeDegats(e.target.value)}
              className="w-28 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
            />
            <input
              type="number"
              placeholder="Portée (m)"
              value={newPortee}
              onChange={(e) => setNewPortee(e.target.value)}
              className="w-24 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
            />
            <input
              type="text"
              placeholder="Prix (ex: 6 pa)"
              value={newPrix}
              onChange={(e) => setNewPrix(e.target.value)}
              className="w-24 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
            />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={newForApplies} onChange={(e) => setNewForApplies(e.target.checked)} />
              +FOR aux DM
            </label>
            <input
              type="text"
              placeholder="Notes"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="flex-1 min-w-[140px] px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={busy || !newName.trim() || !newDice.trim()}
              className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>

          {armes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {armes.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--border)] text-xs"
                >
                  {a.category === 'distance' ? '🏹' : '⚔️'} {armeOptionLabel(a)}
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
                    className="text-[var(--text-secondary)] hover:text-red-500"
                    title="Supprimer de la bibliothèque"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// Same health-tier coloring as the board HUD (green >=60%, amber 30-60%, red <30%, full red +
// "K.O." at 0) so a GM scanning the sheet gets the same at-a-glance read as on the live board.
// max===0 (e.g. PM for a non-caster) is a different case entirely — no resource pool at all,
// not "depleted" — so it never gets the K.O. treatment, just a plain 0/0.
function statBarColor(current, max) {
  if (max <= 0) return 'bg-[var(--border)]';
  if (current <= 0) return 'bg-red-500';
  const pct = (current / max) * 100;
  if (pct >= 60) return 'bg-emerald-500';
  if (pct >= 30) return 'bg-amber-500';
  return 'bg-red-400';
}

// koLabel controls whether hitting 0 reads as "K.O." (down/unconscious) — true for PV, false
// for PM: running out of mana just means no more spells, it doesn't knock anyone out. Both
// still get the same empty-red bar, only the wording differs.
function StatAdjuster({ label, current, max, onChange, koLabel = true, suffix = '' }) {
  const [busy, setBusy] = useState(false);
  const isEmpty = max > 0 && current <= 0;
  const isDown = isEmpty && koLabel;

  const adjust = async (delta) => {
    const next = Math.max(0, Math.min(max, current + delta));
    if (next === current) return;
    setBusy(true);
    try {
      await onChange(next);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;

  return (
    <div>
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => adjust(-1)}
          disabled={busy || current <= 0}
          className="w-6 h-6 rounded-full border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-30 leading-none"
        >
          −
        </button>
        <span className={`font-bold text-lg ${suffix ? 'w-20' : 'w-14'} ${isDown ? 'text-red-500' : ''}`}>
          {isDown ? 'K.O.' : `${current}/${max}${suffix}`}
        </span>
        <button
          onClick={() => adjust(1)}
          disabled={busy || current >= max}
          className="w-6 h-6 rounded-full border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-30 leading-none"
        >
          +
        </button>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-[var(--bg-input)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${statBarColor(current, max)}`}
          style={{ width: `${isDown ? 100 : pct}%` }}
        />
      </div>
    </div>
  );
}
