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

  // A 401 usually means the token itself is missing/invalid/expired — except on /auth/login
  // (no token sent yet: a wrong password) and /auth/password (token is fine, but the
  // *current* password supplied in the body was wrong) — both are input errors, not an
  // expired session, so they fall through to the generic handler and surface the backend's
  // real message instead of a misleading "session expired".
  const isAuthInputCheck = endpoint === '/auth/login' || endpoint === '/auth/password';
  if (response.status === 401 && token && !isAuthInputCheck) {
    clearToken();
    throw new Error('Session expirée, veuillez vous reconnecter');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  // A 204 (or any genuinely empty body) has nothing to parse — .json() throws on it, which
  // silently broke every DELETE that returned 204 (the catch swallowed it as an error toast,
  // discarding the state update that was supposed to follow the request).
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const login = (credentials) =>
  request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });

export const getMe = () => request('/auth/me');

export const changePassword = (currentPassword, newPassword) =>
  request('/auth/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  });

export const changeDisplayName = (displayName) =>
  request('/auth/display-name', {
    method: 'PATCH',
    body: JSON.stringify({ display_name: displayName }),
  });

export const forgotPassword = (email) =>
  request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

export const resetPassword = (token, password) =>
  request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });

export const discordLoginInit = () => request('/auth/discord/login-init');

export const discordLinkInit = () => request('/auth/discord/link-init');

export const discordInviteInit = (inviteToken) =>
  request(`/auth/discord/invite-init?token=${encodeURIComponent(inviteToken)}`);

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
export const createScenarioToken = (scenarioId, data) =>
  request(`/scenarios/${scenarioId}/tokens`, { method: 'POST', body: JSON.stringify(data) });
export const updateScenarioToken = (tokenId, data) =>
  request(`/scenario-tokens/${tokenId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteScenarioToken = (tokenId) =>
  request(`/scenario-tokens/${tokenId}`, { method: 'DELETE' });
export const createScenarioZone = (scenarioId, data) =>
  request(`/scenarios/${scenarioId}/zones`, { method: 'POST', body: JSON.stringify(data) });
export const updateScenarioZone = (zoneId, data) =>
  request(`/scenario-zones/${zoneId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteScenarioZone = (zoneId) =>
  request(`/scenario-zones/${zoneId}`, { method: 'DELETE' });
export const launchScenario = (scenarioId) =>
  request(`/scenarios/${scenarioId}/launch`, { method: 'POST' });

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

// Shared weapon library (p.182-184) — reference info only (damage dice, portée, prix...),
// nothing here feeds a computed stat.
export const getArmes = () => request('/rules/armes');
export const createArme = (data) => request('/rules/armes', { method: 'POST', body: JSON.stringify(data) });
export const deleteArme = (id) => request(`/rules/armes/${id}`, { method: 'DELETE' });

// Bestiaire (Chapitre 3 "Opposition") — reference stat blocks for the board's "Bibliothèque
// d'ennemis" picker. capacités glossary is separate (rules_monstre_capacites), for the GM
// reference page rather than the picker itself.
export const getMonstres = (search) => request(`/rules/monstres${search ? `?search=${encodeURIComponent(search)}` : ''}`);
export const getMonstreCapacites = () => request('/rules/monstre-capacites');
export const updateMonstre = (id, data) =>
  request(`/rules/monstres/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// Two-step, like uploadBoardImage: sets this bestiary entry's own illustration, joined live
// into every pawn already spawned from it — no separate per-pawn upload/snapshot.
export async function uploadMonstreImage(id, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${API_URL}/rules/monstres/${id}/image`, {
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
// data: { music_url, music_playing, music_volume } — any subset. music_url: '' clears the
// track (an actual null is a no-op server-side, same COALESCE pattern as background_url).
export const updateBoardMusic = (campaignId, data) =>
  request(`/campaigns/${campaignId}/board`, { method: 'PATCH', body: JSON.stringify(data) });
// Atomic server-side delta, same reasoning as camera_width_delta (avoids dropping a rapid
// double-click's second delta while the first response is still in flight).
export const updateBoardTokenSize = (campaignId, delta) =>
  request(`/campaigns/${campaignId}/board`, { method: 'PATCH', body: JSON.stringify({ token_size_delta: delta }) });
// Transient — nothing to read back, the response is a bare 204.
export const pingBoard = (campaignId, x, y) =>
  request(`/campaigns/${campaignId}/board/ping`, { method: 'POST', body: JSON.stringify({ x, y }) });
export const setBoardInitiativeVisible = (campaignId, visible) =>
  request(`/campaigns/${campaignId}/board`, { method: 'PATCH', body: JSON.stringify({ initiative_visible: visible }) });
export const nextInitiativeTurn = (campaignId) =>
  request(`/campaigns/${campaignId}/board/initiative/next`, { method: 'POST' });
export const resetInitiative = (campaignId) =>
  request(`/campaigns/${campaignId}/board/initiative/reset`, { method: 'POST' });
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

// Two-step, like uploadBoardImage: this only uploads the file and returns its URL — the caller
// still does updateCharacter(id, { avatar_url: url }) to actually apply it (and clear any emoji).
export async function uploadCharacterAvatar(characterId, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${API_URL}/characters/${characterId}/avatar`, {
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

// Shared campaign notes — same query-token trick, see COF_Back/src/routes/notes.js.
export const getCampaignNotes = (campaignId) => request(`/campaigns/${campaignId}/notes`);
export const updateCampaignNotes = (campaignId, content) =>
  request(`/campaigns/${campaignId}/notes`, { method: 'PATCH', body: JSON.stringify({ content }) });
export const getNotesStreamUrl = (campaignId) =>
  `${API_URL}/notes-stream/${campaignId}?token=${encodeURIComponent(getToken() || '')}`;

// Same query-token trick, see COF_Back/src/routes/sseStreams.js.
export const getCharacterStreamUrl = (characterId) =>
  `${API_URL}/character-stream/${characterId}?token=${encodeURIComponent(getToken() || '')}`;

// Reusable library of uploaded media (images, mp4 ambiance videos, audio tracks), shared across campaigns.
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
export const clearCampaignEvents = (campaignId) =>
  request(`/campaigns/${campaignId}/events`, { method: 'DELETE' });
