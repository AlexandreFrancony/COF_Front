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
export const revokeInvite = (campaignId, inviteId) =>
  request(`/campaigns/${campaignId}/invites/${inviteId}`, { method: 'DELETE' });

// ============================================================================
// SCENARIOS (GM-only prep notes, phase 3)
// ============================================================================

export const getCampaignScenarios = (campaignId) => request(`/campaigns/${campaignId}/scenarios`);
export const createScenario = (campaignId, data) =>
  request(`/campaigns/${campaignId}/scenarios`, { method: 'POST', body: JSON.stringify(data) });
export const updateScenario = (scenarioId, data) =>
  request(`/scenarios/${scenarioId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteScenario = (scenarioId) =>
  request(`/scenarios/${scenarioId}`, { method: 'DELETE' });

// ============================================================================
// CHARACTERS
// ============================================================================

export const getCampaignCharacters = (campaignId) =>
  request(`/campaigns/${campaignId}/characters`);
export const createCharacter = (campaignId, data) =>
  request(`/campaigns/${campaignId}/characters`, { method: 'POST', body: JSON.stringify(data) });
export const getCharacter = (id) => request(`/characters/${id}`);
export const updateCharacter = (id, data) =>
  request(`/characters/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteCharacter = (id) => request(`/characters/${id}`, { method: 'DELETE' });
export const addCharacterVoie = (characterId, data) =>
  request(`/characters/${characterId}/voies`, { method: 'POST', body: JSON.stringify(data) });
export const removeCharacterVoie = (characterId, voieId) =>
  request(`/characters/${characterId}/voies/${voieId}`, { method: 'DELETE' });
export const forgetCharacterVoie = (characterId, voieId) =>
  request(`/characters/${characterId}/voies/${voieId}/forget`, { method: 'POST' });
export const raiseCharacterVoieRang = (characterId, voieId) =>
  request(`/characters/${characterId}/voies/${voieId}`, { method: 'PATCH' });
export const setCharacterVoieRang = (characterId, voieId, rang) =>
  request(`/characters/${characterId}/voies/${voieId}`, { method: 'PATCH', body: JSON.stringify({ rang }) });
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

// Shared armor library (name + flat DEF bonus) — GM manages it, any character can equip one.
export const getArmures = () => request('/rules/armures');
export const createArmure = (data) => request('/rules/armures', { method: 'POST', body: JSON.stringify(data) });
export const deleteArmure = (id) => request(`/rules/armures/${id}`, { method: 'DELETE' });

// ============================================================================
// LIVE BOARD (phase 2)
// ============================================================================

export const getBoard = (campaignId) => request(`/campaigns/${campaignId}/board`);
// data: { url, type } — type is 'image' or 'video' (a video plays fullscreen/looped for ambiance).
export const updateBoardBackground = (campaignId, { url, type }) =>
  request(`/campaigns/${campaignId}/board`, {
    method: 'PATCH',
    body: JSON.stringify({ background_url: url, background_type: type }),
  });
export const updateBoardGrid = (campaignId, data) =>
  request(`/campaigns/${campaignId}/board`, { method: 'PATCH', body: JSON.stringify(data) });
// data: { camera_x, camera_y } on drag-end, or { camera_width_delta } on a zoom +/- click.
export const updateBoardCamera = (campaignId, data) =>
  request(`/campaigns/${campaignId}/board`, { method: 'PATCH', body: JSON.stringify(data) });
export const createBoardToken = (campaignId, data) =>
  request(`/campaigns/${campaignId}/board/tokens`, { method: 'POST', body: JSON.stringify(data) });
export const updateBoardToken = (tokenId, data) =>
  request(`/board/tokens/${tokenId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteBoardToken = (tokenId) =>
  request(`/board/tokens/${tokenId}`, { method: 'DELETE' });

export const createBoardZone = (campaignId, data) =>
  request(`/campaigns/${campaignId}/board/zones`, { method: 'POST', body: JSON.stringify(data) });
export const updateBoardZone = (zoneId, data) =>
  request(`/board/zones/${zoneId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteBoardZone = (zoneId) =>
  request(`/board/zones/${zoneId}`, { method: 'DELETE' });

export async function uploadBoardImage(campaignId, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${API_URL}/campaigns/${campaignId}/board/upload`, {
    method: 'POST',
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Échec de l\'envoi' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// EventSource can't set an Authorization header, so the token travels as a query param.
// Lives outside /campaigns on purpose — see the comment in COF_Back/src/routes/board.js.
export const getBoardStreamUrl = (campaignId) =>
  `${API_URL}/board-stream/${campaignId}?token=${encodeURIComponent(getToken() || '')}`;

// Reusable library of uploaded backgrounds (images + mp4 ambiance videos), shared across campaigns.
export const getBoardMedia = () => request('/board-media');
export const deleteBoardMedia = (mediaId) => request(`/board-media/${mediaId}`, { method: 'DELETE' });
export async function uploadBoardMedia(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/board-media`, {
    method: 'POST',
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Échec de l\'envoi' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// SESSION HISTORY (phase 3)
// ============================================================================

export const getCampaignEvents = (campaignId) => request(`/campaigns/${campaignId}/events`);
export const createEvent = (campaignId, message) =>
  request(`/campaigns/${campaignId}/events`, { method: 'POST', body: JSON.stringify({ message }) });
