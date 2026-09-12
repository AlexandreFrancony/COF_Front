import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getCampaigns, createCampaign } from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function Campaigns() {
  const { isGm } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      setCampaigns(await getCampaigns());
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createCampaign({ name, description });
      setName('');
      setDescription('');
      setShowForm(false);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--accent)]">Campagnes</h1>
          {isGm && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] text-sm"
            >
              {showForm ? 'Annuler' : '+ Nouvelle campagne'}
            </button>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-3"
          >
            <input
              type="text"
              placeholder="Nom de la campagne"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
            />
            <textarea
              placeholder="Description (optionnel)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
            />
            <button
              type="submit"
              disabled={submitting}
              className="self-start px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {submitting ? 'Création...' : 'Créer'}
            </button>
          </form>
        )}

        {campaigns.length === 0 ? (
          <p className="text-[var(--text-secondary)]">Aucune campagne pour l'instant.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/campaigns/${c.id}`}
                  className="block p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                >
                  <h2 className="font-semibold text-[var(--accent)]">{c.name}</h2>
                  {c.description && (
                    <p className="text-sm text-[var(--text-secondary)] mt-1">{c.description}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
