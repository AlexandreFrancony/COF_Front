import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
  getCharacter, getProfils, getPeuples, getVoies,
  updateCharacter, addCharacterVoie, raiseCharacterVoieRang, setCharacterVoieRang, forgetCharacterVoie,
  levelUpCharacter, orphanExchange, getArmures, createArmure, deleteArmure,
} from '../utils/api';

const CARACS = ['AGI', 'CON', 'FOR', 'PER', 'CHA', 'INT', 'VOL'];
const CARAC_LABELS = {
  AGI: 'Agilité', CON: 'Constitution', FOR: 'Force', PER: 'Perception',
  CHA: 'Charisme', INT: 'Intelligence', VOL: 'Volonté',
};

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

// Dés évolutifs (d4°) : d4 aux niveaux 1-5, puis +1 cran tous les 3 niveaux à partir de 6 (p.43).
const DICE_PROGRESSION = ['d4', 'd6', 'd8', 'd10', 'd12'];
function evolvingDieForLevel(level) {
  if (level < 6) return DICE_PROGRESSION[0];
  return DICE_PROGRESSION[Math.min(4, 1 + Math.floor((level - 6) / 3))];
}
function resolveEvolvingDice(text, level) {
  if (!text) return text;
  const die = evolvingDieForLevel(level);
  return text.replace(/d4°/g, die);
}

function Card({ children, className = '' }) {
  return (
    <div className={`p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] ${className}`}>
      {children}
    </div>
  );
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

  useEffect(() => {
    Promise.all([getCharacter(id), getProfils(), getPeuples(), getArmures()])
      .then(([char, profilsData, peuplesData, armuresData]) => {
        setCharacter(char);
        setProfils(profilsData);
        setPeuples(peuplesData);
        setArmures(armuresData);
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
    return (
      <div className="p-6 max-w-2xl mx-auto flex flex-col gap-4">
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
            onRefresh={refreshCharacter}
          />
        ) : (
        <>
        <Card className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <StatAdjuster
            label="PV" current={character.pv_current} max={character.pv_max}
            onChange={(v) => updateCharacter(id, { pv_current: v }).then(refreshCharacter)}
          />
          <StatAdjuster
            label="PM" current={character.pm_current} max={character.pm_max}
            onChange={(v) => updateCharacter(id, { pm_current: v }).then(refreshCharacter)}
          />
          {[
            ['Chance', character.points_chance],
            ['DR', character.de_recuperation],
            ['Défense', character.defense],
            ['Initiative', character.initiative],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-xs text-[var(--text-secondary)]">{label}</div>
              <div className="font-bold text-lg">{value}</div>
            </div>
          ))}
        </Card>

        <Card>
          <h2 className="font-semibold mb-2">Caractéristiques</h2>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center text-sm">
            {CARACS.map((c) => (
              <div key={c}>
                <div className="text-[var(--text-secondary)]">{c}</div>
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

        <Card>
          <h2 className="font-semibold mb-2">Voies</h2>
          <div className="flex flex-col gap-4">
            {character.voies?.map((v) => (
              <div key={v.voie_id}>
                <div className="font-medium text-sm">
                  {v.name} — rang {v.rang}
                  {v.rang_cap && v.rang >= v.rang_cap && (
                    <span className="ml-1 text-xs text-[var(--text-secondary)]">(figée)</span>
                  )}
                </div>
                <ul className="text-sm flex flex-col gap-1.5 mt-1">
                  {v.capacites?.map((c) => (
                    <li key={c.id}>
                      <span className="font-medium">
                        {c.name}
                        {c.est_sort && <span className="ml-1 text-xs text-[var(--accent)]">(sort)</span>}
                      </span>
                      <span className="text-[var(--text-secondary)]">
                        {' '}— {resolveEvolvingDice(c.description, character.level)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <LevelUpPanel character={character} profilVoies={profilVoies} profils={profils} onRefresh={refreshCharacter} />
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
                <div className="text-[var(--text-secondary)]">{c}</div>
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
                  {v.capacites[0]?.description}
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
          <div className="flex flex-wrap gap-2">
            {hybridVoies.map((v) => (
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

function GmEditPanel({ character, profils, peuples, armures, onArmuresChange, onRefresh }) {
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [allVoies, setAllVoies] = useState([]);
  const [addVoieId, setAddVoieId] = useState('');
  const [addVoieRang, setAddVoieRang] = useState(1);

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
  });

  useEffect(() => {
    getVoies({}).then(setAllVoies).catch(() => {});
  }, []);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setCarac = (c, value) => setForm((prev) => ({ ...prev, caracteristiques: { ...prev.caracteristiques, [c]: value } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCharacter(character.id, form);
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
      });
      await onRefresh();
      setAddVoieId('');
      setAddVoieRang(1);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const ownedVoieIds = new Set((character.voies || []).map((v) => v.voie_id));
  const availableVoies = allVoies.filter((v) => !ownedVoieIds.has(v.id));

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
                {c}
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
      </Card>
    </div>
  );
}

// Equipped armor gives a flat DEF bonus (already folded into character.defense by the backend
// recompute) — anyone with access to the character (owner or GM) can (un)equip; only the GM
// curates the shared library itself (add/remove entries), since exact COF2 armor stats live in
// the rulebook, not something the app hardcodes.
function ArmureSelector({ character, armures, isGm, onArmuresChange, onRefresh }) {
  const [showManage, setShowManage] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBonus, setNewBonus] = useState(1);
  const [busy, setBusy] = useState(false);

  const current = armures.find((a) => a.id === character.armure_id);

  const handleSelect = async (e) => {
    const value = e.target.value;
    setBusy(true);
    try {
      await updateCharacter(character.id, { armure_id: value ? Number(value) : null });
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
      const created = await createArmure({ name: newName.trim(), defense_bonus: Number(newBonus) || 0 });
      onArmuresChange([...armures, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      setNewBonus(1);
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
      if (character.armure_id === armureId) await onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="font-semibold mb-2">Armure</h2>
      <div className="flex items-center gap-2">
        <select
          value={character.armure_id || ''}
          onChange={handleSelect}
          disabled={busy}
          className="flex-1 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
        >
          <option value="">Aucune</option>
          {armures.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.defense_bonus >= 0 ? '+' : ''}{a.defense_bonus} DEF)
            </option>
          ))}
        </select>
        {isGm && (
          <button
            type="button"
            onClick={() => setShowManage((v) => !v)}
            className="px-2 py-1.5 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)] whitespace-nowrap"
          >
            Gérer
          </button>
        )}
      </div>

      {current && (
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          Bonus actuel : {current.defense_bonus >= 0 ? '+' : ''}{current.defense_bonus} DEF (déjà inclus dans la Défense ci-dessus)
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
              className="flex-1 min-w-[160px] px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
            />
            <input
              type="number"
              value={newBonus}
              onChange={(e) => setNewBonus(e.target.value)}
              className="w-20 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm text-center"
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
                  {a.name} ({a.defense_bonus >= 0 ? '+' : ''}{a.defense_bonus})
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

function StatAdjuster({ label, current, max, onChange }) {
  const [busy, setBusy] = useState(false);

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
        <span className="font-bold text-lg w-14">{current}/{max}</span>
        <button
          onClick={() => adjust(1)}
          disabled={busy || current >= max}
          className="w-6 h-6 rounded-full border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-30 leading-none"
        >
          +
        </button>
      </div>
    </div>
  );
}
