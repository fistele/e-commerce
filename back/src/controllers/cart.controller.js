const Cart = require('../models/Cart');
const Product = require('../models/Product');
const ErrorResponse = require('../utils/ErrorResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
exports.getCart = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOne({ user: req.user.id })
    .populate({
      path: 'items.product',
      select: 'name price images stock'
    });

  if (!cart) {
    return next(new ErrorResponse('Panier non trouvé', 404));
  }

  // Calcul du total
  const total = cart.items.reduce((sum, item) => {
    return sum + (item.quantity * item.product.price);
  }, 0);

  res.json({
    success: true,
    count: cart.items.length,
    total: parseFloat(total.toFixed(2)),
    data: cart
  });
});

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
exports.addToCart = asyncHandler(async (req, res, next) => {
  const { productId, quantity, size, color } = req.body;

  // Validation des données
  if (!productId || !quantity || !size) {
    return next(new ErrorResponse('ProductId, quantity et size sont requis', 400));
  }

  // Vérification du produit
  const product = await Product.findById(productId);
  if (!product) {
    return next(new ErrorResponse('Produit non trouvé', 404));
  }

  // Vérification du stock
  if (product.stock < quantity) {
    return next(new ErrorResponse(`Stock insuffisant. Disponible: ${product.stock}`, 400));
  }

  // Vérification de la taille
  if (!product.sizes.includes(size)) {
    return next(new ErrorResponse(`Taille non disponible. Tailles valides: ${product.sizes.join(', ')}`, 400));
  }

  // Vérification de la couleur si spécifiée
  if (color && !product.colors.includes(color)) {
    return next(new ErrorResponse(`Couleur non disponible. Couleurs valides: ${product.colors.join(', ')}`, 400));
  }

  // Recherche du panier existant
  let cart = await Cart.findOne({ user: req.user.id });

  // Création du panier s'il n'existe pas
  if (!cart) {
    cart = await Cart.create({ user: req.user.id, items: [] });
  }

  // Vérification si le produit est déjà dans le panier
  const existingItemIndex = cart.items.findIndex(
    item => item.product.toString() === productId && item.size === size && item.color === color
  );

  if (existingItemIndex >= 0) {
    // Mise à jour de la quantité
    cart.items[existingItemIndex].quantity += quantity;
  } else {
    // Ajout d'un nouvel item
    cart.items.push({
      product: productId,
      quantity,
      size,
      color,
      price: product.price
    });
  }

  await cart.save();

  // Mise à jour du stock (optionnel - peut être fait au checkout)
  // product.stock -= quantity;
  // await product.save();

  logger.info(`Produit ajouté au panier: User ${req.user.id}, Product ${productId}`);

  res.status(201).json({
    success: true,
    message: 'Produit ajouté au panier',
    data: cart
  });
});

// @desc    Update cart item quantity
// @route   PUT /api/cart/:itemId
// @access  Private
exports.updateCartItem = asyncHandler(async (req, res, next) => {
  const { quantity } = req.body;

  if (!quantity || quantity < 1) {
    return next(new ErrorResponse('Quantité valide requise', 400));
  }

  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) {
    return next(new ErrorResponse('Panier non trouvé', 404));
  }

  const itemIndex = cart.items.findIndex(
    item => item._id.toString() === req.params.itemId
  );

  if (itemIndex === -1) {
    return next(new ErrorResponse('Article non trouvé dans le panier', 404));
  }

  // Vérification du stock
  const product = await Product.findById(cart.items[itemIndex].product);
  if (product.stock < quantity) {
    return next(new ErrorResponse(`Stock insuffisant. Disponible: ${product.stock}`, 400));
  }

  // Calcul de la différence pour ajuster le stock si nécessaire
  const quantityDifference = quantity - cart.items[itemIndex].quantity;

  cart.items[itemIndex].quantity = quantity;
  await cart.save();

  // Ajustement du stock (optionnel)
  // product.stock -= quantityDifference;
  // await product.save();

  logger.info(`Quantité panier mise à jour: User ${req.user.id}, Item ${req.params.itemId}`);

  res.json({
    success: true,
    message: 'Quantité mise à jour',
    data: cart
  });
});

// @desc    Remove item from cart
// @route   DELETE /api/cart/:itemId
// @access  Private
exports.removeFromCart = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) {
    return next(new ErrorResponse('Panier non trouvé', 404));
  }

  const itemIndex = cart.items.findIndex(
    item => item._id.toString() === req.params.itemId
  );

  if (itemIndex === -1) {
    return next(new ErrorResponse('Article non trouvé dans le panier', 404));
  }

  // Récupération de la quantité pour ajuster le stock si nécessaire
  const removedItem = cart.items[itemIndex];

  cart.items.splice(itemIndex, 1);
  await cart.save();

  // Réapprovisionnement du stock (optionnel)
  // const product = await Product.findById(removedItem.product);
  // product.stock += removedItem.quantity;
  // await product.save();

  logger.info(`Produit retiré du panier: User ${req.user.id}, Item ${req.params.itemId}`);

  res.json({
    success: true,
    message: 'Article retiré du panier',
    data: cart
  });
});

// @desc    Clear cart
// @route   DELETE /api/cart
// @access  Private
exports.clearCart = asyncHandler(async (req, res, next) => {
  const cart = await Cart.findOneAndUpdate(
    { user: req.user.id },
    { $set: { items: [] } },
    { new: true }
  );

  if (!cart) {
    return next(new ErrorResponse('Panier non trouvé', 404));
  }

  logger.info(`Panier vidé: User ${req.user.id}`);

  res.json({
    success: true,
    message: 'Panier vidé',
    data: cart
  });
});

// @desc    Apply discount code
// @route   POST /api/cart/discount
// @access  Private
exports.applyDiscount = asyncHandler(async (req, res, next) => {
  const { code } = req.body;

  if (!code) {
    return next(new ErrorResponse('Code promo requis', 400));
  }

  // Ici vous intégreriez votre logique de validation du code promo
  // Ceci est un exemple basique
  const validCodes = {
    'ETE2023': { discount: 0.1, type: 'percentage' }, // 10% de réduction
    'FREE50': { discount: 50, type: 'fixed' } // 50€ de réduction
  };

  const discount = validCodes[code];

  if (!discount) {
    return next(new ErrorResponse('Code promo invalide', 400));
  }

  const cart = await Cart.findOneAndUpdate(
    { user: req.user.id },
    { discountCode: code, discountValue: discount },
    { new: true }
  );

  if (!cart) {
    return next(new ErrorResponse('Panier non trouvé', 404));
  }

  logger.info(`Code promo appliqué: User ${req.user.id}, Code ${code}`);

  res.json({
    success: true,
    message: 'Code promo appliqué',
    data: cart
  });
});