import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { changePassword, changeDisplayName, discordLinkInit } from '../utils/api';
import { getDiscordMessage } from '../utils/discordErrors';
import DiscordButton from '../components/DiscordButton';

export default function Account() {
  const { user, loginWithToken } = useAuth();
  const [searchParams] = useSearchParams();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDisplayName(user?.display_name || '');
  }, [user?.display_name]);

  useEffect(() => {
    const code = searchParams.get('discord');
    const message = getDiscordMessage(code);
    if (!message) return;
    if (code === 'linked') toast.success(message);
    else toast.error(message);
  }, [searchParams]);

  const handleSaveName = async (e) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === user?.display_name) return;
    setSavingName(true);
    try {
      const { token } = await changeDisplayName(trimmed);
      await loginWithToken(token);
      toast.success('Nom mis à jour');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingName(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Les deux nouveaux mots de passe ne correspondent pas');
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success('Mot de passe changé');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-sm mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--accent)]">Mon compte</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {user?.display_name} — {user?.email}
          </p>
        </div>

        <form
          onSubmit={handleSaveName}
          className="cof-plate p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-3"
        >
          <h2 className="font-semibold">Nom affiché</h2>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={100}
            className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-primary)]"
          />
          <button
            type="submit"
            disabled={savingName || !displayName.trim() || displayName.trim() === user?.display_name}
            className="self-start px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
          >
            {savingName ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </form>

        <form
          onSubmit={handleSubmit}
          className="cof-plate p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-4"
        >
          <h2 className="font-semibold">Changer de mot de passe</h2>
          <input
            type="password"
            placeholder="Mot de passe actuel"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-primary)]"
          />
          <input
            type="password"
            placeholder="Nouveau mot de passe (8 caractères min.)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
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
            {submitting ? 'Changement...' : 'Changer le mot de passe'}
          </button>
        </form>

        <div className="cof-plate p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-3">
          <h2 className="font-semibold">Compte Discord</h2>
          {user?.discord_id ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Lié à <strong className="text-[var(--text-primary)]">{user.discord_username}</strong>
            </p>
          ) : (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                Lie ton compte Discord pour te connecter en un clic la prochaine fois.
              </p>
              <DiscordButton label="Lier mon compte Discord" fetchUrl={discordLinkInit} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
