const Product = require('../../models/Product');
const ErrorResponse = require('../../utils/ErrorResponse');
const asyncHandler = require('../../utils/asyncHandler');
const logger = require('../../utils/logger');
const { deleteImage } = require('../../config/cloudinary');
const mongoose = require('mongoose');

// @desc    Get all products (with filtering, sorting, pagination)
// @route   GET /api/admin/products
// @access  Private/Admin
exports.getProducts = asyncHandler(async (req, res, next) => {
  // 1. Filtrage avancé
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach(el => delete queryObj[el]);

  // 2. Filtres spéciaux (tailles/couleurs/prix)
  let queryStr = JSON.stringify(queryObj);
  queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);

  let query = Product.find(JSON.parse(queryStr));

  // 3. Tri
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  // 4. Limitation des champs
  if (req.query.fields) {
    const fields = req.query.fields.split(',').join(' ');
    query = query.select(fields);
  } else {
    query = query.select('-__v');
  }

  // 5. Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  query = query.skip(skip).limit(limit);

  // 6. Exécution
  const products = await query;
  const total = await Product.countDocuments(JSON.parse(queryStr));

  res.json({
    success: true,
    count: products.length,
    total,
    pages: Math.ceil(total / limit),
    data: products
  });
});

// @desc    Get single product
// @route   GET /api/admin/products/:id
// @access  Private/Admin
exports.getProduct = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID produit invalide: ${req.params.id}`, 400));
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Produit non trouvé', 404));
  }

  res.json({
    success: true,
    data: product
  });
});

// @desc    Create product
// @route   POST /api/admin/products
// @access  Private/Admin
exports.createProduct = asyncHandler(async (req, res, next) => {
  // Validation des images
  if (!req.files || req.files.length === 0) {
    return next(new ErrorResponse('Veuillez ajouter au moins une image', 400));
  }

  // Création du produit
  const productData = {
    ...req.body,
    images: req.files.map(file => ({
      url: file.path,
      publicId: file.filename
    })),
    createdBy: req.user._id
  };

  // Gestion des variantes
  if (req.body.sizes) {
    productData.sizes = req.body.sizes.split(',');
  }

  if (req.body.colors) {
    productData.colors = req.body.colors.split(',');
  }

  const product = await Product.create(productData);

  logger.info(`Nouveau produit créé par admin ${req.user._id}: ${product._id}`);

  res.status(201).json({
    success: true,
    data: product
  });
});

// @desc    Update product
// @route   PUT /api/admin/products/:id
// @access  Private/Admin
exports.updateProduct = asyncHandler(async (req, res, next) => {
  // Vérification de l'ID
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID produit invalide: ${req.params.id}`, 400));
  }

  let product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Produit non trouvé', 404));
  }

  // Préparation des données
  const updateData = { ...req.body, updatedBy: req.user._id };

  // Gestion des images (si nouvelles images uploadées)
  if (req.files && req.files.length > 0) {
    // Suppression des anciennes images de Cloudinary
    await Promise.all(
      product.images.map(img => deleteImage(img.publicId))
    );

    updateData.images = req.files.map(file => ({
      url: file.path,
      publicId: file.filename
    }));
  }

  // Gestion des variantes
  if (req.body.sizes) {
    updateData.sizes = req.body.sizes.split(',');
  }

  if (req.body.colors) {
    updateData.colors = req.body.colors.split(',');
  }

  // Mise à jour
  product = await Product.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true, runValidators: true }
  );

  logger.info(`Produit mis à jour par admin ${req.user._id}: ${product._id}`);

  res.json({
    success: true,
    data: product
  });
});

// @desc    Delete product
// @route   DELETE /api/admin/products/:id
// @access  Private/Admin
exports.deleteProduct = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID produit invalide: ${req.params.id}`, 400));
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Produit non trouvé', 404));
  }

  // Suppression des images de Cloudinary
  await Promise.all(
    product.images.map(img => deleteImage(img.publicId))
  );

  await product.deleteOne();

  logger.info(`Produit supprimé par admin ${req.user._id}: ${product._id}`);

  res.json({
    success: true,
    data: {}
  });
});

// @desc    Toggle product featured status
// @route   PATCH /api/admin/products/:id/featured
// @access  Private/Admin
exports.toggleFeatured = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID produit invalide: ${req.params.id}`, 400));
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Produit non trouvé', 404));
  }

  product.featured = !product.featured;
  product.updatedBy = req.user._id;
  await product.save();

  const status = product.featured ? 'mis en avant' : 'retiré des produits en avant';
  logger.info(`Produit ${status} par admin ${req.user._id}: ${product._id}`);

  res.json({
    success: true,
    data: product
  });
});

// @desc    Update product stock
// @route   PATCH /api/admin/products/:id/stock
// @access  Private/Admin
exports.updateStock = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID produit invalide: ${req.params.id}`, 400));
  }

  const { operation, quantity } = req.body;

  if (!['increment', 'decrement', 'set'].includes(operation)) {
    return next(new ErrorResponse('Opération invalide (increment/decrement/set)', 400));
  }

  if (isNaN(quantity) || quantity < 0) {
    return next(new ErrorResponse('Quantité doit être un nombre positif', 400));
  }

  const update = {};
  if (operation === 'increment') {
    update.$inc = { stock: quantity };
  } else if (operation === 'decrement') {
    update.$inc = { stock: -quantity };
  } else {
    update.$set = { stock: quantity };
  }

  const product = await Product.findByIdAndUpdate(
    req.params.id,
    {
      ...update,
      updatedBy: req.user._id
    },
    { new: true }
  );

  if (!product) {
    return next(new ErrorResponse('Produit non trouvé', 404));
  }

  logger.info(`Stock produit mis à jour par admin ${req.user._id}: ${product._id} (${operation} ${quantity})`);

  res.json({
    success: true,
    data: product
  });
});