const Product = require('../models/Product');
const ErrorResponse = require('../utils/error.response');
const asyncHandler = require('../utils/async.handler');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const { deleteImage } = require('../config/cloudinary');
console.log('Product model loaded.../config/cloudinary'); // Debugging line to check if product model is loaded
const path = require('path');

// @desc    Get all products
// @route   GET /api/products
// @access  Public
exports.getProducts = asyncHandler(async (req, res, next) => {
  // 1. Filtrage avancé
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields', 'search'];
  excludedFields.forEach(el => delete queryObj[el]);

  // 2. Recherche texte
  if (req.query.search) {
    queryObj.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { description: { $regex: req.query.search, $options: 'i' } }
    ];
  }

  // 3. Filtres spéciaux
  let queryStr = JSON.stringify(queryObj);
  queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);

  let query = Product.find(JSON.parse(queryStr));

  // 4. Tri
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  // 5. Limitation des champs
  if (req.query.fields) {
    const fields = req.query.fields.split(',').join(' ');
    query = query.select(fields);
  } else {
    query = query.select('-__v');
  }

  // 6. Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  query = query.skip(skip).limit(limit);

  // 7. Exécution
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
// @route   GET /api/products/:id
// @access  Public
exports.getProduct = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID produit invalide: ${req.params.id}`, 400));
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Produit non trouvé', 404));
  }

  // Incrémentation des vues
  product.views += 1;
  await product.save();

  res.json({
    success: true,
    data: product
  });
});

// @desc    Create product (Admin)
// @route   POST /api/products
// @access  Private/Admin
exports.createProduct = asyncHandler(async (req, res, next) => {
  // Validation des images
  if (!req.files || req.files.length === 0) {
    return next(new ErrorResponse('Veuillez ajouter au moins une image', 400));
  }

  // Préparation des données
  const productData = {
    ...req.body,
    images: req.files.map(file => ({
      url: file.path,
      publicId: file.filename
    })),
    createdBy: req.user._id
  };

  // Conversion des tailles/couleurs en tableaux
  if (req.body.sizes) {
    productData.sizes = req.body.sizes.split(',');
  }

  if (req.body.colors) {
    productData.colors = req.body.colors.split(',');
  }

  // Conversion des prix
  if (req.body.price) {
    productData.price = parseFloat(req.body.price);
  }

  if (req.body.comparePrice) {
    productData.comparePrice = parseFloat(req.body.comparePrice);
  }

  const product = await Product.create(productData);

  logger.info(`Nouveau produit créé par admin ${req.user._id}: ${product._id}`);

  res.status(201).json({
    success: true,
    data: product
  });
});

// @desc    Update product (Admin)
// @route   PUT /api/products/:id
// @access  Private/Admin
exports.updateProduct = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID produit invalide: ${req.params.id}`, 400));
  }

  let product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Produit non trouvé', 404));
  }

  // Préparation des données
  const updateData = { ...req.body, updatedBy: req.user._id };

  // Gestion des images
  if (req.files && req.files.length > 0) {
    // Suppression des anciennes images
    await Promise.all(
      product.images.map(img => deleteImage(img.publicId))
    );

    updateData.images = req.files.map(file => ({
      url: file.path,
      publicId: file.filename
    }));
  }

  // Conversion des tailles/couleurs
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

// @desc    Delete product (Admin)
// @route   DELETE /api/products/:id
// @access  Private/Admin
exports.deleteProduct = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID produit invalide: ${req.params.id}`, 400));
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Produit non trouvé', 404));
  }

  // Suppression des images
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

// @desc    Get related products
// @route   GET /api/products/:id/related
// @access  Public
exports.getRelatedProducts = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID produit invalide: ${req.params.id}`, 400));
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Produit non trouvé', 404));
  }

  const relatedProducts = await Product.find({
    category: product.category,
    _id: { $ne: product._id }
  })
    .limit(4)
    .select('name price images');

  res.json({
    success: true,
    count: relatedProducts.length,
    data: relatedProducts
  });
});

// @desc    Get top rated products
// @route   GET /api/products/top-rated
// @access  Public
exports.getTopRatedProducts = asyncHandler(async (req, res, next) => {
  const products = await Product.find({ averageRating: { $gte: 4 } })
    .sort('-averageRating')
    .limit(5)
    .select('name price images averageRating');

  res.json({
    success: true,
    count: products.length,
    data: products
  });
});

// @desc    Get featured products
// @route   GET /api/products/featured
// @access  Public
exports.getFeaturedProducts = asyncHandler(async (req, res, next) => {
  const products = await Product.find({ featured: true })
    .limit(8)
    .select('name price images');

  res.json({
    success: true,
    count: products.length,
    data: products
  });
});

