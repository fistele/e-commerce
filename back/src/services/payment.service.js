const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const ErrorResponse = require('../utils/ErrorResponse');
const logger = require('../utils/logger');
const Order = require('../models/Order');

class PaymentService {
  /**
   * Crée un paiement Intent pour Stripe
   * @param {Number} amount - Montant en cents
   * @param {String} currency - Devise (eur, usd, etc.)
   * @param {Object} metadata - Métadonnées supplémentaires
   * @returns {Promise<Object>} PaymentIntent
   */
  static async createPaymentIntent(amount, currency = 'eur', metadata = {}) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        metadata,
        automatic_payment_methods: { enabled: true },
      });

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    } catch (err) {
      logger.error(`Erreur création PaymentIntent: ${err.message}`);
      throw new ErrorResponse('Erreur lors de la création du paiement', 500);
    }
  }

  /**
   * Confirme et finalise un paiement
   * @param {String} paymentIntentId - ID du PaymentIntent
   * @param {String} orderId - ID de la commande associée
   * @returns {Promise<Object>} Résultat de la confirmation
   */
  static async confirmPayment(paymentIntentId, orderId) {
    try {
      // 1. Vérifier la commande
      const order = await Order.findById(orderId);
      if (!order) {
        throw new ErrorResponse('Commande non trouvée', 404);
      }

      // 2. Confirmer le paiement avec Stripe
      const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: 'pm_card_visa', // À remplacer par la méthode réelle
      });

      // 3. Mettre à jour la commande
      order.paymentStatus = paymentIntent.status;
      order.paymentDetails = {
        paymentIntentId: paymentIntent.id,
        amountPaid: paymentIntent.amount_received,
        paymentMethod: paymentIntent.payment_method_types[0],
      };

      await order.save();

      return {
        status: paymentIntent.status,
        order: order.toObject({ getters: true }),
      };
    } catch (err) {
      logger.error(`Erreur confirmation paiement: ${err.message}`);
      
      // Annuler le PaymentIntent en cas d'échec
      try {
        await stripe.paymentIntents.cancel(paymentIntentId);
      } catch (cancelErr) {
        logger.error(`Échec annulation PaymentIntent: ${cancelErr.message}`);
      }

      throw new ErrorResponse(
        err.message || 'Erreur lors de la confirmation du paiement',
        err.statusCode || 500
      );
    }
  }

  /**
   * Gère les webhooks Stripe
   * @param {String} payload - Corps de la requête
   * @param {String} sig - Signature Stripe
   * @returns {Promise<Object>} Résultat du traitement
   */
  static async handleWebhook(payload, sig) {
    const event = stripe.webhooks.constructEvent(
      payload,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    let paymentIntent;
    switch (event.type) {
      case 'payment_intent.succeeded':
        paymentIntent = event.data.object;
        await this.handlePaymentSuccess(paymentIntent);
        break;

      case 'payment_intent.payment_failed':
        paymentIntent = event.data.object;
        await this.handlePaymentFailure(paymentIntent);
        break;

      // Ajouter d'autres événements au besoin
      default:
        logger.info(`Événement Stripe non géré: ${event.type}`);
    }

    return { received: true };
  }

  /**
   * Traite un paiement réussi
   * @param {Object} paymentIntent - PaymentIntent Stripe
   */
  static async handlePaymentSuccess(paymentIntent) {
    try {
      const order = await Order.findOneAndUpdate(
        { 'paymentDetails.paymentIntentId': paymentIntent.id },
        {
          paymentStatus: 'succeeded',
          status: 'processing',
          'paymentDetails.amountPaid': paymentIntent.amount_received,
        },
        { new: true }
      );

      if (!order) {
        throw new Error('Commande non trouvée pour ce paiement');
      }

      // Ici vous pourriez déclencher un email de confirmation
      logger.info(`Paiement réussi pour la commande ${order._id}`);
    } catch (err) {
      logger.error(`Erreur traitement paiement réussi: ${err.message}`);
      throw err;
    }
  }

  /**
   * Traite un échec de paiement
   * @param {Object} paymentIntent - PaymentIntent Stripe
   */
  static async handlePaymentFailure(paymentIntent) {
    try {
      await Order.findOneAndUpdate(
        { 'paymentDetails.paymentIntentId': paymentIntent.id },
        {
          paymentStatus: 'failed',
          status: 'canceled',
        }
      );

      logger.warn(`Paiement échoué pour l'intent ${paymentIntent.id}`);
    } catch (err) {
      logger.error(`Erreur traitement échec paiement: ${err.message}`);
      throw err;
    }
  }

  /**
   * Crée un remboursement
   * @param {String} paymentIntentId - ID du PaymentIntent
   * @param {Number} amount - Montant à rembourser (en cents)
   * @returns {Promise<Object>} Résultat du remboursement
   */
  static async createRefund(paymentIntentId, amount) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount,
      });

      return refund;
    } catch (err) {
      logger.error(`Erreur création remboursement: ${err.message}`);
      throw new ErrorResponse('Erreur lors du remboursement', 500);
    }
  }
}

module.exports = PaymentService;