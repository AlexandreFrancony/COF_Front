import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
  getCharacter, getProfils, getPeuples, getVoies, getCampaign,
  updateCharacter, addCharacterVoie, setCharacterVoieRang,
  levelUpCharacter, setPlannedVoies, getCapaciteChoices, resolveCapaciteChoice,
  getArmures, createArmure, deleteArmure,
  getArmes, createArme, deleteArme, uploadCharacterAvatar, getCharacterStreamUrl,
} from '../utils/api';
import CapaciteSummary from '../components/CapaciteSummary';
import { HUMAN_ORIGINS } from '../utils/capaciteChoices';
import { useStatAdjuster } from '../hooks/useStatAdjuster';

const CARACS = ['AGI', 'CON', 'FOR', 'PER', 'CHA', 'INT', 'VOL'];
const CARAC_LABELS = {
  AGI: 'Agilité', CON: 'Constitution', FOR: 'Force', PER: 'Perception',
  CHA: 'Charisme', INT: 'Intelligence', VOL: 'Volonté',
};
// Quick-scan emoji for stats/caracs — purely cosmetic, no meaning encoded beyond "PV vs PM vs
// Chance etc. look different at a glance".
const CARAC_EMOJI = { AGI: '🤸', CON: '🫀', FOR: '💪', PER: '👁️', CHA: '✨', INT: '🧠', VOL: '🔥' };
const STAT_EMOJI = { PV: '❤️', PM: '🔮', Chance: '🍀', DR: '💤', Défense: '🛡️', Initiative: '⚡' };

// Mirrors characterCalculations.js's own table (p.39) — the backend is the real gate (it
// rejects a raise that fails this check regardless), this copy only decides whether the
// "raise this voie" button is even shown as clickable, so a player never sees an option that
// was always going to be refused (that's exactly the confusion that led to this being added).
const NIVEAU_REQUIS_PAR_RANG = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 7, 6: 9, 7: 11, 8: 13 };

// Three fixed value arrays (p.20) the player distributes freely across the 7 caractéristiques —
// not tied to the profil's "priorities" in any way, those are just a suggestion shown alongside.
const CARAC_PROFILES = {
  polyvalent: { label: 'Polyvalent', values: [2, 2, 2, 1, 1, 0, -1] },
  expert: { label: 'Expert', values: [3, 2, 1, 1, 0, 0, -1] },
  specialiste: { label: 'Spécialiste', values: [4, 2, 1, 0, 0, -1, -1] },
};

// Augustin Moëdec's homebrew schizophrenia — hardcoded to these exact voie_ids, not a general
// multi-personality system. Voie des artefacts (76) and Voie de transition (139) are common to
// both facettes (never inactive, absent from both lists below on purpose); Voie du métal (78)
// and Voie des runes (80) only under the threshold ("calme"); Voie de la magie destructrice (82)
// and Voie de la magie élémentaire (83) only above it ("mage fou"). Gated on
// character.custom_data.threshold_percent being set (only true for him), so this is a no-op for
// every other character.
const FACETTE_VOIE_GROUPS = { calme: [78, 80], mage: [82, 83] };

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

// title/headerAction are optional: omitted, Card renders exactly as before (the creation
// wizard's own inline <h2> usages stay untouched). Passed, it gets the "livre" plate treatment —
// a solid gold title bar with cut Art Déco corners instead of a plain heading.
function Card({ children, className = '', title, headerAction }) {
  return (
    <div className={`cof-plate rounded-xl overflow-hidden bg-[var(--bg-card)] border border-[var(--border)] ${title ? '' : 'p-4'} ${className}`}>
      {title && (
        <div className="cof-plate-head px-4 py-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="min-w-0">{title}</span>
          {headerAction}
        </div>
      )}
      <div className={title ? 'p-4' : ''}>{children}</div>
    </div>
  );
}

// Shown wherever the character appears as a pawn (board token, HUD card) — a real photo takes
// priority over the emoji fallback, see resolveAvatar() in BoardCanvas.jsx. Editable by anyone
// who can load this sheet (owner or GM, same as armor/weapon selection below — cosmetic, not
// gated behind Mode édition), the backend enforces the same access check either way.
function CharacterAvatar({ character, onRefresh }) {
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [emoji, setEmoji] = useState(character.avatar_emoji || '');

  // Only the character's own owner has a Discord avatar worth offering here — a GM editing
  // someone else's sheet has no business stamping their own face on a player's character.
  // discord_avatar_hash is null for the small minority still on Discord's default avatar
  // (no custom picture uploaded) — that one isn't served from this CDN path, so skip it.
  const canUseDiscordAvatar = character.user_id === user?.id && user?.discord_id && user?.discord_avatar_hash;
  const discordAvatarUrl = canUseDiscordAvatar
    ? `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.discord_avatar_hash}.png?size=128`
    : null;

  const useDiscordAvatar = async () => {
    try {
      await updateCharacter(character.id, { avatar_url: discordAvatarUrl });
      setEmoji('');
      await onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadCharacterAvatar(character.id, file);
      await updateCharacter(character.id, { avatar_url: url });
      setEmoji('');
      await onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleEmojiBlur = async () => {
    const trimmed = emoji.trim();
    if (trimmed === (character.avatar_emoji || '')) return;
    try {
      await updateCharacter(character.id, { avatar_emoji: trimmed || null });
      await onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        title="Changer la photo de profil"
        className="w-16 h-16 rounded-full border-2 border-[var(--border)] bg-[var(--bg-input)] bg-cover bg-center flex items-center justify-center overflow-hidden hover:border-[var(--accent)] disabled:opacity-50"
        style={{ backgroundImage: character.avatar_url ? `url(${character.avatar_url})` : undefined }}
      >
        {!character.avatar_url && (
          character.avatar_emoji
            ? <span className="text-2xl">{character.avatar_emoji}</span>
            : <span className="text-lg">📷</span>
        )}
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      <input
        type="text"
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        onBlur={handleEmojiBlur}
        placeholder="ou emoji"
        maxLength={8}
        title="Emoji utilisé si aucune photo n'est définie"
        className="w-16 px-1 py-0.5 text-xs text-center rounded border border-[var(--border)] bg-[var(--bg-input)]"
      />
      {canUseDiscordAvatar && character.avatar_url !== discordAvatarUrl && (
        <button
          type="button"
          onClick={useDiscordAvatar}
          title="Utiliser ma photo de profil Discord"
          className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent)] underline"
        >
          Avatar Discord
        </button>
      )}
    </div>
  );
}

// Recursive: a capacité that itself grants a further borrowed pick (e.g. Augustin's Voie du
// Mage rang 1 → Voie du Gnome's "Don étrange" → Voie de l'envoûteur's "Injonction") nests to
// arbitrary depth, not just one level — each nested voie's own capacité may have its own
// nestedVoiesByCapacite entry in turn.
function NestedCapacites({ parentCapaciteId, nestedVoiesByCapacite, level, character, onRefresh }) {
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
          <CapaciteSummary capacite={nc} level={level} voieId={nv.voie_id} character={character} onRefresh={onRefresh} />
          <NestedCapacites parentCapaciteId={nc.id} nestedVoiesByCapacite={nestedVoiesByCapacite} level={level} character={character} onRefresh={onRefresh} />
        </li>
      ))}
    </ul>
  ));
}

