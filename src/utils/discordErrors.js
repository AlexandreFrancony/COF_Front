// Maps the ?discord= query param the backend's OAuth callback redirects back with (it can
// only communicate by redirect, never by a JSON response) to a message worth toasting.
const MESSAGES = {
  error: "Erreur lors de la connexion avec Discord, réessaie.",
  expired: 'La demande a expiré, réessaie.',
  'not-linked': "Ce compte Discord n'est lié à aucun compte ici — accepte d'abord une invitation ou lie-le depuis \"Mon compte\".",
  taken: 'Ce compte Discord est déjà lié à un autre compte.',
  invalid: 'Invitation invalide ou déjà utilisée.',
  'no-email': "Ton compte Discord n'a pas d'email vérifié — vérifie-le sur Discord puis réessaie.",
  linked: 'Compte Discord lié !',
};

export function getDiscordMessage(code) {
  return MESSAGES[code] || null;
}
