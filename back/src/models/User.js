
const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const crypto = require('crypto');

const { roles } = require('../utils/constants');

const userSchema = new mongoose.Schema({
  // Informations de base
  email: {
    type: String,
    required: [true, 'Email est requis'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Veuillez fournir un email valide'],
    trim: true
  },
  password: {
    type: String,
    required: [
      function() { return !this.oauth.google && !this.oauth.linkedin; },
      'Mot de passe requis pour les comptes locaux'
    ],
    minlength: [8, 'Le mot de passe doit contenir au moins 8 caractères'],
    select: false
  },
  firstName: {
    type: String,
    required: [true, 'Le prénom est requis'],
    trim: true,
    maxlength: [50, 'Le prénom ne peut excéder 50 caractères']
  },
  lastName: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
    maxlength: [50, 'Le nom ne peut excéder 50 caractères']
  },
  phone: {
    type: String,
    validate: {
      validator: function(v) {
        return /^(\+\d{1,3}[- ]?)?\d{10}$/.test(v);
      },
      message: props => `${props.value} n'est pas un numéro valide!`
    }
  },

  // Authentification
  role: {
    type: String,
    enum: Object.values(roles),
    default: roles.user
  },
  oauth: {
    google: String,
    linkedin: String,
    facebook: String
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,

  // Sécurité
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  isBanned: {
    type: Boolean,
    default: false
  },

  // Adresse
  addresses: [{
    type: {
      street: String,
      city: String,
      postalCode: String,
      country: String,
      isDefault: Boolean
    },
    _id: false
  }],

  // Préférences
  wishlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  preferences: {
    newsletter: {
      type: Boolean,
      default: true
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    }
  },

  // Statistiques
  lastLogin: Date,
  loginCount: {
    type: Number,
    default: 0
  },
  orderCount: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },

  // Métadonnées
  avatar: {
    type: String,
    default: 'default-avatar.jpg'
  },
  bio: {
    type: String,
    maxlength: [250, 'La bio ne peut excéder 250 caractères']
  },
  socialMedia: {
    twitter: String,
    instagram: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour optimisation
userSchema.index({ email: 1 });
userSchema.index({ 'oauth.google': 1 });
userSchema.index({ 'oauth.linkedin': 1 });
userSchema.index({ role: 1 });

// Middleware de pré-sauvegarde pour le hashage du mot de passe
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    this.password = await bcrypt.hash(this.password, 12);
    if (!this.isNew) this.passwordChangedAt = Date.now() - 1000;
    next();
  } catch (err) {
    next(err);
  }
});

// Middleware pour les updates
userSchema.pre('findOneAndUpdate', function(next) {
  if (this._update.password) {
    this._update.password = bcrypt.hashSync(this._update.password, 12);
    this._update.passwordChangedAt = Date.now() - 1000;
  }
  next();
});

// Méthode pour comparer les mots de passe
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Génération de token JWT
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this._id, 
      role: this.role,
      email: this.email
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
};

// Vérification si le mot de passe a été changé après l'émission du token
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Génération de token de réinitialisation
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

// Génération de token de vérification email
userSchema.methods.createEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(20).toString('hex');

  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');

  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 heures

  return verificationToken;
};

// Gestion des tentatives de connexion
userSchema.methods.incrementLoginAttempts = async function() {
  if (this.lockUntil && this.lockUntil > Date.now()) {
    throw new Error('Compte temporairement verrouillé');
  }

  this.loginAttempts += 1;

  if (this.loginAttempts >= 5) {
    this.lockUntil = Date.now() + 30 * 60 * 1000; // Verrouillage 30 minutes
  }

  await this.save();
};

// Réinitialisation des tentatives après connexion réussie
userSchema.methods.resetLoginAttempts = async function() {
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  this.lastLogin = Date.now();
  this.loginCount += 1;
  await this.save();
};

// Virtual pour le nom complet
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual pour l'adresse par défaut
userSchema.virtual('defaultAddress').get(function() {
  return this.addresses.find(addr => addr.isDefault) || this.addresses[0];
});

// Middleware de pré-remove
userSchema.pre('remove', async function(next) {
  // Supprimer les données liées
  await this.model('Order').deleteMany({ user: this._id });
  await this.model('Review').deleteMany({ user: this._id });
  await this.model('Cart').deleteMany({ user: this._id });
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;