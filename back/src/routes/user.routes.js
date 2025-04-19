const express = require('express');
const router = express.Router();
const {
  getMe,
  updateMe,
  deleteMe,
  updatePassword,
  uploadUserPhoto,
  resizeUserPhoto,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  getMyOrders,
  getMyReviews
} = require('../controllers/user.controller');
const {
  protect,
  verifyEmail
} = require('../middlewares/auth.middleware');
const {
  updateMeValidator,
  updatePasswordValidator
} = require('../validators/user.validators');

// Routes protégées (nécessitent une authentification)
router.use(protect);
router.use(verifyEmail); // Vérifie que l'email est confirmé

// Routes pour l'utilisateur courant
router.route('/me')
  .get(getMe)
  .patch(
    uploadUserPhoto,
    resizeUserPhoto,
    updateMeValidator,
    updateMe
  )
  .delete(deleteMe);

router.route('/update-password')
  .patch(updatePasswordValidator, updatePassword);

// Routes pour la wishlist
router.route('/wishlist')
  .get(getWishlist)
  .post(addToWishlist);

router.route('/wishlist/:productId')
  .delete(removeFromWishlist);

// Routes pour les commandes et avis
router.route('/my-orders')
  .get(getMyOrders);

router.route('/my-reviews')
  .get(getMyReviews);

module.exports = router;