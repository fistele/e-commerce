const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getFeaturedProducts,
  getRelatedProducts,
  getProductsByCategory,
  searchProducts,
  getProductReviews,
  addProductReview
} = require('../controllers/product.controller');
console.log('Product controller loaded.../product.controller'); // Debugging line to check if product controller is loaded
const { protect, authorize } = require('../middlewares/auth');
const { uploadProductImages } = require('../middlewares/upload');
const advancedResults = require('../middlewares/advancedResults');
const Product = require('../models/Product');

// ==================== Routes publiques ====================
router.get('/', advancedResults(Product, 'category'), getProducts);
router.get('/featured', getFeaturedProducts);
router.get('/search', searchProducts);
router.get('/category/:slug', getProductsByCategory);
router.get('/:id', getProduct);
router.get('/:id/related', getRelatedProducts);
router.get('/:id/reviews', getProductReviews);

// ==================== Routes protégées (utilisateur authentifié) ====================
router.use(protect);
router.post('/:id/reviews', addProductReview);

// ==================== Routes admin ====================
router.use(authorize('admin', 'publisher'));
router.post('/', uploadProductImages.array('images', 5), createProduct);
router.put('/:id', uploadProductImages.array('images', 5), updateProduct);
router.delete('/:id', deleteProduct);

module.exports = router;