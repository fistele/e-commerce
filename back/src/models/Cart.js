const mongoose = require('mongoose');
const Product = require('./Product');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Un article du panier doit référencer un produit']
  },
  name: {
    type: String,
    required: [true, 'Un article du panier doit avoir un nom']
  },
  quantity: {
    type: Number,
    required: [true, 'La quantité est requise'],
    min: [1, 'La quantité doit être au moins 1'],
    max: [50, 'La quantité ne peut excéder 50']
  },
  price: {
    type: Number,
    required: [true, 'Le prix est requis'],
    min: [0, 'Le prix doit être positif']
  },
  size: {
    type: String,
    required: function() {
      // Seulement requis si le produit a des tailles
      const product = mongoose.model('Product').findById(this.product);
      return product && product.sizes && product.sizes.length > 0;
    }
  },
  color: {
    type: String,
    required: function() {
      // Seulement requis si le produit a des couleurs
      const product = mongoose.model('Product').findById(this.product);
      return product && product.colors && product.colors.length > 0;
    }
  },
  image: {
    type: String,
    required: [true, 'Une image est requise']
  }
}, { _id: true }); // Garder _id pour les opérations sur les items

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Un panier doit être associé à un utilisateur'],
    unique: true
  },
  items: {
    type: [cartItemSchema],
    default: []
  },
  discount: {
    code: String,
    value: Number,
    type: {
      type: String,
      enum: ['percentage', 'fixed']
    },
    appliedAt: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour optimisation
cartSchema.index({ user: 1 });
cartSchema.index({ updatedAt: -1 });

// Middleware de pré-sauvegarde
cartSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual pour le nombre total d'articles
cartSchema.virtual('itemCount').get(function() {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Virtual pour le sous-total
cartSchema.virtual('subtotal').get(function() {
  return this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
});

// Virtual pour le total après réduction
cartSchema.virtual('total').get(function() {
  const subtotal = this.subtotal;
  
  if (!this.discount) return subtotal;

  if (this.discount.type === 'fixed') {
    return Math.max(0, subtotal - this.discount.value);
  } else if (this.discount.type === 'percentage') {
    return subtotal * (1 - (this.discount.value / 100));
  }

  return subtotal;
});

// Méthode pour ajouter un article au panier
cartSchema.methods.addItem = async function(itemData) {
  const Product = mongoose.model('Product');
  const product = await Product.findById(itemData.product);

  if (!product) {
    throw new Error('Produit non trouvé');
  }

  // Vérifier le stock
  if (product.stock < itemData.quantity) {
    throw new Error(`Stock insuffisant. Disponible: ${product.stock}`);
  }

  // Vérifier si l'article existe déjà (même produit + taille + couleur)
  const existingItemIndex = this.items.findIndex(
    item => item.product.toString() === itemData.product.toString() && 
           item.size === itemData.size && 
           item.color === itemData.color
  );

  if (existingItemIndex >= 0) {
    // Mise à jour de la quantité
    this.items[existingItemIndex].quantity += itemData.quantity;
  } else {
    // Ajout d'un nouvel article
    this.items.push({
      product: itemData.product,
      name: product.name,
      quantity: itemData.quantity,
      price: product.price,
      size: itemData.size,
      color: itemData.color,
      image: product.images[0]?.url || 'default-product.jpg'
    });
  }

  return this.save();
};

// Méthode pour mettre à jour la quantité d'un article
cartSchema.methods.updateItemQuantity = async function(itemId, newQuantity) {
  if (newQuantity < 1) {
    throw new Error('La quantité doit être au moins 1');
  }

  const itemIndex = this.items.findIndex(
    item => item._id.toString() === itemId
  );

  if (itemIndex === -1) {
    throw new Error('Article non trouvé dans le panier');
  }

  // Vérifier le stock
  const Product = mongoose.model('Product');
  const product = await Product.findById(this.items[itemIndex].product);

  if (product.stock < newQuantity) {
    throw new Error(`Stock insuffisant. Disponible: ${product.stock}`);
  }

  this.items[itemIndex].quantity = newQuantity;
  return this.save();
};

// Méthode pour supprimer un article du panier
cartSchema.methods.removeItem = async function(itemId) {
  const itemIndex = this.items.findIndex(
    item => item._id.toString() === itemId
  );

  if (itemIndex === -1) {
    throw new Error('Article non trouvé dans le panier');
  }

  this.items.splice(itemIndex, 1);
  return this.save();
};

// Méthode pour vider le panier
cartSchema.methods.clearCart = async function() {
  this.items = [];
  this.discount = undefined;
  return this.save();
};

// Méthode pour appliquer un code promo
cartSchema.methods.applyDiscount = async function(code, value, type) {
  if (type !== 'percentage' && type !== 'fixed') {
    throw new Error('Type de réduction invalide');
  }

  if (type === 'percentage' && (value < 1 || value > 100)) {
    throw new Error('Pourcentage de réduction invalide');
  }

  if (type === 'fixed' && value < 0) {
    throw new Error('Montant fixe de réduction invalide');
  }

  this.discount = {
    code,
    value,
    type,
    appliedAt: Date.now()
  };

  return this.save();
};

// Méthode pour supprimer la réduction
cartSchema.methods.removeDiscount = async function() {
  this.discount = undefined;
  return this.save();
};

// Middleware de post-sauvegarde pour garder le panier à jour
cartSchema.post('save', async function(doc) {
  // Synchroniser les prix avec les produits actuels
  const Product = mongoose.model('Product');
  const updates = [];

  for (const item of doc.items) {
    const product = await Product.findById(item.product);
    if (product && product.price !== item.price) {
      updates.push({
        updateOne: {
          filter: { _id: doc._id, 'items._id': item._id },
          update: { $set: { 'items.$.price': product.price } }
        }
      });
    }
  }

  if (updates.length > 0) {
    await mongoose.model('Cart').bulkWrite(updates);
  }
});

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;