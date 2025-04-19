const express = require('express');
const router = express.Router();
const {
  getCart,
  addItemToCart,
  updateCartItem,
  removeItemFromCart,
  clearCart,
  applyCoupon,
  getCartCount,
  getCartSummary
} = require('../controllers/cart.controller');
const { protect } = require('../middlewares/auth');
const { validateCartItem } = require('../middlewares/validators');

// Toutes les routes nécessitent une authentification
router.use(protect);

// ==================== Routes principales ====================
router.route('/')
  .get(getCart)          // GET /api/cart - Récupérer le panier
  .post(validateCartItem, addItemToCart) // POST /api/cart - Ajouter un article
  .delete(clearCart);    // DELETE /api/cart - Vider le panier

router.route('/count')
  .get(getCartCount);    // GET /api/cart/count - Nombre d'articles

router.route('/summary')
  .get(getCartSummary);  // GET /api/cart/summary - Récapitulatif

// ==================== Gestion des articles ====================
router.route('/items/:productId')
  .put(validateCartItem, updateCartItem)    // PUT /api/cart/items/:productId - Mettre à jour
  .delete(removeItemFromCart);              // DELETE /api/cart/items/:productId - Supprimer

// ==================== Coupons ====================
router.post('/coupons', applyCoupon); // POST /api/cart/coupons - Appliquer un coupon

module.exports = router;