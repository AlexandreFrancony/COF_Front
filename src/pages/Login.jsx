import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { discordLoginInit } from '../utils/api';
import { getDiscordMessage } from '../utils/discordErrors';
import DiscordButton from '../components/DiscordButton';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const message = getDiscordMessage(searchParams.get('discord'));
    if (message) toast.error(message);
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate('/');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <form
        onSubmit={handleSubmit}
        className="cof-plate w-full max-w-sm p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-4"
      >
        <h1 className="text-2xl font-bold text-[var(--accent)] text-center">COF — Connexion</h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-primary)]"
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-primary)]"
        />

        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
        >
          {submitting ? 'Connexion...' : 'Se connecter'}
        </button>

        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <div className="flex-1 h-px bg-[var(--border)]" />
          ou
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        <DiscordButton label="Se connecter avec Discord" fetchUrl={discordLoginInit} />

        <Link to="/forgot-password" className="text-sm text-center text-[var(--text-secondary)] hover:text-[var(--accent)]">
          Mot de passe oublié ?
        </Link>
      </form>
    </div>
  );
}
