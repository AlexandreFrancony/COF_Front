import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getInvite, acceptInvite, discordInviteInit } from '../utils/api';
import { setToken } from '../utils/storage';
import { useAuth } from '../context/AuthContext';
import { getDiscordMessage } from '../utils/discordErrors';
import DiscordButton from '../components/DiscordButton';

export default function InviteAccept() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAuthenticated, refresh } = useAuth();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getInvite(token)
      .then(setInvite)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    const message = getDiscordMessage(searchParams.get('discord'));
    if (message) toast.error(message);
  }, [searchParams]);

  const claim = async (data) => {
    setSubmitting(true);
    try {
      const result = await acceptInvite(token, data);
      // Already logged in: the request carried our existing token and the server just
      // echoes it back — no need to overwrite it, refresh() alone picks up the new character.
      if (result.token) setToken(result.token);
      await refresh();
      toast.success('Bienvenue dans la campagne !');
      navigate('/');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaimAsSelf = () => claim({});
  const handleSubmit = (e) => {
    e.preventDefault();
    claim({ email, password, display_name: displayName });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <p>{error || 'Invitation introuvable'}</p>
      </div>
    );
  }

  if (invite.status === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <p>Cette invitation a déjà été utilisée.</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="cof-plate w-full max-w-sm p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-4 text-center">
          <div>
            <h1 className="text-2xl font-bold text-[var(--accent)]">Rejoindre {invite.campaign_name}</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Personnage : <strong>{invite.character_name}</strong>
            </p>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Connecté en tant que <strong>{user.display_name}</strong> — ce personnage sera ajouté à ton compte.
          </p>
          <button
            onClick={handleClaimAsSelf}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {submitting ? 'Ajout...' : `Rejoindre avec ${user.display_name}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <form
        onSubmit={handleSubmit}
        className="cof-plate w-full max-w-sm p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-4"
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--accent)]">Rejoindre {invite.campaign_name}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Personnage : <strong>{invite.character_name}</strong>
          </p>
        </div>

        <DiscordButton label="Continuer avec Discord" fetchUrl={() => discordInviteInit(token)} />

        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <div className="flex-1 h-px bg-[var(--border)]" />
          ou par email
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        <p className="text-xs text-[var(--text-secondary)] -mt-2">
          Déjà un compte sur le site ? Entre son email et son mot de passe pour ajouter ce personnage à ta liste.
        </p>

        <input
          type="text"
          placeholder="Votre nom (si nouveau compte)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
        />

        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {submitting ? 'Connexion...' : 'Rejoindre la campagne'}
        </button>
      </form>
    </div>
  );
}
