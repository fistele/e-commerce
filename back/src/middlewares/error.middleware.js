const ErrorResponse = require('../utils/error.response');
const logger = require('../utils/logger');
const { isCelebrateError } = require('celebrate');
const mongoose = require('mongoose');

class ErrorHandler {
  /**
   * Middleware principal de gestion d'erreurs
   */
  static handle() {
    return (err, req, res, next) => {
      let error = { ...err };
      error.message = err.message;

      // Log l'erreur complète en développement
      if (process.env.NODE_ENV === 'development') {
        logger.error(err.stack);
      }

      // Gestion des erreurs spécifiques
      error = this.processError(error);

      // Formatage de la réponse
      this.sendResponse(error, res);
    };
  }

  /**
   * Traite les différents types d'erreurs
   */
  static processError(error) {
    // Erreurs de validation Mongoose
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return new ErrorResponse(messages.join(', '), 400);
    }

    // Erreur CastError (ObjectId invalide)
    if (error.name === 'CastError') {
      return new ErrorResponse(`Ressource introuvable avec l'ID ${error.value}`, 404);
    }

    // Erreur de duplication (champ unique)
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return new ErrorResponse(`La valeur '${error.keyValue[field]}' existe déjà pour le champ ${field}`, 400);
    }

    // Erreur JWT
    if (error.name === 'JsonWebTokenError') {
      return new ErrorResponse('Token JWT invalide', 401);
    }

    // Erreur JWT expiré
    if (error.name === 'TokenExpiredError') {
      return new ErrorResponse('Token JWT expiré', 401);
    }

    // Erreurs de validation Celebrate (Joi)
    if (isCelebrateError(error)) {
      const details = [];
      for (const [segment, joiError] of error.details.entries()) {
        details.push(joiError.details.map(d => d.message));
      }
      return new ErrorResponse(`Validation error: ${details.flat().join(', ')}`, 422);
    }

    // Erreur API Stripe
    if (error.type === 'StripeAPIError') {
      return new ErrorResponse(error.message, error.statusCode || 502);
    }

    // Erreur Cloudinary
    if (error.name === 'CloudinaryError') {
      return new ErrorResponse('Erreur lors du traitement des médias', 500);
    }

    // Si l'erreur n'est pas reconnue, garder le statut par défaut ou 500
    error.statusCode = error.statusCode || 500;
    error.message = error.message || 'Erreur serveur';

    return error;
  }

  /**
   * Envoie la réponse d'erreur formatée
   */
  static sendResponse(error, res) {
    if (process.env.NODE_ENV === 'production' && error.statusCode === 500) {
      error.message = 'Erreur serveur';
    }

    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      details: error.details || undefined
    });
  }

  /**
   * Middleware pour les routes non trouvées
   */
  static notFound() {
    return (req, res, next) => {
      next(new ErrorResponse(`Route non trouvée - ${req.originalUrl}`, 404));
    };
  }
}

module.exports = ErrorHandler;