// Some capacités (e.g. the Gnome's Don étrange, or Voie du mage's own rang 1) let the character
// borrow one capacité from elsewhere — data-driven off rules_capacites.effect.type ===
// 'grant_capacite_choice'. Shows a picker until resolved (a matching character_voies row with
// nested_under_capacite_id = this capacité's id exists), then disappears — NestedCapacites takes
// over rendering the result. Owner or GM only; free, no capacity point spent.
function CapaciteChoiceSelector({ capacite, character, isGm, onRefresh }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(null);
  const [busy, setBusy] = useState(false);

  if (capacite.effect?.type !== 'grant_capacite_choice') return null;
  const alreadyChosen = (character.voies || []).some((v) => v.nested_under_capacite_id === capacite.id);
  if (alreadyChosen) return null;
  if (!isGm && character.user_id !== user?.id) return null;

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    if (!options) {
      try {
        setOptions(await getCapaciteChoices(character.id, capacite.id));
      } catch (e) {
        toast.error(e.message);
        return;
      }
    }
    setOpen(true);
  };

  const choose = async (chosenId) => {
    setBusy(true);
    try {
      await resolveCapaciteChoice(character.id, { granting_capacite_id: capacite.id, chosen_capacite_id: chosenId });
      await onRefresh();
      toast.success('Capacité choisie !');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const byGroup = {};
  (options || []).forEach((o) => { (byGroup[o.profil_name || o.voie_name] ??= []).push(o); });

  return (
    <div className="mt-1.5 ml-3">
      <button type="button" onClick={toggle} className="text-xs underline text-[var(--accent)]">
        {open ? 'Fermer' : 'Choisir une capacité empruntée'}
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1">
          {options?.length === 0 && (
            <p className="text-xs text-[var(--text-secondary)]">Aucune option disponible.</p>
          )}
          {Object.entries(byGroup).map(([groupName, items]) => (
            <details key={groupName} className="rounded border border-[var(--border)]">
              <summary className="px-2 py-1 text-xs cursor-pointer hover:bg-[var(--bg-input)]">
                {groupName} ({items.length})
              </summary>
              <div className="flex flex-wrap gap-1 p-2 pt-0">
                {items.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => choose(o.id)}
                    disabled={busy}
                    title={o.resume || o.description}
                    className="px-2 py-1 rounded border border-[var(--border)] text-xs hover:border-[var(--accent)] disabled:opacity-50"
                  >
                    {o.voie_name} — {o.name} (rang {o.rang})
                  </button>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
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
  const [caracProfileKey, setCaracProfileKey] = useState(null);
  // { AGI: chipIndex, ... } — chipIndex is the value's position in CARAC_PROFILES[key].values,
  // tracked by index (not by value) so the profile's duplicate numbers (e.g. Polyvalent's two
  // +2 and two +1) each still act as a single, distinct, draggable chip.
  const [caracSlots, setCaracSlots] = useState({});
  const [selectedChip, setSelectedChip] = useState(null);
  const [profilVoies, setProfilVoies] = useState([]);
  // GM-only roadmap editor (PlannedVoiesEditor) needs the full custom/profil voie catalogs —
  // fetched once here instead of inside the level-up flow, since planning the roadmap is a prep
  // activity independent of an active level-up.
  const [customVoiesAll, setCustomVoiesAll] = useState([]);
  const [allProfilVoiesAll, setAllProfilVoiesAll] = useState([]);
  const [peupleVoie, setPeupleVoie] = useState(null);
  const [demiElfeChoices, setDemiElfeChoices] = useState(null);
  const [voieDuMage, setVoieDuMage] = useState(null);
  const [replaceWithMage, setReplaceWithMage] = useState(false);
  const [selectedVoieIds, setSelectedVoieIds] = useState([]);
  const [mageBonusVoieId, setMageBonusVoieId] = useState(null);
  const [hybridCreation, setHybridCreation] = useState(false);
  const [allProfilVoies, setAllProfilVoies] = useState([]);
  const [customVoiesForCreation, setCustomVoiesForCreation] = useState([]);
  const [hybridPickId, setHybridPickId] = useState('');
  const [origineHumaine, setOrigineHumaine] = useState('');
  const [equipement, setEquipement] = useState('');
  const [monnaie, setMonnaie] = useState({ pieces_cuivre: 0, pieces_argent: 0, pieces_or: 0, pieces_platine: 0 });
  const [saving, setSaving] = useState(false);
  const [armures, setArmures] = useState([]);
  const [armes, setArmes] = useState([]);
  const [expandedVoies, setExpandedVoies] = useState(new Set());
  const [campaign, setCampaign] = useState(null);

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
        if (char.campaign_id) getCampaign(char.campaign_id).then(setCampaign).catch(() => {});
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Keeps this sheet in sync with changes made anywhere else — the board's own PV/PM/Chance
  // adjuster, the GM editing the same character, another device viewing it — instead of only
  // ever updating on this tab's own actions. Same pattern as Board.jsx's own board-stream.
  useEffect(() => {
    const source = new EventSource(getCharacterStreamUrl(id));
    source.addEventListener('character', (event) => setCharacter(JSON.parse(event.data)));
    return () => source.close();
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
    if (isGm && character?.profil_id && character.pv_max > 0 && allProfilVoiesAll.length === 0) {
      getVoies({ type: 'custom' }).then(setCustomVoiesAll).catch(() => {});
      getVoies({ type: 'profil' }).then(setAllProfilVoiesAll).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]);

  // --- Step 2→3: caractéristiques are assigned freely (p.20) — pick one of the 3 value
  // profiles, then drag each of its 7 numbers onto a caractéristique. Nothing pre-filled here;
  // goToCaracteristiques only resets the picker so a previous attempt (Retour then Suivant
  // again) doesn't carry over a stale profile/assignment from before.
  const goToCaracteristiques = () => {
    setCaracProfileKey(null);
    setCaracSlots({});
    setSelectedChip(null);
    setCaracteristiques(null);
    setStep(3);
  };

  const selectCaracProfile = (key) => {
    setCaracProfileKey(key);
    setCaracSlots({});
    setSelectedChip(null);
    setCaracteristiques(Object.fromEntries(CARACS.map((c) => [c, 0])));
  };

  const caracProfileValues = caracProfileKey ? CARAC_PROFILES[caracProfileKey].values : [];
  const usedChipIds = new Set(Object.values(caracSlots));
  const caracPool = caracProfileValues
    .map((value, chipId) => ({ chipId, value }))
    .filter(({ chipId }) => !usedChipIds.has(chipId));
  const allCaracsAssigned = caracProfileKey != null && CARACS.every((c) => caracSlots[c] !== undefined);

  // Placing a chip already used elsewhere moves it (never duplicates); placing onto an
  // already-filled caractéristique bumps its previous chip back to the pool.
  const placeCaracChip = (carac, chipId) => {
    setCaracSlots((prev) => {
      const next = {};
      for (const [c, id] of Object.entries(prev)) {
        if (c !== carac && id !== chipId) next[c] = id;
      }
      next[carac] = chipId;
      const values = CARAC_PROFILES[caracProfileKey].values;
      setCaracteristiques(Object.fromEntries(CARACS.map((c) => [c, next[c] !== undefined ? values[next[c]] : 0])));
      return next;
    });
    setSelectedChip(null);
  };

  const unplaceCaracChip = (carac) => {
    setCaracSlots((prev) => {
      const next = { ...prev };
      delete next[carac];
      const values = CARAC_PROFILES[caracProfileKey].values;
      setCaracteristiques(Object.fromEntries(CARACS.map((c) => [c, next[c] !== undefined ? values[next[c]] : 0])));
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
        const [all, custom] = await Promise.all([
          getVoies({ type: 'profil' }),
          // Homebrew voies (e.g. Augustin's Voie de transition, Ainee's 6 custom voies) used to
          // only be pickable after creation (level-up panel) — offered here too now, in the same
          // "voie hors profil" picker, since a character concept built around one is often known
          // from the start rather than discovered later.
          getVoies({ type: 'custom' }),
        ]);
        setAllProfilVoies(all);
        setCustomVoiesForCreation(custom);
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
        ...monnaie,
        ...(peupleVoie?.code === 'peuple-humain' ? { origine_humaine: origineHumaine.trim() } : {}),
      });

      const voiesToAdd = [
        ...selectedVoieIds.map((voieId) => ({ voieId })),
        // Replacing the peuple voie with the voie du mage nests it under the mage voie's rang-1
        // capacité rather than keeping it as its own frozen section — p.60's own text says the
        // mage "conserve les effets" of the peuple voie's rang 1, i.e. absorbs it into that
        // capacité, the same shape as a Gnome's Don étrange borrow.
        ...(peupleVoie ? [{
          voieId: peupleVoie.id,
          ...(replaceWithMage ? {
            onlyCapaciteId: peupleVoie.capacites?.find((c) => c.rang === 1)?.id ?? null,
            nestedUnderCapaciteId: voieDuMage?.capacites?.find((c) => c.rang === 1)?.id ?? null,
          } : {}),
        }] : []),
        ...(replaceWithMage && voieDuMage ? [{ voieId: voieDuMage.id }] : []),
      ];
      for (const { voieId, onlyCapaciteId = null, nestedUnderCapaciteId = null } of voiesToAdd) {
        const rang = voieId === mageBonusVoieId ? 2 : 1;
        await addCharacterVoie(id, {
          voie_id: voieId, obtained_at_level: 1, spend_points: false, rang,
          only_capacite_id: onlyCapaciteId, nested_under_capacite_id: nestedUnderCapaciteId,
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
    // Discarding is different from using: the stored mana is simply lost, none of it comes back
    // as PM (e.g. the artefact is emptied for a narrative reason, not to recover mana).
    const handleArtefactDiscard = () => {
      updateCharacter(id, { custom_data: { artefact_reserve_current: 0 } }).then(refreshCharacter);
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
          <div className="flex items-start gap-3">
            <CharacterAvatar character={character} onRefresh={refreshCharacter} />
            <div>
              {campaign && (
                <Link to={`/campaigns/${campaign.id}`} className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)]">
                  ← {campaign.name}
                </Link>
              )}
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatAdjuster
            label="Vigueur" current={character.pv_current} max={character.pv_max}
            onChange={(v) => updateCharacter(id, { pv_current: v }).then(refreshCharacter)}
          />
          <StatAdjuster
            label="Mana" current={character.pm_current} max={character.pm_max} koLabel={false}
            onChange={(v) => updateCharacter(id, { pm_current: v }).then(refreshCharacter)}
          />
          <StatAdjuster
            label="Chance" current={character.points_chance_current} max={character.points_chance} koLabel={false}
            onChange={(v) => updateCharacter(id, { points_chance_current: v }).then(refreshCharacter)}
          />
          <StatAdjuster
            label="Récupération" current={character.dr_current} max={character.dr_max} koLabel={false}
            suffix={character.dr_die ? ` ${character.dr_die}` : ''}
            onChange={(v) => updateCharacter(id, { dr_current: v }).then(refreshCharacter)}
          />
          {[
            ['Défense', character.defense],
            ['Initiative', character.initiative],
          ].map(([label, value]) => (
            <div key={label} className="cof-vital">
              <div className="cof-plate-head text-center py-1.5">{label}</div>
              <div className="cof-display text-center font-bold text-xl py-3">{value}</div>
            </div>
          ))}
          <DestinCard
            value={character.destin}
            onChange={(v) => updateCharacter(id, { destin: v }).then(refreshCharacter)}
          />
        </div>

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
              <button
                onClick={handleArtefactDiscard}
                disabled={artefactCurrent <= 0}
                title="Vider l'artéfact sans récupérer son mana (perdu)"
                className="px-2 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-40 text-xs"
              >
                Vider
              </button>
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
                  title="Utiliser l'artéfact : vide son mana dans sa réserve de PM (tout ce qui dépasse le PM max est perdu)"
                  className="px-2 h-7 rounded border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-40 text-xs"
                >
                  Utiliser ↩
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <Card
              title="Voies"
              headerAction={allVoiesIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpandedVoies(allExpanded ? new Set() : new Set(allVoiesIds))}
                  className="text-xs normal-case tracking-normal font-normal opacity-90 hover:opacity-100 underline"
                >
                  {allExpanded ? 'Tout replier' : 'Tout déplier'}
                </button>
              )}
            >
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
                        <span className="cof-display text-sm text-[var(--accent-hover)]">
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
                              <CapaciteSummary capacite={c} level={character.level} voieId={v.voie_id} character={character} onRefresh={refreshCharacter} />
                              <CapaciteChoiceSelector capacite={c} character={character} isGm={isGm} onRefresh={refreshCharacter} />
                              <NestedCapacites
                                parentCapaciteId={c.id}
                                nestedVoiesByCapacite={nestedVoiesByCapacite}
                                level={character.level}
                                character={character}
                                onRefresh={refreshCharacter}
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

            <LevelUpBanner character={character} onRefresh={refreshCharacter} />
            {isGm && (
              <PlannedVoiesEditor
                character={character}
                profils={profils}
                allProfilVoies={allProfilVoiesAll}
                customVoies={customVoiesAll}
                onRefresh={refreshCharacter}
              />
            )}
          </div>

          <div className="flex flex-col gap-4">
            <Card title="Caractéristiques">
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                {CARACS.map((c) => (
                  <div key={c}>
                    <div className="cof-chip rounded text-xs py-1 mb-1">{c}</div>
                    <div className="cof-display font-bold">{character.caracteristiques[c] >= 0 ? '+' : ''}{character.caracteristiques[c]}</div>
                  </div>
                ))}
              </div>
            </Card>

            <DescriptionCard character={character} onRefresh={refreshCharacter} />

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

            <EquipementCard character={character} onRefresh={refreshCharacter} />
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

      {step === 3 && (
        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">3. Caractéristiques</h2>

          {!caracProfileKey ? (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                Choisissez une série de valeurs à répartir librement entre les 7 caractéristiques
                (suggestion pour ce profil : {profil.caracteristiques_prioritaires.join(', ')}).
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                {Object.entries(CARAC_PROFILES).map(([key, { label, values }]) => (
                  <button
                    key={key}
                    onClick={() => selectCaracProfile(key)}
                    className="p-3 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] text-left"
                  >
                    <div className="font-medium mb-1">{label}</div>
                    <div className="text-sm text-[var(--text-secondary)]">
                      {values.map((v) => (v >= 0 ? `+${v}` : v)).join(', ')}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--text-secondary)]">
                  {CARAC_PROFILES[caracProfileKey].label} — glissez chaque valeur sur une caractéristique
                  (ou cliquez une valeur puis la caractéristique visée).
                </p>
                <button
                  onClick={() => selectCaracProfile(null)}
                  className="shrink-0 text-xs px-2 py-1 rounded border border-[var(--border)] hover:border-[var(--accent)]"
                >
                  Changer de série
                </button>
              </div>

              {/* Pool of not-yet-placed values — also a drop target, so dragging a placed chip
                  back here unassigns it instead of only being able to overwrite another slot. */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const chipId = Number(e.dataTransfer.getData('text/plain'));
                  const owner = Object.entries(caracSlots).find(([, id]) => id === chipId)?.[0];
                  if (owner) unplaceCaracChip(owner);
                }}
                className="min-h-[3.5rem] flex flex-wrap items-center gap-2 p-2 rounded-lg border border-dashed border-[var(--border)]"
              >
                {caracPool.length === 0 && (
                  <span className="text-xs text-[var(--text-secondary)]">Toutes les valeurs sont placées.</span>
                )}
                {caracPool.map(({ chipId, value }) => (
                  <div
                    key={chipId}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', String(chipId))}
                    onClick={() => setSelectedChip((prev) => (prev === chipId ? null : chipId))}
                    className={`w-11 h-11 flex items-center justify-center rounded-lg border font-bold cursor-grab active:cursor-grabbing select-none ${
                      selectedChip === chipId ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'
                    }`}
                  >
                    {value >= 0 ? `+${value}` : value}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CARACS.map((c) => {
                  const chipId = caracSlots[c];
                  const value = chipId !== undefined ? caracProfileValues[chipId] : null;
                  return (
                    <div key={c} className="flex flex-col items-center gap-1">
                      <div className="text-xs text-[var(--text-secondary)]">{CARAC_EMOJI[c]} {c}</div>
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => placeCaracChip(c, Number(e.dataTransfer.getData('text/plain')))}
                        onClick={() => {
                          if (selectedChip !== null) placeCaracChip(c, selectedChip);
                          else if (chipId !== undefined) unplaceCaracChip(c);
                        }}
                        draggable={chipId !== undefined}
                        onDragStart={(e) => chipId !== undefined && e.dataTransfer.setData('text/plain', String(chipId))}
                        className={`w-14 h-14 flex items-center justify-center rounded-lg border font-bold cursor-pointer ${
                          value !== null
                            ? 'border-[var(--accent)] bg-[var(--bg-input)] cursor-grab active:cursor-grabbing'
                            : 'border-dashed border-[var(--border)] text-[var(--text-secondary)] text-xs'
                        }`}
                      >
                        {value !== null ? (value >= 0 ? `+${value}` : value) : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {allCaracsAssigned && peuple?.ajustements && (
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
                  <strong>Personnage hybride ou voie personnalisée dès la création</strong> — exception aux
                  règles normales (le perso est déjà formé à un autre art au niveau 1, ex. un guerrier-mage,
                  ou son concept repose sur une voie homebrew). Permet de piocher une des 2 voies de départ
                  dans un autre profil ou parmi les voies personnalisées.
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
                      {customVoiesForCreation.length > 0 && (
                        <optgroup label="Personnalisées (homebrew)">
                          {customVoiesForCreation.map((v) => (
                            <option key={v.id} value={v.id} disabled={selectedVoieIds.includes(v.id)}>
                              {v.name}{v.origine_pj ? ` — ${v.origine_pj}` : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
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
                        const v = allProfilVoies.find((av) => av.id === id) || customVoiesForCreation.find((cv) => cv.id === id);
                        const originLabel = v?.profil_id ? profils.find((p) => p.id === v.profil_id)?.name : 'homebrew';
                        return (
                          <span
                            key={id}
                            className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--accent)] bg-[var(--bg-input)] text-xs"
                          >
                            {v?.name} ({originLabel})
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
                  const v = profilVoies.find((pv) => pv.id === vid) || allProfilVoies.find((pv) => pv.id === vid) || customVoiesForCreation.find((pv) => pv.id === vid);
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

          <div>
            <p className="text-sm mb-1">Bourse</p>
            <div className="grid grid-cols-4 gap-2">
              {MONNAIE_FIELDS.map(([field, emoji, label]) => (
                <label key={field} className="flex flex-col items-center gap-1 text-xs">
                  <span className="text-[var(--text-secondary)]">{emoji} {label}</span>
                  <input
                    type="number"
                    min={0}
                    value={monnaie[field]}
                    onChange={(e) => setMonnaie((m) => ({ ...m, [field]: Number(e.target.value) || 0 }))}
                    className="w-full px-1 py-1 text-center rounded bg-[var(--bg-input)] border border-[var(--border)]"
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm mb-1">Reste de l'équipement</p>
            <textarea
              placeholder="Équipement, séparé par des virgules (ex: épée courte, sac d'aventurier, couverture...)"
              value={equipement}
              onChange={(e) => setEquipement(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
            />
          </div>
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

// Compact entry point to the dedicated /characters/:id/level-up page — the actual point-spending
// UI used to live inline here (a wall of buttons easy to miss on a long sheet), which is exactly
// what players found unclear. Advancing the level itself stays a one-click action right on the
// sheet; only spending the resulting points moves to its own page.
function LevelUpBanner({ character, onRefresh }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const points = character.capacity_points_available;

  if (points > 0) {
    return (
      <button
        onClick={() => navigate(`/characters/${character.id}/level-up`)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent)] text-white font-semibold hover:bg-[var(--accent-hover)] cof-plate"
      >
        🎉 {points} point{points > 1 ? 's' : ''} de compétence à dépenser — Monter de niveau
      </button>
    );
  }

  const levelUp = async () => {
    setBusy(true);
    try {
      await levelUpCharacter(character.id);
      await onRefresh();
      toast.success('Niveau supérieur !');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <StepButton onClick={levelUp} disabled={busy}>
        Passer au niveau {character.level + 1}
      </StepButton>
    </Card>
  );
}

function PlannedVoiesEditor({ character, profils, allProfilVoies, customVoies, onRefresh }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set(character.planned_voie_ids || []));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(new Set(character.planned_voie_ids || []));
  }, [character.id, character.planned_voie_ids]);

  const eligibleCustomVoies = customVoies.filter(
    (v) => v.origine_pj_character_id == null || v.origine_pj_character_id === character.id
  );

  const byProfil = {};
  allProfilVoies.forEach((v) => { (byProfil[v.profil_id] ??= []).push(v); });
  const profilIds = Object.keys(byProfil).map(Number).sort((a, b) =>
    (profils.find((p) => p.id === a)?.name || '').localeCompare(profils.find((p) => p.id === b)?.name || '')
  );

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await setPlannedVoies(character.id, [...selected]);
      await onRefresh();
      toast.success('Voies prévues enregistrées');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="flex flex-col gap-2">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center justify-between text-left">
        <h2 className="font-semibold">Voies prévues (roadmap MJ)</h2>
        <span className="text-xs text-[var(--text-secondary)]">
          {selected.size > 0 ? `${selected.size} sélectionnée${selected.size > 1 ? 's' : ''}` : 'aucune restriction'} {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <>
          <p className="text-xs text-[var(--text-secondary)]">
            Coche les voies que ce PJ prévoit d'investir (profil, hybride ou homebrew) pour ne proposer que
            celles-ci en montée de niveau. Aucune coche = toutes les voies éligibles restent proposées.
          </p>
          {eligibleCustomVoies.length > 0 && (
            <div>
              <p className="text-sm mb-1">Homebrew</p>
              <div className="flex flex-wrap gap-2">
                {eligibleCustomVoies.map((v) => (
                  <label key={v.id} className="flex items-center gap-1 text-sm px-2 py-1 rounded border border-[var(--border)]">
                    <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} />
                    {v.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            {profilIds.map((pid) => {
              const items = byProfil[pid];
              const countSelected = items.filter((v) => selected.has(v.id)).length;
              return (
                <details key={pid} className="rounded-lg border border-[var(--border)] overflow-hidden">
                  <summary className="px-2 py-1.5 text-sm cursor-pointer hover:bg-[var(--bg-input)]">
                    {profils.find((p) => p.id === pid)?.name}
                    {countSelected > 0 && <span className="text-xs text-[var(--accent)] ml-1">({countSelected})</span>}
                  </summary>
                  <div className="flex flex-wrap gap-2 p-2 pt-0">
                    {items.map((v) => (
                      <label key={v.id} className="flex items-center gap-1 text-sm px-2 py-1 rounded border border-[var(--border)]">
                        <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} />
                        {v.name}
                      </label>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
          <StepButton onClick={save} disabled={saving}>
            Enregistrer
          </StepButton>
        </>
      )}
    </Card>
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
  const voieRangSaveTimers = useRef({});

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

  // Same fix as EquipementCard's currency fields: the rang input's native spin arrows change
  // the value without blurring it, so a save-on-blur-only handler could silently never fire.
  const handleVoieRangChange = (voieId, currentRang, rang) => {
    clearTimeout(voieRangSaveTimers.current[voieId]);
    if (rang === currentRang) return;
    voieRangSaveTimers.current[voieId] = setTimeout(() => changeVoieRang(voieId, rang), 800);
  };

  const handleVoieRangBlur = (voieId, currentRang, rang) => {
    clearTimeout(voieRangSaveTimers.current[voieId]);
    if (rang !== currentRang) changeVoieRang(voieId, rang);
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
                  onChange={(e) => handleVoieRangChange(v.voie_id, v.rang, Number(e.target.value))}
                  onBlur={(e) => handleVoieRangBlur(v.voie_id, v.rang, Number(e.target.value))}
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
    <Card
      title="Armure &amp; bouclier"
      headerAction={isGm && (
        <button
          type="button"
          onClick={() => setShowManage((v) => !v)}
          className="text-xs normal-case tracking-normal font-normal opacity-90 hover:opacity-100 underline whitespace-nowrap"
        >
          Gérer
        </button>
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm flex flex-col gap-1">
          Armure
          <select
            value={character.armure_id || ''}
            onChange={(e) => handleSelect('armure_id', e.target.value)}
            disabled={busy}
            className="w-full min-w-0 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
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
            className="w-full min-w-0 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
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
// bonus is the weapon's own magic bonus (arme_*_qualite.bonus) — COF2's core rules (p.250) are
// explicit that a "+X" weapon adds X to both the attack roll and the damage, not just one or
// the other, so it's appended here as its own term rather than folded silently into the dice.
function armeDamageDisplay(arme, character, bonus = 0) {
  if (!arme) return null;
  const base = arme.category === 'contact' && arme.for_applies
    ? `${arme.damage_dice} ${character.caracteristiques.FOR >= 0 ? '+' : ''}${character.caracteristiques.FOR} (FOR)`
    : arme.damage_dice;
  return bonus ? `${base} +${bonus} (magie)` : base;
}

// The character's own contact/distance/magique attack values (computed server-side from level/
// carac/voies) don't know which weapon is in hand — a weapon's own magic bonus (p.250) applies
// on top, and only to the attack type that weapon actually uses.
function effectiveAttackValue(valeursAttaque, arme, bonus) {
  const base = arme.category === 'distance' ? valeursAttaque?.distance : valeursAttaque?.contact;
  return base == null ? null : base + (bonus || 0);
}

const MONNAIE_FIELDS = [
  ['pieces_cuivre', '🟤', 'Cuivre'],
  ['pieces_argent', '⚪', 'Argent'],
  ['pieces_or', '🟡', 'Or'],
  ['pieces_platine', '💠', 'Platine'],
];

// Pure flavor text (physique, langues, croyances...) — deliberately free-form rather than
// split into named fields, same reasoning as the equipement list below: nothing here feeds a
// calculation, so a single textarea the player can format however they like beats a rigid
// shape imposed for no mechanical reason. Reuses characters.notes (existing column, already
// writable via PATCH /characters/:id, but had no UI anywhere before this).
function DescriptionCard({ character, onRefresh }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(character.notes || '');

  const save = async () => {
    setEditing(false);
    if (text === (character.notes || '')) return;
    try {
      await updateCharacter(character.id, { notes: text || null });
      await onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card title="Description du personnage">
      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          placeholder="Physique, langues parlées, croyances, traits de caractère..."
          rows={4}
          autoFocus
          className="w-full px-2 py-1.5 text-sm rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="text-sm cursor-text rounded-lg border border-transparent hover:border-[var(--border)] px-2 py-1.5 -mx-2 whitespace-pre-line"
        >
          {character.notes || (
            <p className="text-[var(--text-secondary)] italic">Aucune description — cliquer pour ajouter.</p>
          )}
        </div>
      )}
    </Card>
  );
}

// Currency (p.23) is tracked as 4 separate piles, deliberately apart from the free-text
// equipement list below it — no conversion between denominations is modeled, each field is
// edited independently. Both this and the equipement list are editable by anyone with access
// (owner or GM), same as armor/weapon selection — not gated behind Mode édition.
function EquipementCard({ character, onRefresh }) {
  const [editingList, setEditingList] = useState(false);
  const [listText, setListText] = useState((character.equipement || []).join(', '));
  const monnaieSaveTimers = useRef({});

  const saveMonnaie = async (field, value) => {
    try {
      await updateCharacter(character.id, { [field]: Number(value) || 0 });
      await onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // A number input's native spin arrows change the value without ever blurring the field, so
  // a save-on-blur-only handler silently never fires until the user happens to click elsewhere
  // afterward — debounce on every change instead (same pattern as NotesPanel's autosave),
  // with blur still flushing immediately for the common case of tabbing/clicking away.
  const handleMonnaieChange = (field, value) => {
    clearTimeout(monnaieSaveTimers.current[field]);
    monnaieSaveTimers.current[field] = setTimeout(() => saveMonnaie(field, value), 800);
  };

  const handleMonnaieBlur = (field, value) => {
    clearTimeout(monnaieSaveTimers.current[field]);
    saveMonnaie(field, value);
  };

  const saveList = async () => {
    setEditingList(false);
    try {
      await updateCharacter(character.id, { equipement: listText.split(',').map((s) => s.trim()).filter(Boolean) });
      await onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card title="Équipement">
      <p className="text-xs text-[var(--text-secondary)] mb-1">Bourse</p>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {MONNAIE_FIELDS.map(([field, emoji, label]) => (
          <label key={field} className="flex flex-col items-center gap-1 text-xs">
            <span className="text-[var(--text-secondary)]">{emoji} {label}</span>
            <input
              type="number"
              min={0}
              defaultValue={character[field] || 0}
              onChange={(e) => handleMonnaieChange(field, e.target.value)}
              onBlur={(e) => handleMonnaieBlur(field, e.target.value)}
              className="w-full px-1 py-1 text-center rounded bg-[var(--bg-input)] border border-[var(--border)]"
            />
          </label>
        ))}
      </div>

      <p className="text-xs text-[var(--text-secondary)] mb-1">Reste de l'équipement</p>
      {editingList ? (
        <textarea
          value={listText}
          onChange={(e) => setListText(e.target.value)}
          onBlur={saveList}
          placeholder="Équipement, séparé par des virgules..."
          rows={3}
          autoFocus
          className="w-full px-2 py-1.5 text-sm rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
        />
      ) : (
        <div
          onClick={() => setEditingList(true)}
          className="text-sm cursor-text rounded-lg border border-transparent hover:border-[var(--border)] px-2 py-1.5 -mx-2"
        >
          {character.equipement?.length > 0 ? (
            <ul className="list-disc list-inside">
              {character.equipement.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          ) : (
            <p className="text-[var(--text-secondary)] italic">Aucun équipement noté — cliquer pour ajouter.</p>
          )}
        </div>
      )}
    </Card>
  );
}

const WEAPON_RARITIES = [
  ['commun', 'Commune'],
  ['plus1', '+1'],
  ['plus2', '+2'],
  ['plus3', '+3'],
  ['legendaire', 'Légendaire'],
];

// Sensible starting bonus when a rarity is picked — plain +X tiers always mean exactly +X per
// the core rules (p.250: "une épée +2 apporte un bonus de +2... à l'attaque et aux DM"), so
// there's nothing to decide there. A légendaire item has no fixed bonus by definition (e.g.
// Shântoun, Calice T1 p.153, starts at +1 and climbs to +2/+3 with the wielder's own level) —
// 1 is just a starting point, left freely editable so the GM can bump it later.
const WEAPON_RARITY_DEFAULT_BONUS = { commun: 0, plus1: 1, plus2: 2, plus3: 3, legendaire: 1 };

// Purely cosmetic (see the schema comment on arme_principale_qualite) — every weapon gets a
// rarity treatment, defaulting to "commune", rather than only magic ones standing out.
function WeaponName({ baseName, qualite, className = '' }) {
  const rarity = qualite?.rarity || 'commun';
  return (
    <span className={`weapon-rarity weapon-rarity-${rarity} ${className}`}>
      {qualite?.name?.trim() || baseName}
    </span>
  );
}

// Inline name/rarity/effects editor for one weapon slot — effects is free text rather than a
// mechanical field because a named magic item's rules (Shântoun, Calice T1 p.153) don't fit
// any fixed shape, and most of the time there's nothing to say beyond "it's a +1 sword".
function WeaponQualiteEditor({ qualite, baseName, onSave, onCancel, busy }) {
  const [name, setName] = useState(qualite?.name || '');
  const [rarity, setRarity] = useState(qualite?.rarity || 'commun');
  const [bonus, setBonus] = useState(qualite?.bonus ?? WEAPON_RARITY_DEFAULT_BONUS[qualite?.rarity || 'commun']);
  const [effects, setEffects] = useState(qualite?.effects || '');

  // Only re-suggests the bonus — never overrides one the GM already dialed in by hand, so
  // switching rarity to fix the color doesn't silently reset a legendary item's current bonus.
  const handleRarityChange = (value) => {
    setRarity(value);
    if (bonus === WEAPON_RARITY_DEFAULT_BONUS[rarity]) setBonus(WEAPON_RARITY_DEFAULT_BONUS[value]);
  };

  return (
    <div className="mt-1 flex flex-col gap-1.5 p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]">
      <div className="flex flex-wrap gap-1.5">
        <input
          type="text"
          placeholder={baseName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-[120px] px-2 py-1 text-sm rounded bg-[var(--bg-card)] border border-[var(--border)]"
        />
        <select
          value={rarity}
          onChange={(e) => handleRarityChange(e.target.value)}
          className="px-2 py-1 text-sm rounded bg-[var(--bg-card)] border border-[var(--border)]"
        >
          {WEAPON_RARITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="flex items-center gap-1 text-sm">
          Bonus
          <input
            type="number"
            min="0"
            max="10"
            value={bonus}
            onChange={(e) => setBonus(Math.max(0, Number(e.target.value) || 0))}
            title="Ajouté à l'attaque et aux dégâts avec cette arme (règles de base p.250)"
            className="w-14 px-1.5 py-1 rounded bg-[var(--bg-card)] border border-[var(--border)]"
          />
        </label>
      </div>
      <textarea
        placeholder="Effets (optionnel — utile surtout pour une arme légendaire unique)"
        value={effects}
        onChange={(e) => setEffects(e.target.value)}
        rows={3}
        className="px-2 py-1 text-sm rounded bg-[var(--bg-card)] border border-[var(--border)] resize-y"
      />
      <div className="flex gap-1.5 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:border-[var(--accent)]"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => onSave({ name: name.trim() || null, rarity, bonus, effects: effects.trim() || null })}
          disabled={busy}
          className="px-2 py-1 text-xs rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
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
  const [editingQualiteSlot, setEditingQualiteSlot] = useState(null); // 'principale' | 'secondaire' | null

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

  const handleSaveQualite = async (slot, qualite) => {
    setBusy(true);
    try {
      await updateCharacter(character.id, { [`arme_${slot}_qualite`]: qualite });
      await onRefresh();
      setEditingQualiteSlot(null);
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
    <Card
      title="Armes"
      headerAction={isGm && (
        <button
          type="button"
          onClick={() => setShowManage((v) => !v)}
          className="text-xs normal-case tracking-normal font-normal opacity-90 hover:opacity-100 underline whitespace-nowrap"
        >
          Gérer
        </button>
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm flex flex-col gap-1">
          Arme principale
          <select
            value={character.arme_principale_id || ''}
            onChange={(e) => handleSelect('arme_principale_id', e.target.value)}
            disabled={busy}
            className="w-full min-w-0 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
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
            className="w-full min-w-0 px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
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
        <div className="mt-2 flex flex-col gap-3">
          {[['principale', principale], ['secondaire', secondaire]].map(([slot, arme]) => {
            if (!arme) return null;
            const qualite = character[`arme_${slot}_qualite`];
            const bonus = qualite?.bonus || 0;
            const attackLabel = arme.category === 'distance' ? 'Attaque distance' : 'Attaque contact';
            const attackValue = effectiveAttackValue(va, arme, bonus);
            return (
              <div key={slot}>
                <div className="flex items-center gap-2 flex-wrap">
                  <WeaponName baseName={arme.name} qualite={qualite} className="text-lg" />
                  {isGm && (
                    <button
                      type="button"
                      onClick={() => setEditingQualiteSlot((s) => (s === slot ? null : slot))}
                      title="Personnaliser le nom/la rareté/le bonus/les effets de cette arme"
                      className="text-[10px] underline opacity-70 hover:opacity-100"
                    >
                      ✏️ personnaliser
                    </button>
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  {attackLabel} : <strong>{attackValue}</strong> · Dégâts : {armeDamageDisplay(arme, character, bonus)}
                  {arme.notes && <span> ({arme.notes})</span>}
                </p>
                {qualite?.effects && (
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)] whitespace-pre-wrap italic">{qualite.effects}</p>
                )}
                {isGm && editingQualiteSlot === slot && (
                  <WeaponQualiteEditor
                    qualite={qualite}
                    baseName={arme.name}
                    busy={busy}
                    onCancel={() => setEditingQualiteSlot(null)}
                    onSave={(next) => handleSaveQualite(slot, next)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-1 text-sm mt-3 pt-3 border-t border-[var(--border)]">
        <div className="flex gap-4">
          <span>Attaque contact <strong>{va.contact}</strong></span>
          <span>Attaque distance <strong>{va.distance}</strong></span>
          <span>Attaque magique <strong>{va.magique}</strong></span>
        </div>
        {(principale || secondaire) && (
          <p className="text-xs text-[var(--text-secondary)]">
            Valeurs de base, sans le bonus d'une arme magique — voir le total déjà calculé pour chaque arme équipée ci-dessus.
          </p>
        )}
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
  const { busy, adjust } = useStatAdjuster(current, max, onChange);
  const isEmpty = max > 0 && current <= 0;
  const isDown = isEmpty && koLabel;

  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;

  return (
    <div className="cof-vital">
      <div className="cof-plate-head text-center py-1.5">{label}</div>
      <div className="px-2 pt-2 pb-2.5">
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => adjust(-1)}
            disabled={busy || current <= 0}
            className="w-9 h-9 rounded-full border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-30 leading-none shrink-0 text-lg"
          >
            −
          </button>
          <span className={`cof-display font-bold text-base text-center flex-1 min-w-0 ${isDown ? 'text-red-500' : ''}`}>
            {isDown ? 'K.O.' : `${current}/${max}${suffix}`}
          </span>
          <button
            onClick={() => adjust(1)}
            disabled={busy || current >= max}
            className="w-9 h-9 rounded-full border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-30 leading-none shrink-0 text-lg"
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
    </div>
  );
}

// A per-session "destin" d20 (house rule, not a rulebook stat) — the player rolls their own
// physical die at the start of a session and types the result in; breaks initiative ties and
// doubles as a general luck reference. Not current/max like the stats above, so it's a plain
// number input rather than StatAdjuster — editable here by whoever can reach this sheet (the
// owning player or the GM, same access check as every other field on it, enforced backend-side).
function DestinCard({ value, onChange }) {
  return (
    <div className="cof-vital">
      <div className="cof-plate-head text-center py-1.5">🎲 Destin</div>
      <div className="flex items-center justify-center py-2.5">
        <input
          key={value}
          type="number"
          min="1"
          max="20"
          defaultValue={value ?? ''}
          placeholder="—"
          onBlur={(e) => {
            const raw = e.target.value.trim();
            if (!raw) return;
            const n = Math.min(20, Math.max(1, Math.round(Number(raw))));
            if (Number.isFinite(n) && n !== value) onChange(n);
          }}
          className="cof-display w-16 px-1 py-1 text-center text-xl font-bold rounded bg-[var(--bg-input)] border border-[var(--border)]"
        />
      </div>
    </div>
  );
}
