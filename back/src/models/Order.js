const mongoose = require('mongoose');
const validator = require('validator');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Un article doit avoir un produit associé']
  },
  name: {
    type: String,
    required: [true, 'Un article doit avoir un nom']
  },
  quantity: {
    type: Number,
    required: [true, 'Un article doit avoir une quantité'],
    min: [1, 'La quantité doit être au moins 1']
  },
  price: {
    type: Number,
    required: [true, 'Un article doit avoir un prix'],
    min: [0, 'Le prix doit être positif']
  },
  size: {
    type: String,
    required: function() {
      return this.product?.sizes?.length > 0;
    }
  },
  color: String,
  image: String,
  _id: false // Désactive l'auto-génération d'_id pour les sous-documents
});

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Une commande doit être associée à un utilisateur']
  },
  items: {
    type: [orderItemSchema],
    required: [true, 'Une commande doit contenir des articles'],
    validate: {
      validator: function(items) {
        return items.length > 0;
      },
      message: 'Une commande doit contenir au moins un article'
    }
  },
  shippingAddress: {
    type: {
      street: { type: String, required: [true, 'La rue est requise'] },
      city: { type: String, required: [true, 'La ville est requise'] },
      postalCode: { type: String, required: [true, 'Le code postal est requis'] },
      country: { type: String, required: [true, 'Le pays est requis'] },
      phone: { 
        type: String,
        validate: {
          validator: function(v) {
            return /^(\+\d{1,3}[- ]?)?\d{10}$/.test(v);
          },
          message: props => `${props.value} n'est pas un numéro de téléphone valide!`
        }
      }
    },
    required: [true, 'Une adresse de livraison est requise']
  },
  paymentMethod: {
    type: String,
    enum: ['credit_card', 'paypal', 'bank_transfer', 'cash_on_delivery'],
    required: [true, 'Une méthode de paiement est requise']
  },
  paymentResult: {
    id: String,
    status: String,
    update_time: String,
    email_address: String
  },
  itemsPrice: {
    type: Number,
    required: [true, 'Le prix des articles est requis'],
    default: 0.0
  },
  taxPrice: {
    type: Number,
    required: [true, 'Le prix de la taxe est requis'],
    default: 0.0
  },
  shippingPrice: {
    type: Number,
    required: [true, 'Le prix de livraison est requis'],
    default: 0.0
  },
  totalPrice: {
    type: Number,
    required: [true, 'Le prix total est requis'],
    default: 0.0
  },
  isPaid: {
    type: Boolean,
    required: [true, 'Le statut de paiement est requis'],
    default: false
  },
  paidAt: Date,
  isDelivered: {
    type: Boolean,
    required: [true, 'Le statut de livraison est requis'],
    default: false
  },
  deliveredAt: Date,
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  trackingNumber: String,
  carrier: String,
  notes: String,
  discount: {
    code: String,
    value: Number,
    type: {
      type: String,
      enum: ['percentage', 'fixed']
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour optimisation des requêtes
orderSchema.index({ user: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'paymentMethod': 1 });
orderSchema.index({ totalPrice: 1 });

// Middleware de pré-sauvegarde pour calculer les prix
orderSchema.pre('save', function(next) {
  // Calcul du prix des articles
  this.itemsPrice = this.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  // Calcul de la taxe (20% par défaut)
  this.taxPrice = parseFloat((this.itemsPrice * 0.2).toFixed(2));

  // Calcul des frais de livraison (gratuit si > 100€)
  this.shippingPrice = this.itemsPrice > 100 ? 0 : 10;

  // Calcul du prix total
  this.totalPrice = parseFloat((
    this.itemsPrice + 
    this.taxPrice + 
    this.shippingPrice -
    (this.discount?.type === 'fixed' ? this.discount.value : 0) -
    (this.discount?.type === 'percentage' ? (this.itemsPrice * (this.discount.value / 100)) : 0)
  ).toFixed(2));

  // Mise à jour du statut si payé
  if (this.isModified('isPaid') && this.isPaid) {
    this.paidAt = Date.now();
    this.status = 'processing';
  }

  // Mise à jour du statut si livré
  if (this.isModified('isDelivered') && this.isDelivered) {
    this.deliveredAt = Date.now();
    this.status = 'delivered';
  }

  next();
});

// Méthode pour annuler une commande
orderSchema.methods.cancelOrder = async function() {
  if (this.status === 'delivered' || this.status === 'shipped') {
    throw new Error('Impossible d\'annuler une commande déjà expédiée');
  }

  this.status = 'cancelled';
  await this.save();
};

// Méthode pour demander un remboursement
orderSchema.methods.requestRefund = async function(reason) {
  if (!this.isPaid) {
    throw new Error('Impossible de rembourser une commande non payée');
  }

  if (this.status === 'refunded') {
    throw new Error('Cette commande a déjà été remboursée');
  }

  this.status = 'refunded';
  this.notes = reason || 'Remboursement demandé';
  await this.save();
};

// Virtual pour le résumé de la commande
orderSchema.virtual('summary').get(function() {
  return {
    items: this.items.length,
    total: this.totalPrice,
    status: this.status,
    createdAt: this.createdAt
  };
});

// Middleware de post-sauvegarde pour mettre à jour les statistiques utilisateur
orderSchema.post('save', async function(doc) {
  if (doc.status === 'delivered') {
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(doc.user, {
      $inc: { 
        orderCount: 1,
        totalSpent: doc.totalPrice
      },
      $set: { lastOrder: doc._id }
    });
  }
});

// Middleware de pré-remove pour nettoyer les références
orderSchema.pre('remove', async function(next) {
  // Mettre à jour les produits (stock)
  const Product = mongoose.model('Product');
  const bulkOps = this.items.map(item => ({
    updateOne: {
      filter: { _id: item.product },
      update: { $inc: { stock: item.quantity } }
    }
  }));
  
  await Product.bulkWrite(bulkOps);
  next();
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;