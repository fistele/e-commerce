const User = require('../../models/User');
const Order = require('../../models/Order');
const ErrorResponse = require('../../utils/ErrorResponse');
const asyncHandler = require('../../utils/asyncHandler');
const logger = require('../../utils/logger');
const mongoose = require('mongoose');

// @desc    Get all users with filtering and pagination
// @route   GET /api/admin/users
// @access  Private/Admin
exports.getUsers = asyncHandler(async (req, res, next) => {
  // 1. Filtrage
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach(el => delete queryObj[el]);

  // 2. Requête de base
  let query = User.find(queryObj).select('-password -__v');

  // 3. Tri
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  // 4. Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  query = query.skip(skip).limit(limit);

  // 5. Exécution
  const users = await query;
  const total = await User.countDocuments(queryObj);

  res.json({
    success: true,
    count: users.length,
    total,
    pages: Math.ceil(total / limit),
    data: users
  });
});

// @desc    Get single user with orders
// @route   GET /api/admin/users/:id
// @access  Private/Admin
exports.getUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID utilisateur invalide: ${req.params.id}`, 400));
  }

  const user = await User.findById(req.params.id)
    .select('-password -__v')
    .lean();

  if (!user) {
    return next(new ErrorResponse('Utilisateur non trouvé', 404));
  }

  // Récupération des commandes
  const orders = await Order.find({ user: req.params.id })
    .select('totalAmount status createdAt')
    .sort('-createdAt')
    .limit(5)
    .lean();

  // Statistiques utilisateur
  const stats = await Order.aggregate([
    { $match: { user: mongoose.Types.ObjectId(req.params.id) } },
    {
      $group: {
        _id: null,
        totalSpent: { $sum: '$totalAmount' },
        orderCount: { $sum: 1 }
      }
    }
  ]);

  res.json({
    success: true,
    data: {
      ...user,
      orders,
      stats: stats[0] || { totalSpent: 0, orderCount: 0 }
    }
  });
});

// @desc    Create new user (admin)
// @route   POST /api/admin/users
// @access  Private/Admin
exports.createUser = asyncHandler(async (req, res, next) => {
  // Validation des données
  if (!req.body.email || !req.body.password) {
    return next(new ErrorResponse('Email et mot de passe requis', 400));
  }

  // Vérification de l'existence
  const existingUser = await User.findOne({ email: req.body.email });
  if (existingUser) {
    return next(new ErrorResponse('Email déjà utilisé', 400));
  }

  const user = await User.create({
    ...req.body,
    isEmailVerified: true, // Admin crée => email vérifié
    createdBy: req.user._id
  });

  logger.info(`Nouvel utilisateur créé par admin ${req.user._id}: ${user._id}`);

  res.status(201).json({
    success: true,
    data: user
  });
});

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID utilisateur invalide: ${req.params.id}`, 400));
  }

  // Exclure certains champs
  if (req.body.password) {
    return next(new ErrorResponse('Utilisez la route spécifique pour le mot de passe', 400));
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    {
      ...req.body,
      updatedBy: req.user._id
    },
    { new: true, runValidators: true }
  ).select('-password -__v');

  if (!user) {
    return next(new ErrorResponse('Utilisateur non trouvé', 404));
  }

  logger.info(`Utilisateur mis à jour par admin ${req.user._id}: ${user._id}`);

  res.json({
    success: true,
    data: user
  });
});

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
exports.deleteUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID utilisateur invalide: ${req.params.id}`, 400));
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('Utilisateur non trouvé', 404));
  }

  // Empêcher la suppression d'un admin par un non-superadmin
  if (user.role === 'admin' && req.user.role !== 'superadmin') {
    return next(new ErrorResponse('Non autorisé à supprimer un admin', 403));
  }

  // Option 1: Soft delete
  // user.isActive = false;
  // await user.save();

  // Option 2: Hard delete avec nettoyage
  await Order.deleteMany({ user: user._id });
  await user.deleteOne();

  logger.info(`Utilisateur supprimé par admin ${req.user._id}: ${user._id}`);

  res.json({
    success: true,
    data: {}
  });
});

// @desc    Toggle user ban status
// @route   PATCH /api/admin/users/:id/ban
// @access  Private/Admin
exports.toggleBanUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID utilisateur invalide: ${req.params.id}`, 400));
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('Utilisateur non trouvé', 404));
  }

  // Ne pas bannir un admin
  if (user.role === 'admin') {
    return next(new ErrorResponse('Impossible de bannir un admin', 403));
  }

  user.isBanned = !user.isBanned;
  user.updatedBy = req.user._id;
  await user.save();

  const status = user.isBanned ? 'banni' : 'débanni';
  logger.info(`Utilisateur ${status} par admin ${req.user._id}: ${user._id}`);

  res.json({
    success: true,
    data: user
  });
});

// @desc    Update user password (admin override)
// @route   PATCH /api/admin/users/:id/password
// @access  Private/Admin
exports.updateUserPassword = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID utilisateur invalide: ${req.params.id}`, 400));
  }

  if (!req.body.password) {
    return next(new ErrorResponse('Veuillez fournir un nouveau mot de passe', 400));
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('Utilisateur non trouvé', 404));
  }

  user.password = req.body.password;
  user.updatedBy = req.user._id;
  await user.save();

  logger.info(`Mot de passe utilisateur mis à jour par admin ${req.user._id}: ${user._id}`);

  res.json({
    success: true,
    data: { _id: user._id }
  });
});

// @desc    Get user activity logs
// @route   GET /api/admin/users/:id/activity
// @access  Private/Admin
exports.getUserActivity = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID utilisateur invalide: ${req.params.id}`, 400));
  }

  // Dans un système réel, vous utiliseriez un service de logging comme Winston avec MongoDB
  const activityLogs = [
    {
      action: 'login',
      timestamp: new Date(Date.now() - 3600000),
      ip: '192.168.1.1'
    },
    {
      action: 'order_placed',
      timestamp: new Date(Date.now() - 86400000),
      orderId: '65a1b5c8...'
    }
  ];

  res.json({
    success: true,
    count: activityLogs.length,
    data: activityLogs
  });
});