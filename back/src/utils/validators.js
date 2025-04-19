const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const validator = require('validator');
const Product = require('../models/Product');
const User = require('../models/User');

/**
 * Validateurs communs réutilisables
 */
const commonValidators = {
  objectId: (field) => param(field)
    .custom(value => mongoose.Types.ObjectId.isValid(value))
    .withMessage('ID invalide'),

  email: body('email')
    .isEmail()
    .withMessage('Email invalide')
    .normalizeEmail(),

  strongPassword: body('password')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit faire au moins 8 caractères')
    .matches(/[A-Z]/)
    .withMessage('Doit contenir une majuscule')
    .matches(/[a-z]/)
    .withMessage('Doit contenir une minuscule')
    .matches(/[0-9]/)
    .withMessage('Doit contenir un chiffre')
    .matches(/[^A-Za-z0-9]/)
    .withMessage('Doit contenir un caractère spécial')
};

/**
 * Validateurs pour l'authentification
 */
const authValidators = {
  register: [
    commonValidators.email,
    commonValidators.strongPassword,
    body('name')
      .trim()
      .isLength({ min: 2 })
      .withMessage('Le nom doit faire au moins 2 caractères'),
    body('phone')
      .optional()
      .custom(value => {
        const phone = value.replace(/\D/g, '');
        return phone.length >= 10;
      })
      .withMessage('Numéro de téléphone invalide')
  ],

  login: [
    commonValidators.email,
    body('password').notEmpty().withMessage('Mot de passe requis')
  ],

  forgotPassword: [
    commonValidators.email
  ],

  resetPassword: [
    commonValidators.strongPassword,
    body('token').notEmpty().withMessage('Token requis')
  ]
};

/**
 * Validateurs pour les produits
 */
const productValidators = {
  createProduct: [
    body('name')
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Le nom doit faire entre 3 et 100 caractères'),
    body('description')
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage('La description doit faire entre 10 et 2000 caractères'),
    body('price')
      .isFloat({ min: 0.01 })
      .withMessage('Prix invalide (doit être > 0)'),
    body('stock')
      .isInt({ min: 0 })
      .withMessage('Stock invalide (doit être ≥ 0)'),
    body('category')
      .custom(value => mongoose.Types.ObjectId.isValid(value))
      .withMessage('Catégorie invalide'),
    body('sku')
      .optional()
      .isAlphanumeric()
      .withMessage('SKU doit être alphanumérique'),
    body('images.*')
      .optional()
      .isURL()
      .withMessage('URL d\'image invalide')
  ],

  updateProduct: [
    commonValidators.objectId('id'),
    ...productValidators.createProduct.map(validator => validator.optional())
  ],

  productId: [
    commonValidators.objectId('id')
      .custom(async (value) => {
        const product = await Product.findById(value);
        if (!product) throw new Error('Produit non trouvé');
      })
  ]
};

/**
 * Validateurs pour les utilisateurs
 */
const userValidators = {
  updateProfile: [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2 })
      .withMessage('Le nom doit faire au moins 2 caractères'),
    body('phone')
      .optional()
      .custom(value => {
        const phone = value.replace(/\D/g, '');
        return phone.length >= 10;
      })
      .withMessage('Numéro de téléphone invalide'),
    body('address')
      .optional()
      .isObject()
      .withMessage('Adresse invalide'),
    body('address.street')
      .if(body('address').exists())
      .notEmpty()
      .withMessage('Rue requise'),
    body('address.city')
      .if(body('address').exists())
      .notEmpty()
      .withMessage('Ville requise'),
    body('address.zipCode')
      .if(body('address').exists())
      .isPostalCode('FR')
      .withMessage('Code postal invalide')
  ],

  userId: [
    commonValidators.objectId('id')
      .custom(async (value) => {
        const user = await User.findById(value);
        if (!user) throw new Error('Utilisateur non trouvé');
      })
  ]
};

/**
 * Validateurs pour les commandes
 */
const orderValidators = {
  createOrder: [
    body('items')
      .isArray({ min: 1 })
      .withMessage('Au moins un article est requis'),
    body('items.*.product')
      .custom(value => mongoose.Types.ObjectId.isValid(value))
      .withMessage('ID produit invalide'),
    body('items.*.quantity')
      .isInt({ min: 1 })
      .withMessage('Quantité invalide (doit être ≥ 1)'),
    body('shippingAddress')
      .isObject()
      .withMessage('Adresse de livraison invalide'),
    body('paymentMethod')
      .isIn(['card', 'paypal', 'bank_transfer'])
      .withMessage('Méthode de paiement invalide')
  ],

  orderId: [
    commonValidators.objectId('id')
  ]
};

/**
 * Validateurs pour les paramètres de requête
 */
const queryValidators = {
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page doit être un nombre ≥ 1'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit doit être entre 1 et 100')
  ],

  productFilters: [
    query('category')
      .optional()
      .custom(value => mongoose.Types.ObjectId.isValid(value))
      .withMessage('ID catégorie invalide'),
    query('priceMin')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Prix minimum invalide'),
    query('priceMax')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Prix maximum invalide'),
    query('sort')
      .optional()
      .isIn(['price', '-price', 'rating', '-rating', 'newest'])
      .withMessage('Valeur de tri invalide')
  ]
};

module.exports = {
  ...authValidators,
  ...productValidators,
  ...userValidators,
  ...orderValidators,
  ...queryValidators,
  common: commonValidators
};