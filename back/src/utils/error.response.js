class ErrorResponse extends Error {
    /**
     * Crée une réponse d'erreur standardisée
     * @param {string} message - Message d'erreur
     * @param {number} statusCode - Code HTTP (400, 404, 500, etc.)
     * @param {object} details - Détails supplémentaires sur l'erreur
     */
    constructor(message, statusCode = 500, details = null) {
      super(message);
      this.statusCode = statusCode;
      this.details = details;
      this.isOperational = true; // Distingue les erreurs opérationnelles des bugs
  
      // Capture la stack trace (sauf pour les erreurs de validation)
      if (statusCode < 500) {
        Error.captureStackTrace(this, this.constructor);
      } else {
        Error.captureStackTrace(this);
      }
  
      // Enregistre l'erreur dans les logs (hors production)
      if (process.env.NODE_ENV !== 'production') {
        console.error(this.stack);
      }
    }
  
    /**
     * Formatte l'erreur pour la réponse API
     * @returns {object} Objet formaté pour la réponse
     */
    toJSON() {
      return {
        success: false,
        error: this.message,
        statusCode: this.statusCode,
        details: this.details,
        ...(process.env.NODE_ENV === 'development' && { stack: this.stack })
      };
    }
  
    /**
     * Factory pour les erreurs de validation
     * @param {object} errors - Erreurs de validation
     * @returns {ErrorResponse} Instance d'ErrorResponse
     */
    static validationError(errors) {
      const message = 'Validation failed';
      const formattedErrors = typeof errors === 'string' 
        ? { general: errors } 
        : errors;
      return new ErrorResponse(message, 400, formattedErrors);
    }
  
    /**
     * Factory pour les erreurs de ressource non trouvée
     * @param {string} resourceName - Nom de la ressource
     * @param {string|number} id - ID de la ressource
     * @returns {ErrorResponse} Instance d'ErrorResponse
     */
    static notFound(resourceName = 'Resource', id = null) {
      const message = id 
        ? `${resourceName} with ID ${id} not found`
        : `${resourceName} not found`;
      return new ErrorResponse(message, 404);
    }
  
    /**
     * Factory pour les erreurs d'authentification
     * @param {string} message - Message personnalisé
     * @returns {ErrorResponse} Instance d'ErrorResponse
     */
    static unauthorized(message = 'Not authorized') {
      return new ErrorResponse(message, 401);
    }
  
    /**
     * Factory pour les erreurs d'accès interdit
     * @param {string} message - Message personnalisé
     * @returns {ErrorResponse} Instance d'ErrorResponse
     */
    static forbidden(message = 'Forbidden') {
      return new ErrorResponse(message, 403);
    }
  }
  
  module.exports = ErrorResponse;