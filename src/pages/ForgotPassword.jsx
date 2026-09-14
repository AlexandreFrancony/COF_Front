import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { forgotPassword } from '../utils/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="cof-plate w-full max-w-sm p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-[var(--accent)] text-center">Mot de passe oublié</h1>

        {sent ? (
          <p className="text-sm text-[var(--text-secondary)] text-center">
            Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé. Pense à vérifier tes spams.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-primary)]"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              {submitting ? 'Envoi...' : 'Envoyer le lien de réinitialisation'}
            </button>
          </form>
        )}

        <Link to="/login" className="text-sm text-center text-[var(--text-secondary)] hover:text-[var(--accent)]">
          ← Retour à la connexion
        </Link>
      </div>
    </div>
  );
}
