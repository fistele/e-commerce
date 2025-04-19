const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ErrorResponse = require('../utils/error.response');
const asyncHandler = require('../utils/async.handler');

// Protection des routes - utilisateur doit être authentifié
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  // 1) Vérification du token dans le header Authorization
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }
  // 2) Vérification du token dans les cookies
  else if (req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return next(
      new ErrorResponse('Non autorisé - Veuillez vous connecter', 401)
    );
  }

  try {
    // 3) Vérification et décodage du token JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4) Récupération de l'utilisateur et vérification de son existence
    const currentUser = await User.findById(decoded.id).select('+passwordChangedAt');
    
    if (!currentUser) {
      return next(
        new ErrorResponse('Le token appartient à un utilisateur qui n\'existe plus', 401)
      );
    }

    // 5) Vérification si le mot de passe a été changé après l'émission du token
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return next(
        new ErrorResponse('Mot de passe modifié récemment - Veuillez vous reconnecter', 401)
      );
    }

    // 6) Ajout de l'utilisateur à l'objet request
    req.user = currentUser;
    res.locals.user = currentUser;
    next();
  } catch (err) {
    return next(
      new ErrorResponse('Non autorisé - Token invalide', 401)
    );
  }
});

// Gestion des rôles et permissions
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorResponse(
          `Le rôle ${req.user.role} n'est pas autorisé à accéder à cette ressource`,
          403
        )
      );
    }
    next();
  };
};

// Vérification de la propriété (user est-il propriétaire de la ressource ?)
exports.ownership = (model, paramName = 'id') => {
  return asyncHandler(async (req, res, next) => {
    const document = await model.findById(req.params[paramName]);

    if (!document) {
      return next(
        new ErrorResponse('Ressource non trouvée', 404)
      );
    }

    // Admin peut tout faire
    if (req.user.role === 'admin') return next();

    // Vérification que l'utilisateur est propriétaire
    if (document.user.toString() !== req.user.id) {
      return next(
        new ErrorResponse('Non autorisé - Vous n\'êtes pas propriétaire de cette ressource', 403)
      );
    }

    next();
  });
};

// Middleware pour les comptes vérifiés
exports.verified = (req, res, next) => {
  if (!req.user.isVerified) {
    return next(
      new ErrorResponse('Accès refusé - Veuillez vérifier votre email', 403)
    );
  }
  next();
};