const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getRealTimeActivity,
  getSalesReport
} = require('../controllers/admin/dashboard.controller');
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleFeatured,
  updateStock
} = require('../controllers/admin/products.controller');
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  toggleBanUser,
  updateUserPassword,
  getUserActivity
} = require('../controllers/admin/users.controller');
const {
  getOrders,
  getOrder,
  updateOrderStatus,
  deleteOrder,
  getOrderStats
} = require('../controllers/admin/orders.controller');
const {
  uploadProductImages,
  uploadUserAvatar
} = require('../middlewares/upload');
const { protect, authorize } = require('../middlewares/auth');
const advancedResults = require('../middlewares/advancedResults');

// Models
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');

// Appliquer la protection et l'autorisation admin à toutes les routes
router.use(protect);
router.use(authorize('admin'));

// ==================== Dashboard ====================
router.get('/dashboard/stats', getDashboardStats);
router.get('/dashboard/activity', getRealTimeActivity);
router.post('/dashboard/sales-report', getSalesReport);

// ==================== Produits ====================
router.route('/products')
  .get(advancedResults(Product, 'category'), getProducts)
  .post(uploadProductImages.array('images', 5), createProduct);

router.route('/products/:id')
  .get(getProduct)
  .put(uploadProductImages.array('images', 5), updateProduct)
  .delete(deleteProduct);

router.patch('/products/:id/featured', toggleFeatured);
router.patch('/products/:id/stock', updateStock);

// ==================== Utilisateurs ====================
router.route('/users')
  .get(advancedResults(User), getUsers)
  .post(createUser);

router.route('/users/:id')
  .get(getUser)
  .put(uploadUserAvatar.single('avatar'), updateUser)
  .delete(deleteUser);

router.patch('/users/:id/ban', toggleBanUser);
router.patch('/users/:id/password', updateUserPassword);
router.get('/users/:id/activity', getUserActivity);

// ==================== Commandes ====================
router.route('/orders')
  .get(advancedResults(Order, 'user'), getOrders);

router.route('/orders/:id')
  .get(getOrder)
  .put(updateOrderStatus)
  .delete(deleteOrder);

router.get('/orders/stats', getOrderStats);

module.exports = router;