// @desc    Update product rating
// @route   PUT /api/products/:id/rating
// @access  Private
exports.updateProductRating = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`ID produit invalide: ${req.params.id}`, 400));
  }

  const { rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return next(new ErrorResponse('Veuillez fournir une note entre 1 et 5', 400));
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Produit non trouvé', 404));
  }

  // Vérifier si l'utilisateur a déjà noté
  const alreadyReviewed = product.reviews.find(
    r => r.user.toString() === req.user._id.toString()
  );

  if (alreadyReviewed) {
    return next(new ErrorResponse('Vous avez déjà noté ce produit', 400));
  }

  // Ajouter la review
  const review = {
    user: req.user._id,
    name: req.user.firstName + ' ' + req.user.lastName,
    rating: Number(rating),
    comment
  };

  product.reviews.push(review);
  product.numReviews = product.reviews.length;

  // Calculer la nouvelle moyenne
  product.averageRating = product.reviews.reduce((acc, item) => item.rating + acc, 0) / product.reviews.length;

  await product.save();

  logger.info(`Produit ${product._id} noté par utilisateur ${req.user._id}`);

  res.json({
    success: true,
    data: product.reviews
  });
});

// @desc    Get products by category
// @route   GET /api/products/category/:categoryId
// @access  Public
exports.getProductsByCategory = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.categoryId)) {
    return next(new ErrorResponse('ID de catégorie invalide', 400));
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Filtres supplémentaires
  const filters = { category: req.params.categoryId };
  
  if (req.query.minPrice) {
    filters.price = { $gte: parseFloat(req.query.minPrice) };
  }
  
  if (req.query.maxPrice) {
    filters.price = { ...filters.price, $lte: parseFloat(req.query.maxPrice) };
  }

  // Tri
  const sortOptions = {};
  if (req.query.sort === 'price-asc') {
    sortOptions.price = 1;
  } else if (req.query.sort === 'price-desc') {
    sortOptions.price = -1;
  } else if (req.query.sort === 'newest') {
    sortOptions.createdAt = -1;
  } else if (req.query.sort === 'top-rated') {
    sortOptions.averageRating = -1;
  }

  const [products, total] = await Promise.all([
    Product.find(filters)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit),
    Product.countDocuments(filters)
  ]);

  res.json({
    success: true,
    count: products.length,
    total,
    pages: Math.ceil(total / limit),
    data: products
  });
});

// @desc    Search products
// @route   GET /api/products/search
// @access  Public
exports.searchProducts = asyncHandler(async (req, res, next) => {
  const { q: searchQuery, category } = req.query;

  if (!searchQuery) {
    return next(new ErrorResponse('Veuillez fournir un terme de recherche', 400));
  }

  const searchFilters = {
    $or: [
      { name: { $regex: searchQuery, $options: 'i' } },
      { description: { $regex: searchQuery, $options: 'i' } },
      { 'variants.name': { $regex: searchQuery, $options: 'i' } }
    ]
  };

  if (category && mongoose.Types.ObjectId.isValid(category)) {
    searchFilters.category = category;
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    Product.find(searchFilters)
      .skip(skip)
      .limit(limit),
    Product.countDocuments(searchFilters)
  ]);

  res.json({
    success: true,
    count: products.length,
    total,
    pages: Math.ceil(total / limit),
    data: products
  });
});

// @desc    Get product reviews
// @route   GET /api/products/:id/reviews
// @access  Public
exports.getProductReviews = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse('ID produit invalide', 400));
  }

  const product = await Product.findById(req.params.id)
    .select('reviews averageRating numReviews')
    .populate('reviews.user', 'firstName lastName avatar');

  if (!product) {
    return next(new ErrorResponse('Produit non trouvé', 404));
  }

  res.json({
    success: true,
    count: product.reviews.length,
    averageRating: product.averageRating,
    data: product.reviews
  });
});

// @desc    Add product review
// @route   POST /api/products/:id/reviews
// @access  Private
exports.addProductReview = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse('ID produit invalide', 400));
  }

  const { rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return next(new ErrorResponse('Veuillez fournir une note valide entre 1 et 5', 400));
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Produit non trouvé', 404));
  }

  // Vérifier si l'utilisateur a déjà noté ce produit
  const alreadyReviewed = product.reviews.find(
    review => review.user.toString() === req.user._id.toString()
  );

  if (alreadyReviewed) {
    return next(new ErrorResponse('Vous avez déjà noté ce produit', 400));
  }

  // Créer la review
  const review = {
    user: req.user._id,
    name: `${req.user.firstName} ${req.user.lastName}`,
    rating: Number(rating),
    comment,
    createdAt: new Date()
  };

  // Ajouter la review au produit
  product.reviews.push(review);
  product.numReviews = product.reviews.length;

  // Recalculer la moyenne des notes
  product.averageRating = 
    product.reviews.reduce((acc, item) => item.rating + acc, 0) / 
    product.reviews.length;

  await product.save();

  logger.info(`Nouvelle review ajoutée au produit ${product._id} par l'utilisateur ${req.user._id}`);

  res.status(201).json({
    success: true,
    data: review
  });
});