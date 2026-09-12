import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getCampaign, getCampaignCharacters, getCampaignInvites, createInvite,
} from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function CampaignDetail() {
  const { id } = useParams();
  const { isGm } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [characterName, setCharacterName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState(null);

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
          <h1 className="text-2xl font-bold text-[var(--accent)] mt-1">{campaign.name}</h1>
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
              <ul className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
                {invites.map((inv) => (
                  <li key={inv.id}>
                    {inv.character_name} —{' '}
                    <span className={inv.status === 'accepted' ? 'text-[var(--positive)]' : 'text-[var(--warning)]'}>
                      {inv.status === 'accepted' ? 'acceptée' : 'en attente'}
                    </span>
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
