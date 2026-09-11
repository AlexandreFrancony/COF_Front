import { useAuth } from '../context/AuthContext';

export default function Home() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <h1 className="text-3xl font-bold text-[var(--accent)]">COF — Site MJ</h1>
      <p className="text-[var(--text-secondary)]">
        Connecté en tant que <strong>{user?.display_name}</strong> ({user?.role})
      </p>
      <button
        onClick={logout}
        className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
      >
        Se déconnecter
      </button>
    </div>
  );
}
