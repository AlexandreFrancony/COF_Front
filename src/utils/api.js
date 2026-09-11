import { getToken, clearToken } from './storage';

// In production (Docker), use /api prefix (nginx proxies and strips it)
const API_URL = import.meta.env.PROD ? '/api' : 'http://localhost:3001';

async function request(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const token = getToken();

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...options,
  };

  const response = await fetch(url, config);

  if (response.status === 401) {
    clearToken();
    throw new Error('Session expirée, veuillez vous reconnecter');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const login = (credentials) =>
  request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });

export const getMe = () => request('/auth/me');
