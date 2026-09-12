import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getCampaign, getCampaignCharacters, getCampaignInvites, createInvite, revokeInvite,
  getCampaignScenarios, createScenario, updateScenario, deleteScenario,
} from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function CampaignDetail() {
  const { id } = useParams();
  const { isGm } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [invites, setInvites] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [characterName, setCharacterName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState(null);
  const [scenarioName, setScenarioName] = useState('');

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
      const { invite_url } = await createInvite(id, { character_name: characterName });
      setLastInviteUrl(invite_url);
      setCharacterName('');
      await load();
      toast.success('Invitation créée');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
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
            <Link
              to={`/campaigns/${id}/board`}
              className="shrink-0 px-3 py-1.5 text-sm rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
            >
              Plateau
            </Link>
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
                <li key={c.id}>
                  <Link
                    to={`/characters/${c.id}`}
                    className="block p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-sm text-[var(--text-secondary)] ml-2">
                      {c.user_id ? `Niveau ${c.level}` : 'En attente d\'un joueur'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

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
                    onSaveNotes={(notes) => handleUpdateScenarioNotes(s.id, notes)}
                    onDelete={() => handleDeleteScenario(s.id)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {isGm && (
          <section>
            <h2 className="font-semibold mb-2">Inviter un joueur</h2>
            <form onSubmit={handleCreateInvite} className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Nom du personnage"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                required
                className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
              />
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
                <code className="text-sm break-all">{lastInviteUrl}</code>
                <button
                  onClick={() => copyInvite(lastInviteUrl)}
                  className="shrink-0 px-2 py-1 text-sm rounded bg-[var(--accent)] text-white"
                >
                  Copier
                </button>
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

function ScenarioItem({ scenario, onSaveNotes, onDelete }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(scenario.notes || '');

  return (
    <div className="rounded-lg bg-[var(--bg-card)] border border-[var(--border)] p-3">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setOpen((o) => !o)} className="font-medium text-left hover:text-[var(--accent)]">
          {scenario.name}
        </button>
        <button
          onClick={onDelete}
          className="text-xs px-2 py-0.5 rounded border border-red-400 text-red-500 hover:bg-red-500/10 shrink-0"
        >
          Supprimer
        </button>
      </div>
      {open && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => onSaveNotes(notes)}
          placeholder="Notes de préparation..."
          rows={4}
          className="w-full mt-2 px-3 py-2 text-sm rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
        />
      )}
    </div>
  );
}
