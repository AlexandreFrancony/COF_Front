import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getCharacter, getProfils, getPeuples, getVoies,
  updateCharacter, addCharacterVoie,
} from '../utils/api';

const CARACS = ['AGI', 'CON', 'FOR', 'PER', 'CHA', 'INT', 'VOL'];
const CARAC_LABELS = {
  AGI: 'Agilité', CON: 'Constitution', FOR: 'Force', PER: 'Perception',
  CHA: 'Charisme', INT: 'Intelligence', VOL: 'Volonté',
};

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
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profils, setProfils] = useState([]);
  const [peuples, setPeuples] = useState([]);
  const [step, setStep] = useState(0);

  const [profilId, setProfilId] = useState(null);
  const [peupleId, setPeupleId] = useState(null);
  const [caracteristiques, setCaracteristiques] = useState(null);
  const [profilVoies, setProfilVoies] = useState([]);
  const [peupleVoie, setPeupleVoie] = useState(null);
  const [selectedVoieIds, setSelectedVoieIds] = useState([]);
  const [equipement, setEquipement] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getCharacter(id), getProfils(), getPeuples()])
      .then(([char, profilsData, peuplesData]) => {
        setCharacter(char);
        setProfils(profilsData);
        setPeuples(peuplesData);
        if (char.profil_id) setProfilId(char.profil_id);
        if (char.peuple_id) setPeupleId(char.peuple_id);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const profil = profils.find((p) => p.id === profilId);
  const peuple = peuples.find((p) => p.id === peupleId);

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
      setPeupleVoie(peV[0] || null);
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
      const updated = await updateCharacter(id, {
        profil_id: profilId,
        peuple_id: peupleId,
        level: 1,
        caracteristiques,
        equipement: equipement.split(',').map((s) => s.trim()).filter(Boolean),
      });

      const voiesToAdd = [...selectedVoieIds, ...(peupleVoie ? [peupleVoie.id] : [])];
      await Promise.all(voiesToAdd.map((voieId) =>
        addCharacterVoie(id, { voie_id: voieId, obtained_at_level: 1 })
      ));

      const refreshed = await getCharacter(id);
      setCharacter({ ...updated, voies: refreshed.voies });
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
        <h1 className="text-2xl font-bold text-[var(--accent)]">{character.name}</h1>
        <p className="text-[var(--text-secondary)]">
          Niveau {character.level} — {profils.find((p) => p.id === character.profil_id)?.name} · {peuples.find((p) => p.id === character.peuple_id)?.name}
        </p>

        <Card className="grid grid-cols-3 sm:grid-cols-4 gap-3 text-center">
          {[
            ['PV', `${character.pv_current}/${character.pv_max}`],
            ['PM', `${character.pm_current}/${character.pm_max}`],
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

        <Card>
          <h2 className="font-semibold mb-2">Voies</h2>
          <ul className="text-sm flex flex-col gap-1">
            {character.voies?.map((v) => (
              <li key={v.voie_id}>{v.name} — rang {v.rang}</li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  // --- Creation wizard ---
  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-[var(--accent)]">Créer {character.name}</h1>
      <p className="text-sm text-[var(--text-secondary)]">Étape {step + 1} / 5</p>

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
            Choisissez 2 des 5 voies de {profil.name}. Voie de peuple automatique : {peupleVoie?.name || '—'}.
          </p>
          <div className="grid gap-2">
            {profilVoies.map((v) => (
              <button
                key={v.id}
                onClick={() => toggleVoie(v.id)}
                className={`text-left p-3 rounded-lg border ${
                  selectedVoieIds.includes(v.id) ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'
                }`}
              >
                <div className="font-medium">{v.name}</div>
                <div className="text-xs text-[var(--text-secondary)]">{v.capacites[0]?.name} (rang 1)</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <StepButton onClick={() => setStep(3)} primary={false}>Retour</StepButton>
            <StepButton onClick={() => setStep(5)} disabled={selectedVoieIds.length !== 2}>Suivant</StepButton>
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
