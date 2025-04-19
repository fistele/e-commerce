const User = require('../models/User');
const ErrorResponse = require('../utils/error.response');
const asyncHandler = require('../utils/async.handler');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../services/email.service');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res, next) => {
  const { email, password, firstName, lastName } = req.body;

  // Vérification de l'existence de l'utilisateur
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorResponse('Email déjà utilisé', 400));
  }

  // Création de l'utilisateur
  const user = await User.create({
    email,
    password,
    firstName,
    lastName,
    emailVerificationToken: crypto.randomBytes(20).toString('hex'),
    emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000 // 24h
  });

  // Envoi de l'email de vérification
  const verificationUrl = `${req.protocol}://${req.get('host')}/api/auth/verify-email/${user.emailVerificationToken}`;
  
  try {
    await sendEmail({
      email: user.email,
      subject: 'Vérification de votre email',
      template: 'email-verification',
      context: {
        name: user.firstName,
        verificationUrl
      }
    });

    logger.info(`Email de vérification envoyé à ${user.email}`);
  } catch (err) {
    logger.error(`Erreur envoi email vérification: ${err.message}`);
    return next(new ErrorResponse('Email ne peut pas être envoyé', 500));
  }

  // Génération du token JWT
  const token = user.generateAuthToken();

  res.status(201).json({
    success: true,
    token,
    data: {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    }
  });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Vérification des champs
  if (!email || !password) {
    return next(new ErrorResponse('Veuillez fournir un email et un mot de passe', 400));
  }

  // Recherche de l'utilisateur avec le mot de passe
  const user = await User.findOne({ email }).select('+password +isBanned');

  if (!user) {
    return next(new ErrorResponse('Identifiants invalides', 401));
  }

  // Vérification du bannissement
  if (user.isBanned) {
    return next(new ErrorResponse('Votre compte a été suspendu', 403));
  }

  // Vérification du mot de passe
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return next(new ErrorResponse('Identifiants invalides', 401));
  }

  // Vérification de l'email
  if (!user.isEmailVerified) {
    return next(new ErrorResponse('Veuillez vérifier votre email avant de vous connecter', 401));
  }

  // Génération du token JWT
  const token = user.generateAuthToken();

  // Mise à jour de la dernière connexion
  user.lastLogin = Date.now();
  await user.save();

  logger.info(`Connexion réussie pour l'utilisateur ${user._id}`);

  res.json({
    success: true,
    token,
    data: {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    }
  });
});

// @desc    Verify email
// @route   GET /api/auth/verify-email/:token
// @access  Public
exports.verifyEmail = asyncHandler(async (req, res, next) => {
  // Recherche de l'utilisateur
  const user = await User.findOne({
    emailVerificationToken: req.params.token,
    emailVerificationExpires: { $gt: Date.now() }
  });

  if (!user) {
    return next(new ErrorResponse('Token invalide ou expiré', 400));
  }

  // Mise à jour de l'utilisateur
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  logger.info(`Email vérifié pour l'utilisateur ${user._id}`);

  res.json({
    success: true,
    message: 'Email vérifié avec succès'
  });
});

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return next(new ErrorResponse('Aucun utilisateur avec cet email', 404));
  }

  // Génération du token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // Envoi de l'email
  const resetUrl = `${req.protocol}://${req.headers.host}/api/auth/reset-password/${resetToken}`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Réinitialisation de votre mot de passe',
      template: 'password-reset',
      context: {
        name: user.firstName,
        resetUrl
      }
    });

    logger.info(`Email de réinitialisation envoyé à ${user.email}`);

    res.json({
      success: true,
      message: 'Email envoyé avec les instructions'
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    logger.error(`Erreur envoi email réinitialisation: ${err.message}`);
    return next(new ErrorResponse('Email ne peut pas être envoyé', 500));
  }
});

// @desc    Reset password
// @route   PATCH /api/auth/reset-password/:token
// @access  Public
exports.resetPassword = asyncHandler(async (req, res, next) => {
  // Hash du token reçu
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  // Recherche de l'utilisateur
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });

  if (!user) {
    return next(new ErrorResponse('Token invalide ou expiré', 400));
  }

  // Mise à jour du mot de passe
  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // Génération du nouveau token
  const token = user.generateAuthToken();

  logger.info(`Mot de passe réinitialisé pour l'utilisateur ${user._id}`);

  res.json({
    success: true,
    token,
    message: 'Mot de passe réinitialisé avec succès'
  });
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('-password');

  res.json({
    success: true,
    data: user
  });
});

// @desc    Update user details
// @route   PUT /api/auth/update-details
// @access  Private
exports.updateDetails = asyncHandler(async (req, res, next) => {
  const fieldsToUpdate = {
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    email: req.body.email,
    phone: req.body.phone
  };

  const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
    new: true,
    runValidators: true
  }).select('-password');

  logger.info(`Détails utilisateur mis à jour: ${user._id}`);

  res.json({
    success: true,
    data: user
  });
});

