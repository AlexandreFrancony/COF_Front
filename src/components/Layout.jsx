import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { openGlossaire, isPlainLeftClick } from '../utils/openGlossaire';

// The Discord avatar CDN path is duplicated from CharacterAvatar's own use of it — no shared
// home for it yet, not worth extracting for two call sites.
function ProfileIcon({ user }) {
  const avatarUrl = user?.discord_id && user?.discord_avatar_hash
    ? `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.discord_avatar_hash}.png?size=64`
    : null;

  return (
    <Link
      to="/compte"
      title={user?.display_name}
      className="w-8 h-8 rounded-full border border-[var(--border)] bg-[var(--bg-input)] overflow-hidden shrink-0 flex items-center justify-center hover:border-[var(--accent)] bg-cover bg-center"
      style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
    >
      {!avatarUrl && <span className="text-base leading-none">👤</span>}
    </Link>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-header)]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
          <Link
            to="/campaigns"
            className="cof-display font-semibold tracking-wide text-[var(--accent)] whitespace-nowrap text-base sm:text-lg"
          >
            As I've Written
          </Link>
          <div className="flex items-center gap-3 text-sm shrink-0">
            <a
              href="/glossaire"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!isPlainLeftClick(e)) return;
                e.preventDefault();
                openGlossaire('/glossaire');
              }}
              title="Glossaire"
              className="text-[var(--text-secondary)] hover:text-[var(--accent)] text-lg leading-none"
            >
              📖
            </a>
            <ProfileIcon user={user} />
            <button onClick={logout} title="Déconnexion" className="text-[var(--accent)] hover:underline whitespace-nowrap">
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
