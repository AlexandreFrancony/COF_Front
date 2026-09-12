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

// ============================================================================
// CAMPAIGNS
// ============================================================================

export const getCampaigns = () => request('/campaigns');
export const getCampaign = (id) => request(`/campaigns/${id}`);
export const createCampaign = (data) =>
  request('/campaigns', { method: 'POST', body: JSON.stringify(data) });
export const updateCampaign = (id, data) =>
  request(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteCampaign = (id) =>
  request(`/campaigns/${id}`, { method: 'DELETE' });

// ============================================================================
// INVITES
// ============================================================================

export const createInvite = (campaignId, data) =>
  request(`/campaigns/${campaignId}/invites`, { method: 'POST', body: JSON.stringify(data) });
export const getCampaignInvites = (campaignId) =>
  request(`/campaigns/${campaignId}/invites`);
export const getInvite = (token) => request(`/invites/${token}`);
export const acceptInvite = (token, data) =>
  request(`/invites/${token}/accept`, { method: 'POST', body: JSON.stringify(data) });

// ============================================================================
// CHARACTERS
// ============================================================================

export const getCampaignCharacters = (campaignId) =>
  request(`/campaigns/${campaignId}/characters`);
export const getCharacter = (id) => request(`/characters/${id}`);
export const updateCharacter = (id, data) =>
  request(`/characters/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const addCharacterVoie = (characterId, data) =>
  request(`/characters/${characterId}/voies`, { method: 'POST', body: JSON.stringify(data) });
export const removeCharacterVoie = (characterId, voieId) =>
  request(`/characters/${characterId}/voies/${voieId}`, { method: 'DELETE' });
export const raiseCharacterVoieRang = (characterId, voieId) =>
  request(`/characters/${characterId}/voies/${voieId}`, { method: 'PATCH' });
export const levelUpCharacter = (characterId) =>
  request(`/characters/${characterId}/level-up`, { method: 'POST' });
export const orphanExchange = (characterId, choice) =>
  request(`/characters/${characterId}/orphan-exchange`, { method: 'POST', body: JSON.stringify({ choice }) });

// ============================================================================
// RULES (reference data)
// ============================================================================

export const getFamilles = () => request('/rules/familles');
export const getProfils = () => request('/rules/profils');
export const getPeuples = () => request('/rules/peuples');
export const getVoies = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return request(`/rules/voies${query ? `?${query}` : ''}`);
};
