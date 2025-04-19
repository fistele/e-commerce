const mongoose = require('mongoose');
const slugify = require('slugify');
const validator = require('validator');

const productSchema = new mongoose.Schema({
  // Identifiants
  sku: {
    type: String,
    unique: true,
    trim: true,
    uppercase: true
  },

  // Informations de base
  name: {
    type: String,
    required: [true, 'Le nom est obligatoire'],
    trim: true,
    maxlength: [120, 'Le nom ne peut pas dépasser 120 caractères'],
    minlength: [3, 'Le nom doit contenir au moins 3 caractères']
  },
  slug: String,
  description: {
    type: String,
    required: [true, 'La description est obligatoire'],
    trim: true,
    maxlength: [2000, 'La description ne peut pas dépasser 2000 caractères']
  },
  summary: {
    type: String,
    trim: true,
    maxlength: [300, 'Le résumé ne peut pas dépasser 300 caractères']
  },

  // Prix et stock
  price: {
    type: Number,
    required: [true, 'Le prix est obligatoire'],
    min: [0, 'Le prix doit être positif']
  },
  comparePrice: {
    type: Number,
    validate: {
      validator: function(val) {
        return val >= this.price;
      },
      message: 'Le prix de comparaison doit être supérieur ou égal au prix'
    }
  },
  costPerItem: Number,
  profitMargin: Number,
  stock: {
    type: Number,
    required: [true, 'Le stock est obligatoire'],
    min: [0, 'Le stock ne peut pas être négatif'],
    default: 0
  },
  lowStockThreshold: {
    type: Number,
    default: 5,
    min: [0, 'Le seuil de stock faible ne peut pas être négatif']
  },

  // Variantes
  sizes: [{
    type: String,
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL']
  }],
  colors: [String],
  materials: [String],

  // Images
  images: [{
    url: String,
    publicId: String,
    altText: String,
    isDefault: Boolean
  }],
  thumbnail: String,

  // Catégorisation
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'La catégorie est obligatoire']
  },
  collections: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Collection'
  }],
  tags: [String],

  // Évaluations
  reviews: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      maxlength: [500, 'Le commentaire ne peut pas dépasser 500 caractères']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  averageRating: {
    type: Number,
    min: [1, 'La note doit être au moins 1'],
    max: [5, 'La note ne peut pas dépasser 5'],
    set: val => Math.round(val * 10) / 10
  },
  numReviews: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  },

  // Métadonnées
  featured: {
    type: Boolean,
    default: false
  },
  published: {
    type: Boolean,
    default: true
  },
  isNew: {
    type: Boolean,
    default: false
  },
  bestSeller: {
    type: Boolean,
    default: false
  },

  // SEO
  seoTitle: String,
  seoDescription: String,
  seoKeywords: [String],

  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour la recherche
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ slug: 1 });
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });
productSchema.index({ averageRating: -1 });

// Middleware de pré-sauvegarde
productSchema.pre('save', function(next) {
  // Génération du slug
  this.slug = slugify(this.name, { lower: true, strict: true });

  // Calcul du profit si coût et prix fournis
  if (this.costPerItem && this.price) {
    this.profitMargin = ((this.price - this.costPerItem) / this.price) * 100;
  }

  // Mise à jour de la date de modification
  this.updatedAt = Date.now();

  // Génération du SKU si non fourni
  if (!this.sku) {
    const random = Math.floor(1000 + Math.random() * 9000);
    this.sku = `${this.slug.slice(0, 3).toUpperCase()}-${random}`;
  }

  next();
});

// Middleware de pré-update
productSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Virtual pour le statut de stock
productSchema.virtual('stockStatus').get(function() {
  if (this.stock === 0) {
    return 'out-of-stock';
  } else if (this.stock <= this.lowStockThreshold) {
    return 'low-stock';
  } else {
    return 'in-stock';
  }
});

// Virtual pour les produits similaires
productSchema.virtual('relatedProducts', {
  ref: 'Product',
  localField: 'category',
  foreignField: 'category',
  justOne: false,
  options: { limit: 4 }
});

// Méthode pour ajouter une image
productSchema.methods.addImage = function(imageData) {
  this.images.push(imageData);
  return this.save();
};

// Méthode pour supprimer une image
productSchema.methods.removeImage = async function(publicId) {
  this.images = this.images.filter(img => img.publicId !== publicId);
  await this.save();
  return this;
};

// Méthode pour mettre à jour la note moyenne
productSchema.methods.updateAverageRating = async function() {
  if (this.reviews.length === 0) {
    this.averageRating = 0;
    this.numReviews = 0;
    return this.save();
  }

  const sum = this.reviews.reduce((acc, item) => acc + item.rating, 0);
  this.averageRating = sum / this.reviews.length;
  this.numReviews = this.reviews.length;
  await this.save();
};

// Middleware de pré-remove
productSchema.pre('remove', async function(next) {
  // Supprimer les références dans les paniers
  await this.model('Cart').updateMany(
    { 'items.product': this._id },
    { $pull: { items: { product: this._id } } }
  );

  // Supprimer les avis associés
  await this.model('Review').deleteMany({ product: this._id });

  next();
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;