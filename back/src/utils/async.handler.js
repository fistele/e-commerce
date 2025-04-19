/**
 * Enveloppe un contrôleur asynchrone pour une gestion centralisée des erreurs
 * @param {Function} fn - Contrôleur asynchrone
 * @returns {Function} Middleware Express avec gestion d'erreur
 */
const asyncHandler = (fn) => (req, res, next) => {
    // Vérifie que la fonction est bien asynchrone
    if (fn.constructor.name !== 'AsyncFunction') {
      throw new Error(
        `asyncHandler attend une fonction asynchrone mais a reçu ${fn.constructor.name}`
      );
    }
  
    // Exécute le contrôleur et gère les erreurs potentielles
    Promise.resolve(fn(req, res, next)).catch((err) => {
      // Améliore le message d'erreur pour les erreurs de validation
      if (err.name === 'ValidationError') {
        err.message = `Validation error: ${err.message}`;
      }
  
      // Passe l'erreur au middleware de gestion d'erreur
      next(err);
    });
  };
  
  module.exports = asyncHandler;