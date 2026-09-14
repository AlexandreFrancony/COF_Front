import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getCampaign, getCampaignCharacters, getCampaignInvites, createInvite, revokeInvite,
  getCampaignScenarios, createScenario, updateScenario, deleteScenario,
  createScenarioToken, updateScenarioToken, deleteScenarioToken,
  createScenarioZone, updateScenarioZone, deleteScenarioZone,
  launchScenario, getBoardMedia, uploadBoardMedia, deleteBoardMedia, uploadBoardImage,
  createCharacter, deleteCharacter, updateCampaign,
} from '../utils/api';
import { useAuth } from '../context/AuthContext';
import BoardEditor from '../components/BoardEditor';
import NotesPanel from '../components/NotesPanel';

// mailto: needs no SMTP setup — it just opens the GM's own mail client with the message
// pre-filled, ready to send.
function mailtoInviteHref(characterName, campaignName, url) {
  const subject = `Invitation à rejoindre ${campaignName}`;
  const body = `Salut !\n\nTu es invité(e) à incarner ${characterName} dans la campagne ${campaignName}.\nClique sur ce lien pour rejoindre : ${url}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isGm } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [invites, setInvites] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [mediaLibrary, setMediaLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [characterName, setCharacterName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState(null);
  const [scenarioName, setScenarioName] = useState('');
  const [newCharName, setNewCharName] = useState('');
  const [newCharIsNpc, setNewCharIsNpc] = useState(false);
  const [creatingChar, setCreatingChar] = useState(false);
  const [inviteMode, setInviteMode] = useState('new'); // 'new' | 'existing'
  const [inviteCharacterId, setInviteCharacterId] = useState('');

  const load = async () => {
    try {
      const [campaignData, charactersData] = await Promise.all([
        getCampaign(id),
        getCampaignCharacters(id),
      ]);
      setCampaign(campaignData);
      setCharacters(charactersData);
      if (isGm) {
        setInvites(await getCampaignInvites(id));
        setScenarios(await getCampaignScenarios(id));
        setMediaLibrary(await getBoardMedia());
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSaveWebhook = async (url) => {
    const trimmed = url.trim();
    if (trimmed === (campaign.discord_webhook_url || '')) return;
    try {
      await updateCampaign(id, { discord_webhook_url: trimmed || null });
      await load();
      toast.success(trimmed ? 'Webhook Discord enregistré' : 'Webhook Discord retiré');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleCreateInvite = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = inviteMode === 'existing'
        ? { character_id: inviteCharacterId }
        : { character_name: characterName };
      const { invite_url, character } = await createInvite(id, payload);
      setLastInviteUrl({ url: invite_url, characterName: character.name });
      setCharacterName('');
      setInviteCharacterId('');
      await load();
      toast.success('Invitation créée');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCharacter = async (e) => {
    e.preventDefault();
    if (!newCharName.trim()) return;
    setCreatingChar(true);
    try {
      const created = await createCharacter(id, { name: newCharName.trim(), is_npc: newCharIsNpc });
      navigate(`/characters/${created.id}`);
    } catch (error) {
      toast.error(error.message);
      setCreatingChar(false);
    }
  };

  const handleDeleteCharacter = async (character) => {
    if (!window.confirm(`Supprimer ${character.name} ? Cette action est définitive.`)) return;
    try {
      await deleteCharacter(character.id);
      setCharacters((prev) => prev.filter((c) => c.id !== character.id));
      toast.success('Personnage supprimé');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const copyInvite = (url) => {
    navigator.clipboard.writeText(url);
    toast.success('Lien copié');
  };

  const handleRevoke = async (inviteId) => {
    try {
      await revokeInvite(id, inviteId);
      await load();
      toast.success('Invitation révoquée');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleCreateScenario = async (e) => {
    e.preventDefault();
    try {
      const created = await createScenario(id, { name: scenarioName });
      setScenarios((prev) => [...prev, created]);
      setScenarioName('');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleUpdateScenarioNotes = async (scenarioId, notes) => {
    try {
      const updated = await updateScenario(scenarioId, { notes });
      setScenarios((prev) => prev.map((s) => (s.id === scenarioId ? updated : s)));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleDeleteScenario = async (scenarioId) => {
    try {
      await deleteScenario(scenarioId);
      setScenarios((prev) => prev.filter((s) => s.id !== scenarioId));
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Every scenario-scoped mutation (background, grid, token size, tokens, zones — see
  // ScenarioItem/BoardEditor) resolves with the full updated scenario, same contract as the
  // live board's own handlers resolving with the full board. One generic setter covers all of them.
  const handleScenarioChange = (updated) => {
    setScenarios((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleLaunchScenario = async (scenarioId) => {
    try {
      const { tokens_added, zones_added } = await launchScenario(scenarioId);
      toast.success(`Scénario lancé — ${tokens_added} pion(s) et ${zones_added} zone(s) ajoutés au plateau`);
      navigate(`/campaigns/${id}/board`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (loading || !campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link to="/campaigns" className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)]">
            ← Campagnes
          </Link>
          <div className="flex items-center justify-between gap-3 mt-1">
            <h1 className="text-2xl font-bold text-[var(--accent)]">{campaign.name}</h1>
            <div className="flex gap-2 shrink-0">
              <Link
                to={`/campaigns/${id}/history`}
                className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] hover:border-[var(--accent)]"
              >
                Historique
              </Link>
              <Link
                to={`/campaigns/${id}/board`}
                className="px-3 py-1.5 text-sm rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
              >
                Plateau
              </Link>
            </div>
          </div>
          {campaign.description && (
            <p className="text-[var(--text-secondary)] mt-1">{campaign.description}</p>
          )}
        </div>

        <NotesPanel campaignId={id} />

        <section>
          <h2 className="font-semibold mb-2">Personnages</h2>
          {characters.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Aucun personnage pour l'instant.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {characters.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <Link
                    to={`/characters/${c.id}`}
                    className="flex-1 flex items-center gap-2 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                  >
                    <span
                      className="w-8 h-8 shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-input)] bg-cover bg-center flex items-center justify-center"
                      style={{ backgroundImage: c.avatar_url ? `url(${c.avatar_url})` : undefined }}
                    >
                      {!c.avatar_url && (c.avatar_emoji || null)}
                    </span>
                    <span>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-sm text-[var(--text-secondary)] ml-2">
                        {c.is_npc ? 'PNJ' : c.user_id ? `Niveau ${c.level}` : 'Pas encore invité'}
                      </span>
                    </span>
                  </Link>
                  {isGm && (
                    <button
                      onClick={() => handleDeleteCharacter(c)}
                      className="shrink-0 text-xs px-2 py-1 rounded border border-red-400 text-red-500 hover:bg-red-500/10"
                    >
                      Supprimer
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {isGm && (
          <section>
            <h2 className="font-semibold mb-2">Créer un personnage</h2>
            <p className="text-xs text-[var(--text-secondary)] mb-2">
              Pour préparer un PJ à l'avance (à inviter ensuite) ou créer un PNJ que tu contrôles seul en combat.
            </p>
            <form onSubmit={handleCreateCharacter} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Nom du personnage"
                value={newCharName}
                onChange={(e) => setNewCharName(e.target.value)}
                required
                className="flex-1 min-w-[160px] px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
              />
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={newCharIsNpc} onChange={(e) => setNewCharIsNpc(e.target.checked)} />
                PNJ
              </label>
              <button
                type="submit"
                disabled={creatingChar}
                className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                Créer et construire la fiche
              </button>
            </form>
          </section>
        )}

        {isGm && (
          <section>
            <h2 className="font-semibold mb-2">Scénarios</h2>
            <form onSubmit={handleCreateScenario} className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Nom du scénario"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                required
                className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
              >
                Ajouter
              </button>
            </form>

            {scenarios.length > 0 && (
              <div className="flex flex-col gap-2">
                {scenarios.map((s) => (
                  <ScenarioItem
                    key={s.id}
                    scenario={s}
                    campaignId={id}
                    characters={characters}
                    mediaLibrary={mediaLibrary}
                    onMediaLibraryChange={setMediaLibrary}
                    onSaveNotes={(notes) => handleUpdateScenarioNotes(s.id, notes)}
                    onDelete={() => handleDeleteScenario(s.id)}
                    onScenarioChange={handleScenarioChange}
                    onLaunch={() => handleLaunchScenario(s.id)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {isGm && (
          <section>
            <h2 className="font-semibold mb-2">Inviter un joueur</h2>

            <div className="flex gap-2 mb-2 text-sm">
              <button
                type="button"
                onClick={() => setInviteMode('new')}
                className={`px-2 py-1 rounded border ${inviteMode === 'new' ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'}`}
              >
                Nouveau personnage
              </button>
              <button
                type="button"
                onClick={() => setInviteMode('existing')}
                className={`px-2 py-1 rounded border ${inviteMode === 'existing' ? 'border-[var(--accent)] bg-[var(--bg-input)]' : 'border-[var(--border)]'}`}
              >
                Personnage déjà créé
              </button>
            </div>

            <form onSubmit={handleCreateInvite} className="flex gap-2 mb-3">
              {inviteMode === 'existing' ? (
                <select
                  value={inviteCharacterId}
                  onChange={(e) => setInviteCharacterId(e.target.value)}
                  required
                  className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
                >
                  <option value="" disabled>Choisir un personnage...</option>
                  {characters
                    .filter((c) => !c.user_id && !c.is_npc && !invites.some((inv) => inv.character_id === c.id && inv.status === 'pending'))
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Nom du personnage"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  required
                  className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
                />
              )}
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                Créer le lien
              </button>
            </form>

            {lastInviteUrl && (
              <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--accent)] flex items-center justify-between gap-2 mb-3">
                <code className="text-sm break-all">{lastInviteUrl.url}</code>
                <span className="flex gap-2 shrink-0">
                  <a
                    href={mailtoInviteHref(lastInviteUrl.characterName, campaign.name, lastInviteUrl.url)}
                    className="px-2 py-1 text-sm rounded border border-[var(--border)] hover:border-[var(--accent)]"
                  >
                    Par email
                  </a>
                  <button
                    onClick={() => copyInvite(lastInviteUrl.url)}
                    className="px-2 py-1 text-sm rounded bg-[var(--accent)] text-white"
                  >
                    Copier
                  </button>
                </span>
              </div>
            )}

            {invites.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-sm">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-2 text-[var(--text-secondary)]">
                    <span>
                      {inv.character_name} —{' '}
                      <span className={inv.status === 'accepted' ? 'text-[var(--positive)]' : 'text-[var(--warning)]'}>
                        {inv.status === 'accepted' ? 'acceptée' : 'en attente'}
                      </span>
                    </span>
                    {inv.status === 'pending' && (
                      <span className="flex gap-2 shrink-0">
                        <a
                          href={mailtoInviteHref(inv.character_name, campaign.name, `${window.location.origin}/invites/${inv.token}`)}
                          className="text-xs px-2 py-0.5 rounded border border-[var(--border)] hover:border-[var(--accent)]"
                        >
                          Par email
                        </a>
                        <button
                          onClick={() => copyInvite(`${window.location.origin}/invites/${inv.token}`)}
                          className="text-xs px-2 py-0.5 rounded border border-[var(--border)] hover:border-[var(--accent)]"
                        >
                          Copier
                        </button>
                        <button
                          onClick={() => handleRevoke(inv.id)}
                          className="text-xs px-2 py-0.5 rounded border border-red-400 text-red-500 hover:bg-red-500/10"
                        >
                          Révoquer
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {isGm && (
          <section>
            <h2 className="font-semibold mb-2">Notifications Discord</h2>
            <p className="text-xs text-[var(--text-secondary)] mb-2">
              Colle l'URL d'un webhook Discord (salon → Paramètres → Intégrations → Webhooks) pour recevoir un
              message quand un personnage monte de niveau ou tombe à 0 PV.
            </p>
            <input
              type="url"
              defaultValue={campaign.discord_webhook_url || ''}
              onBlur={(e) => handleSaveWebhook(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-sm"
            />
          </section>
        )}
      </div>
    </div>
  );
}

// A scenario is a full mini board_states — background, grid, token size, tokens and zones — kept
// separate from the campaign's live board until "Lancer" copies it over (additive only: nothing
// already on the live board is ever cleared). It shares BoardEditor with the real Board.jsx page
// instead of a stripped-down reimplementation, so prep never drifts out of feature parity with
// the live board — the same toolbar, canvas and side panel, just pointed at scenario-scoped
// endpoints (see the handlers below) instead of the live board's.
function ScenarioItem({
  scenario, campaignId, characters, mediaLibrary, onMediaLibraryChange,
  onSaveNotes, onDelete, onScenarioChange, onLaunch,
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(scenario.notes || '');

  // Every successful mutation below applies the fresh scenario to the parent's list — same
  // "handler resolves with the full updated object" contract BoardEditor already expects from
  // the live board's own handlers.
  const apply = (promise) => promise.then((updated) => { onScenarioChange(updated); return updated; });
  const applyOrToast = (promise) => apply(promise).catch((error) => toast.error(error.message));
  // onAddZone/onPatchZone must never throw (BoardEditor reads .zones off whatever they resolve
  // to, to auto-select the new/patched zone) — on failure, toast and hand back the unchanged
  // scenario instead, exactly like Board.jsx's own handleAddZone/handlePatchZone do for the live board.
  const applyOrFallback = (promise) => apply(promise).catch((error) => { toast.error(error.message); return scenario; });

  const handleUploadBackground = async (file) => {
    try {
      const media = await uploadBoardMedia(file);
      onMediaLibraryChange((prev) => [media, ...prev]);
      await applyOrToast(updateScenario(scenario.id, { background_media_id: media.id }));
    } catch (error) {
      toast.error(error.message);
    }
  };
  const handlePickBackground = (media) => applyOrToast(updateScenario(scenario.id, { background_media_id: media.id }));
  const handleDeleteMedia = async (media) => {
    try {
      await deleteBoardMedia(media.id);
      onMediaLibraryChange((prev) => prev.filter((m) => m.id !== media.id));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleToggleGrid = () => applyOrToast(updateScenario(scenario.id, { grid_visible: !(scenario.grid_visible ?? false) }));
  const handleTokenSize = (delta) => applyOrToast(updateScenario(scenario.id, { token_size_delta: delta }));

  const handleAddToken = (label, hpMax) => applyOrToast(createScenarioToken(scenario.id, { label, hp_max: hpMax }));
  const handleTokenHpChange = (tokenId, delta) => applyOrFallback(updateScenarioToken(tokenId, { hp_delta: delta }));
  const handleAddCharacterToken = (character) =>
    applyOrToast(createScenarioToken(scenario.id, { label: character.name, character_id: character.id }));
  const handleMoveToken = (tokenId, x, y) => applyOrToast(updateScenarioToken(tokenId, { x, y }));
  const handleToggleTokenVisible = (token) =>
    applyOrToast(updateScenarioToken(token.id, { visible_to_players: !token.visible_to_players }));
  const handleDeleteToken = (token) => applyOrToast(deleteScenarioToken(token.id));
  const handleUploadTokenImage = async (token, file) => {
    try {
      const { url } = await uploadBoardImage(campaignId, file);
      await applyOrToast(updateScenarioToken(token.id, { image_url: url }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleAddZone = (shape) => applyOrFallback(createScenarioZone(scenario.id, { shape }));
  const handleMoveZone = (zoneId, x, y) => applyOrToast(updateScenarioZone(zoneId, { x, y }));
  const handlePatchZone = (zoneId, data) => applyOrFallback(updateScenarioZone(zoneId, data));
  const handleDeleteZone = (zone) => applyOrToast(deleteScenarioZone(zone.id));

  const boardEditor = (
    <BoardEditor
      board={scenario}
      characters={characters}
      mediaLibrary={mediaLibrary}
      onUploadBackground={handleUploadBackground}
      onPickBackground={handlePickBackground}
      onDeleteMedia={handleDeleteMedia}
      onToggleGrid={handleToggleGrid}
      onTokenSize={handleTokenSize}
      onAddToken={handleAddToken}
      onAddCharacterToken={handleAddCharacterToken}
      onMoveToken={handleMoveToken}
      onToggleTokenVisible={handleToggleTokenVisible}
      onDeleteToken={handleDeleteToken}
      onUploadTokenImage={handleUploadTokenImage}
      onTokenHpChange={handleTokenHpChange}
      onAddZone={handleAddZone}
      onMoveZone={handleMoveZone}
      onPatchZone={handlePatchZone}
      onDeleteZone={handleDeleteZone}
      withCamera={false}
    />
  );

  return (
    <div className="rounded-lg bg-[var(--bg-card)] border border-[var(--border)] p-3">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setOpen((o) => !o)} className="font-medium text-left hover:text-[var(--accent)]">
          {scenario.name}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onLaunch}
            className="text-xs px-2 py-0.5 rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
            title="Applique le fond et ajoute les pions préparés au plateau en direct"
          >
            🚀 Lancer
          </button>
          <button
            onClick={onDelete}
            className="text-xs px-2 py-0.5 rounded border border-red-400 text-red-500 hover:bg-red-500/10"
          >
            Supprimer
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => onSaveNotes(notes)}
            placeholder="Notes de préparation..."
            rows={4}
            className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
          />
          {!expanded && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-end">
                <button
                  onClick={() => setExpanded(true)}
                  title="Ouvrir en plus grand pour positionner les pions/zones plus précisément"
                  className="px-2 py-1 text-xs rounded-lg border border-[var(--border)] hover:border-[var(--accent)]"
                >
                  ⛶ Agrandir
                </button>
              </div>
              {boardEditor}
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            className="w-[96vw] max-h-[95vh] overflow-y-auto flex flex-col gap-3 p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{scenario.name} — préparation</h3>
              <button
                onClick={() => setExpanded(false)}
                className="px-2 py-1 text-xs rounded-lg border border-[var(--border)] hover:border-[var(--accent)]"
              >
                ✕ Fermer
              </button>
            </div>
            {boardEditor}
          </div>
        </div>
      )}
    </div>
  );
}
