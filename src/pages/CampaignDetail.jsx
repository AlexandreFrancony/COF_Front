import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getCampaign, getCampaignCharacters, getCampaignInvites, createInvite, revokeInvite,
  getCampaignScenarios, createScenario, updateScenario, deleteScenario,
  createScenarioToken, updateScenarioToken, deleteScenarioToken, launchScenario, getBoardMedia,
  createCharacter, deleteCharacter,
} from '../utils/api';
import { useAuth } from '../context/AuthContext';
import BoardCanvas from '../components/BoardCanvas';

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

  const handleSetScenarioBackground = async (scenarioId, backgroundMediaId) => {
    try {
      const updated = await updateScenario(scenarioId, { background_media_id: backgroundMediaId });
      setScenarios((prev) => prev.map((s) => (s.id === scenarioId ? updated : s)));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleAddScenarioToken = async (scenarioId, data) => {
    try {
      const updated = await createScenarioToken(scenarioId, data);
      setScenarios((prev) => prev.map((s) => (s.id === scenarioId ? updated : s)));
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Optimistic: the mini prep-board's drag-end already knows the final x/y, no need to wait
  // for the round-trip before the token visually settles (same pattern as the live board).
  const handleMoveScenarioToken = async (scenarioId, tokenId, x, y) => {
    setScenarios((prev) => prev.map((s) => (
      s.id === scenarioId ? { ...s, tokens: s.tokens.map((t) => (t.id === tokenId ? { ...t, x, y } : t)) } : s
    )));
    try {
      await updateScenarioToken(tokenId, { x, y });
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleToggleScenarioTokenVisible = async (scenarioId, token) => {
    try {
      const updated = await updateScenarioToken(token.id, { visible_to_players: !token.visible_to_players });
      setScenarios((prev) => prev.map((s) => (
        s.id === scenarioId ? { ...s, tokens: s.tokens.map((t) => (t.id === token.id ? updated : t)) } : s
      )));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleDeleteScenarioToken = async (scenarioId, tokenId) => {
    try {
      await deleteScenarioToken(tokenId);
      setScenarios((prev) => prev.map((s) => (
        s.id === scenarioId ? { ...s, tokens: s.tokens.filter((t) => t.id !== tokenId) } : s
      )));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleLaunchScenario = async (scenarioId) => {
    try {
      const { tokens_added } = await launchScenario(scenarioId);
      toast.success(`Scénario lancé — ${tokens_added} pion(s) ajouté(s) au plateau`);
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
                    className="flex-1 block p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-sm text-[var(--text-secondary)] ml-2">
                      {c.is_npc ? 'PNJ' : c.user_id ? `Niveau ${c.level}` : 'Pas encore invité'}
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
                    characters={characters}
                    mediaLibrary={mediaLibrary}
                    onSaveNotes={(notes) => handleUpdateScenarioNotes(s.id, notes)}
                    onDelete={() => handleDeleteScenario(s.id)}
                    onSetBackground={(mediaId) => handleSetScenarioBackground(s.id, mediaId)}
                    onAddToken={(data) => handleAddScenarioToken(s.id, data)}
                    onMoveToken={(tokenId, x, y) => handleMoveScenarioToken(s.id, tokenId, x, y)}
                    onToggleTokenVisible={(token) => handleToggleScenarioTokenVisible(s.id, token)}
                    onDeleteToken={(tokenId) => handleDeleteScenarioToken(s.id, tokenId)}
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
      </div>
    </div>
  );
}

// A scenario bundles prep notes with an optional background (picked from the shared board_media
// library) and a set of prepared tokens, laid out ahead of time on a small read-only-sized
// preview of that background (reuses BoardCanvas — same drag-to-position feel as the live
// board, just without grid/zones/camera, which don't make sense while merely prepping). None of
// this touches the live board until "Lancer" is clicked (additive: background + tokens get
// copied onto the real board_states/board_tokens, nothing already there is ever cleared).
function ScenarioItem({
  scenario, characters, mediaLibrary, onSaveNotes, onDelete,
  onSetBackground, onAddToken, onMoveToken, onToggleTokenVisible, onDeleteToken, onLaunch,
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(scenario.notes || '');
  const [newTokenLabel, setNewTokenLabel] = useState('');
  const [selectedToken, setSelectedToken] = useState(null);

  const previewBoard = { background_url: scenario.background_url, background_type: scenario.background_type, tokens: scenario.tokens, zones: [] };
  const tokenlessCharacters = characters.filter((c) => !scenario.tokens.some((t) => t.character_id === c.id));

  const handleAddToken = (e) => {
    e.preventDefault();
    if (!newTokenLabel.trim()) return;
    onAddToken({ label: newTokenLabel.trim() });
    setNewTokenLabel('');
  };

  // Shared between the small inline preview and the enlarged modal (only one renders at a
  // time) — the canvas itself is identical, it just ends up bigger inside the modal's wider
  // max-w-5xl container versus the narrow inline card.
  const prepBoard = () => (
    <>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[var(--text-secondary)]">Fond :</span>
        <select
          value={scenario.background_media_id || ''}
          onChange={(e) => onSetBackground(Number(e.target.value))}
          className="flex-1 px-2 py-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
        >
          <option value="" disabled>Choisir dans la bibliothèque...</option>
          {mediaLibrary.map((m) => (
            <option key={m.id} value={m.id}>{m.label || m.url}</option>
          ))}
        </select>
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            title="Ouvrir en plus grand pour positionner les pions plus précisément"
            className="shrink-0 px-2 py-1 text-xs rounded-lg border border-[var(--border)] hover:border-[var(--accent)]"
          >
            ⛶ Agrandir
          </button>
        )}
      </div>

      <div className="rounded-lg overflow-hidden border border-[var(--border)]" style={{ aspectRatio: '16 / 9' }}>
        <BoardCanvas
          board={previewBoard}
          isGm
          className="relative w-full h-full bg-[var(--bg-input)]"
          selectedToken={selectedToken}
          onSelectToken={setSelectedToken}
          onTokenDragEnd={(tokenId, x, y) => onMoveToken(tokenId, x, y)}
          onBackgroundClick={() => setSelectedToken(null)}
        />
      </div>

      {selectedToken && (
        <div className="flex items-center gap-3 text-xs px-2 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]">
          <span className="font-medium flex-1">{selectedToken.label}</span>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={selectedToken.visible_to_players}
              onChange={() => { onToggleTokenVisible(selectedToken); setSelectedToken(null); }}
            />
            Visible aux joueurs
          </label>
          <button
            onClick={() => { onDeleteToken(selectedToken.id); setSelectedToken(null); }}
            className="text-red-500 hover:underline"
          >
            Supprimer ce pion
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {tokenlessCharacters.map((c) => (
          <button
            key={c.id}
            onClick={() => onAddToken({ label: c.name, character_id: c.id })}
            className="px-2 py-1 rounded border border-[var(--border)] hover:border-[var(--accent)]"
          >
            + {c.name}
          </button>
        ))}
        <form onSubmit={handleAddToken} className="flex gap-1">
          <input
            type="text"
            placeholder="Nom du pion (PNJ)"
            value={newTokenLabel}
            onChange={(e) => setNewTokenLabel(e.target.value)}
            className="px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)]"
          />
          <button type="submit" className="px-2 py-1 rounded border border-[var(--border)] hover:border-[var(--accent)]">
            Ajouter un pion
          </button>
        </form>
      </div>
    </>
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
          {!expanded && prepBoard()}
        </div>
      )}

      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setExpanded(false)}
        >
          <div
            className="w-full max-w-5xl flex flex-col gap-3 p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]"
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
            {prepBoard()}
          </div>
        </div>
      )}
    </div>
  );
}