// @desc    Update password
// @route   PUT /api/auth/update-password
// @access  Private
exports.updatePassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('+password');

  // Vérification de l'ancien mot de passe
  if (!(await user.comparePassword(req.body.currentPassword))) {
    return next(new ErrorResponse('Mot de passe actuel incorrect', 401));
  }

  // Mise à jour du mot de passe
  user.password = req.body.newPassword;
  await user.save();

  // Génération du nouveau token
  const token = user.generateAuthToken();

  logger.info(`Mot de passe mis à jour pour l'utilisateur ${user._id}`);

  res.json({
    success: true,
    token,
    message: 'Mot de passe mis à jour avec succès'
  });
});

// @desc    Logout user
// @route   GET /api/auth/logout
// @access  Private
exports.logout = asyncHandler(async (req, res, next) => {
  // Dans une implémentation avec liste noire de tokens, on l'ajouterait ici
  logger.info(`Utilisateur déconnecté: ${req.user.id}`);

  res.json({
    success: true,
    message: 'Déconnecté avec succès'
  });
});

// @desc    OAuth callback
// @route   GET /api/auth/:provider/callback
// @access  Public
exports.oauthCallback = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse('Échec de l\'authentification', 401));
  }

  const token = req.user.generateAuthToken();
  const redirectUrl = `${process.env.FRONTEND_URL}/oauth?token=${token}`;

  logger.info(`Connexion OAuth réussie pour ${req.user._id} via ${req.params.provider}`);

  res.redirect(redirectUrl);
});

// @desc    Confirm email (alternative à verifyEmail)
// @route   POST /api/auth/confirm-email
// @access  Private
exports.confirmEmail = asyncHandler(async (req, res, next) => {
  const { token } = req.body;

  if (!token) {
    return next(new ErrorResponse('Token de confirmation requis', 400));
  }

  // Recherche de l'utilisateur
  const user = await User.findOne({
    emailVerificationToken: token,
    emailVerificationExpires: { $gt: Date.now() }
  });

  if (!user) {
    return next(new ErrorResponse('Token invalide ou expiré', 400));
  }

  // Mise à jour de l'utilisateur
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  // Régénération du token avec email vérifié
  const authToken = user.generateAuthToken();

  logger.info(`Email confirmé pour l'utilisateur ${user._id}`);

  res.json({
    success: true,
    token: authToken,
    message: 'Email confirmé avec succès'
  });
});

// @desc    Link OAuth provider to account
// @route   POST /api/auth/:provider/link
// @access  Private
exports.linkProvider = asyncHandler(async (req, res, next) => {
  const { provider } = req.params;
  const { accessToken } = req.body;
  const validProviders = ['google', 'facebook', 'linkedin'];

  if (!validProviders.includes(provider)) {
    return next(new ErrorResponse('Fournisseur OAuth non supporté', 400));
  }

  if (!accessToken) {
    return next(new ErrorResponse('Token d\'accès requis', 400));
  }

  // Ici vous devriez valider le token avec le provider
  // Ceci est un exemple simplifié
  const providerData = {
    id: `oauth_${crypto.randomBytes(10).toString('hex')}`,
    token: accessToken
  };

  // Mise à jour de l'utilisateur
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { 
      [`${provider}Id`]: providerData.id,
      [`${provider}Data`]: providerData 
    },
    { new: true }
  );

  logger.info(`Provider ${provider} lié pour l'utilisateur ${user._id}`);

  res.json({
    success: true,
    data: {
      [provider]: true
    },
    message: `Compte ${provider} lié avec succès`
  });
});

// @desc    Unlink OAuth provider from account
// @route   POST /api/auth/:provider/unlink
// @access  Private
exports.unlinkProvider = asyncHandler(async (req, res, next) => {
  const { provider } = req.params;
  const validProviders = ['google', 'facebook', 'linkedin'];

  if (!validProviders.includes(provider)) {
    return next(new ErrorResponse('Fournisseur OAuth non supporté', 400));
  }

  // Vérification qu'il reste au moins une méthode d'authentification
  const user = await User.findById(req.user.id);
  const hasPassword = !!user.password;
  const linkedProviders = validProviders.filter(p => user[`${p}Id`]);

  if (!hasPassword && linkedProviders.length <= 1) {
    return next(new ErrorResponse(
      'Vous devez avoir au moins une méthode d\'authentification', 
      400
    ));
  }

  // Mise à jour de l'utilisateur
  await User.findByIdAndUpdate(
    req.user.id,
    { 
      [`${provider}Id`]: undefined,
      [`${provider}Data`]: undefined 
    }
  );

  logger.info(`Provider ${provider} délié pour l'utilisateur ${user._id}`);

  res.json({
    success: true,
    data: {
      [provider]: false
    },
    message: `Compte ${provider} délié avec succès`
  });
});