import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { openGlossaire, isPlainLeftClick } from '../utils/openGlossaire';

export default function Layout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg-header)]">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/campaigns" className="font-bold text-[var(--accent)]">
            COF — Site MJ
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <a
              href="/glossaire"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!isPlainLeftClick(e)) return;
                e.preventDefault();
                openGlossaire('/glossaire');
              }}
              className="text-[var(--text-secondary)] hover:text-[var(--accent)]"
            >
              📖 Glossaire
            </a>
            <span className="text-[var(--text-secondary)]">{user?.display_name}</span>
            <button onClick={logout} className="text-[var(--accent)] hover:underline">
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
