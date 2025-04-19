const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const ErrorResponse = require('../utils/ErrorResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
exports.createOrder = asyncHandler(async (req, res, next) => {
  const { pickupMethod, deliveryAddress, paymentMethod } = req.body;

  // Récupération du panier
  const cart = await Cart.findOne({ user: req.user.id }).populate({
    path: 'items.product',
    select: 'name price stock'
  });

  if (!cart || cart.items.length === 0) {
    return next(new ErrorResponse('Panier vide', 400));
  }

  // Validation du stock
  for (const item of cart.items) {
    const product = await Product.findById(item.product._id);
    
    if (product.stock < item.quantity) {
      return next(new ErrorResponse(
        `Stock insuffisant pour ${product.name}. Disponible: ${product.stock}, Demandé: ${item.quantity}`,
        400
      ));
    }
  }

  // Préparation des items de commande
  const orderItems = cart.items.map(item => ({
    product: item.product._id,
    name: item.product.name,
    quantity: item.quantity,
    price: item.product.price,
    size: item.size,
    color: item.color
  }));

  // Calcul du total
  const itemsPrice = orderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const taxPrice = itemsPrice * 0.2; // 20% de TVA
  const totalPrice = itemsPrice + taxPrice;

  // Création de la commande
  const order = await Order.create({
    user: req.user.id,
    items: orderItems,
    pickupMethod,
    deliveryAddress: pickupMethod === 'delivery' ? deliveryAddress : undefined,
    itemsPrice,
    taxPrice,
    totalPrice,
    paymentMethod
  });

  // Mise à jour du stock
  const bulkOps = cart.items.map(item => ({
    updateOne: {
      filter: { _id: item.product._id },
      update: { $inc: { stock: -item.quantity } }
    }
  }));

  await Product.bulkWrite(bulkOps);

  // Vidage du panier
  await Cart.findByIdAndDelete(cart._id);

  logger.info(`Nouvelle commande créée: ${order._id} par utilisateur ${req.user.id}`);

  // Ici vous pourriez ajouter l'envoi d'email de confirmation

  res.status(201).json({
    success: true,
    data: order
  });
});

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'firstName lastName email');

  if (!order) {
    return next(new ErrorResponse('Commande non trouvée', 404));
  }

  // Vérification que l'utilisateur est autorisé
  if (order.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Non autorisé à accéder à cette commande', 401));
  }

  res.json({
    success: true,
    data: order
  });
});

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
exports.getMyOrders = asyncHandler(async (req, res, next) => {
  const orders = await Order.find({ user: req.user.id })
    .sort('-createdAt');

  res.json({
    success: true,
    count: orders.length,
    data: orders
  });
});

// @desc    Get all orders (Admin)
// @route   GET /api/orders
// @access  Private/Admin
exports.getOrders = asyncHandler(async (req, res, next) => {
  const orders = await Order.find()
    .populate('user', 'firstName lastName')
    .sort('-createdAt');

  res.json({
    success: true,
    count: orders.length,
    data: orders
  });
});

// @desc    Update order to delivered (Admin)
// @route   PUT /api/orders/:id/deliver
// @access  Private/Admin
exports.updateOrderToDelivered = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new ErrorResponse('Commande non trouvée', 404));
  }

  if (order.pickupMethod === 'delivery') {
    order.isDelivered = true;
    order.deliveredAt = Date.now();
    await order.save();
  } else {
    order.isPickedUp = true;
    order.pickedUpAt = Date.now();
    await order.save();
  }

  logger.info(`Commande ${order._id} marquée comme livrée/récupérée par admin ${req.user.id}`);

  res.json({
    success: true,
    data: order
  });
});

// @desc    Update order status (Admin)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
exports.updateOrderStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['processing', 'shipped', 'delivered', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return next(new ErrorResponse('Statut invalide', 400));
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    return next(new ErrorResponse('Commande non trouvée', 404));
  }

  // Logique métier supplémentaire selon les statuts
  if (status === 'cancelled') {
    // Réapprovisionner le stock si annulation
    const bulkOps = order.items.map(item => ({
      updateOne: {
        filter: { _id: item.product },
        update: { $inc: { stock: item.quantity } }
      }
    }));
    await Product.bulkWrite(bulkOps);
  }

  order.status = status;
  
  // Mise à jour des dates selon le statut
  if (status === 'shipped') {
    order.shippedAt = Date.now();
  } else if (status === 'delivered') {
    order.deliveredAt = Date.now();
  }

  await order.save();

  logger.info(`Statut commande ${order._id} mis à jour: ${status} par admin ${req.user.id}`);

  res.json({
    success: true,
    data: order
  });
});

// @desc    Delete order (Admin)
// @route   DELETE /api/orders/:id
// @access  Private/Admin
exports.deleteOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new ErrorResponse('Commande non trouvée', 404));
  }

  // Réapprovisionner le stock
  const bulkOps = order.items.map(item => ({
    updateOne: {
      filter: { _id: item.product },
      update: { $inc: { stock: item.quantity } }
    }
  }));
  await Product.bulkWrite(bulkOps);

  await order.deleteOne();

  logger.info(`Commande ${order._id} supprimée par admin ${req.user.id}`);

  res.json({
    success: true,
    data: {}
  });
});

// @desc    Get sales statistics (Admin)
// @route   GET /api/orders/stats
// @access  Private/Admin
exports.getOrderStats = asyncHandler(async (req, res, next) => {
  const stats = await Order.aggregate([
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalSales: { $sum: '$totalPrice' },
        avgOrderValue: { $avg: '$totalPrice' },
        minOrder: { $min: '$totalPrice' },
        maxOrder: { $max: '$totalPrice' }
      }
    },
    {
      $project: {
        _id: 0,
        totalOrders: 1,
        totalSales: 1,
        avgOrderValue: { $round: ['$avgOrderValue', 2] },
        minOrder: 1,
        maxOrder: 1
      }
    }
  ]);

  const monthlyStats = await Order.aggregate([
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        totalSales: { $sum: '$totalPrice' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 }
    },
    {
      $limit: 12
    }
  ]);

  res.json({
    success: true,
    data: {
      overall: stats[0] || {},
      monthly: monthlyStats
    }
  });
});