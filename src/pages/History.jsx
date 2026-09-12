import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { getCampaign, getCampaignEvents, createEvent } from '../utils/api';

const TYPE_LABELS = {
  pv_change: 'PV', pm_change: 'PM', voie_added: 'Voie', voie_rang_up: 'Voie',
  level_up: 'Niveau', orphan_exchange: 'Point orphelin', note: 'Note',
};

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function History() {
  const { id: campaignId } = useParams();
  const { isGm } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [events, setEvents] = useState([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const [campaignData, eventsData] = await Promise.all([
        getCampaign(campaignId),
        getCampaignEvents(campaignId),
      ]);
      setCampaign(campaignData);
      setEvents(eventsData);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setSubmitting(true);
    try {
      const created = await createEvent(campaignId, note.trim());
      setEvents((prev) => [created, ...prev]);
      setNote('');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
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
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        <div>
          <Link to={`/campaigns/${campaignId}`} className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)]">
            ← {campaign.name}
          </Link>
          <h1 className="text-2xl font-bold text-[var(--accent)] mt-1">Historique</h1>
        </div>

        {isGm && (
          <form onSubmit={handleAddNote} className="flex gap-2">
            <input
              type="text"
              placeholder="Ajouter une note (événement narratif, etc.)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              Ajouter
            </button>
          </form>
        )}

        {events.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Aucun événement pour l'instant.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {events.map((e) => (
              <li
                key={e.id}
                className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm flex items-start justify-between gap-3"
              >
                <span>
                  <span className="text-xs text-[var(--accent)] mr-1.5">[{TYPE_LABELS[e.type] || e.type}]</span>
                  {e.message}
                </span>
                <span className="shrink-0 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                  {formatTimestamp(e.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
