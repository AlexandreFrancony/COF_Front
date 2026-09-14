import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

// Landing spot for the backend's Discord OAuth redirect (login or invite-accept) — it hands
// us a ready-made JWT in the query string, we just need to store it and move on.
export default function DiscordCallback() {
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = searchParams.get('token');
    if (!token) {
      navigate('/login');
      return;
    }

    loginWithToken(token)
      .then(() => navigate('/'))
      .catch((error) => {
        toast.error(error.message);
        navigate('/login');
      });
  }, [searchParams, loginWithToken, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]" />
    </div>
  );
}
