const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrders,
  getOrder,
  updateOrder,
  cancelOrder,
  getOrderInvoice,
  getOrderTracking,
  processWebhook
} = require('../controllers/order.controller');
const { protect, authorize } = require('../middlewares/auth');
const { validateCheckout } = require('../middlewares/validators');

// ==================== Routes publiques (webhooks) ====================
router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), processWebhook);

// ==================== Routes protégées ====================
router.use(protect);

// ==================== Routes clients ====================
router.route('/')
  .get(authorize('user'), getOrders)          // GET /api/orders - Liste des commandes utilisateur
  .post(validateCheckout, createOrder);       // POST /api/orders - Créer une commande

router.route('/:id')
  .get(authorize('user'), getOrder)           // GET /api/orders/:id - Détails commande
  .put(authorize('user'), updateOrder)        // PUT /api/orders/:id - Mettre à jour
  .delete(authorize('user'), cancelOrder);    // DELETE /api/orders/:id - Annuler commande

router.get('/:id/invoice', authorize('user'), getOrderInvoice);      // Facture PDF
router.get('/:id/tracking', authorize('user'), getOrderTracking);    // Suivi de livraison

// ==================== Routes admin (déjà protégées dans admin.routes) ====================
// Les routes admin sont séparées dans admin.routes.js pour une meilleure organisation

module.exports = router;