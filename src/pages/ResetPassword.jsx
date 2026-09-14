import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { resetPassword } from '../utils/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Les deux mots de passe ne correspondent pas');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      toast.success('Mot de passe réinitialisé, tu peux te connecter');
      navigate('/login');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <p>Lien invalide — <Link to="/forgot-password" className="text-[var(--accent)] hover:underline">refaire une demande</Link>.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <form
        onSubmit={handleSubmit}
        className="cof-plate w-full max-w-sm p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-4"
      >
        <h1 className="text-2xl font-bold text-[var(--accent)] text-center">Nouveau mot de passe</h1>
        <input
          type="password"
          placeholder="Nouveau mot de passe (8 caractères min.)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-primary)]"
        />
        <input
          type="password"
          placeholder="Confirmer le nouveau mot de passe"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-primary)]"
        />
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
        >
          {submitting ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
        </button>
      </form>
    </div>
  );
}
