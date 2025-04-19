# 🛍️ E-Commerce Vêtements

![Bannière du Projet](documents/banner.jpg)

## 🌟 Fonctionnalités Clés

### 👗 Expérience Produit
- 🖼️ Galerie produits avec zoom interactif
- 🎨 Sélection de couleurs/tailles en temps réel
- 📊 Stock dynamique par variante
- ⭐ Avis et notations clients

### 🛒 Tunnel d'Achat
- 📦 Panier persistante (localStorage + DB sync)
- ✈️ Options de livraison/click&collect
- 📝 Formulaire de commande en 3 étapes
- 📧 Confirmation par email

### 🔐 Sécurité
- 🔑 Auth JWT avec refresh tokens
- 🛡️ Protection CSRF/CORS
- 🔄 OAuth2 (Google, LinkedIn)
- 👁️ Chiffrement des données sensibles

## 📂 Structure des Dossiers
### Back (/back)
```
src/
├── config/
│   ├── db.js               # Connexion MongoDB
│   ├── cloudinary.js       # Config upload
│   └── redis.js           # Cache Redis
├── controllers/
│   ├── admin/              # Backoffice
│   │   ├── dashboard.js
│   │   ├── products.js
│   │   └── users.js
│   ├── cartController.js   # Gestion panier
│   ├── orderController.js  # Process commande
│   └── authController.js   # Auth/OAuth
├── models/
│   ├── Product.js          # Schéma produit
│   ├── User.js             # Profils utilisateurs
│   ├── Order.js            # Commandes
│   └── Review.js           # Avis clients
├── routes/
│   ├── api/
│   │   ├── v1/             # Versioning API
│   │   └── admin/          # Routes protégées
│   └── auth.js             # Auth routes
├── services/
│   ├── email/              # Templates transactionnels
│   ├── payment/            # Intégration Stripe
│   └── upload/             # Middleware Multer
├── utils/
│   ├── auth/               # JWT/OAuth
│   ├── validators/         # Schemas JOI
│   └── errorHandlers.js    # Custom errors
├── app.js                  # Middlewares
└── server.js               # Lancement
```
### Front (/front)
```
src/
├── assets/
│   ├── fonts/              # Polices custom
│   ├── icons/              # SVG sprites
│   └── scss/
│       ├── _variables.scss # Design tokens
│       └── main.scss       # Global styles
├── components/
│   ├── ui/
│   │   ├── ProductCard/    # Card with hover effects
│   │   ├── SizeSelector/   # Interactive size picker
│   │   └── ColorSwatch/    # Color selector
│   └── layout/
│       ├── MainNav/        # Mega menu
│       └── Footer/         # Multi-column
├── features/
│   ├── product/
│   │   ├── ProductGallery/ # Image carousel
│   │   ├── VariantPicker/  # Size/color combo
│   │   └── api/           # RTK Query endpoints
│   ├── cart/
│   │   ├── CartDrawer/     # Slide-in cart
│   │   └── CheckoutSteps/  # 3-step process
│   └── auth/
│       ├── OAuthProviders/ # Social logins
│       └── ProfileForm/    # Editable form
├── pages/
│   ├── Product/
│   │   ├── [slug].jsx      # Dynamic route
│   │   └── Collection.jsx  # Filtered view
│   └── Account/
│       ├── Orders.jsx      # Order history
│       └── Wishlist.jsx    # Saved items
├── store/
│   ├── slices/             # Redux state
│   │   ├── cartSlice.js    # Cart operations
│   │   └── uiSlice.js      # Modals/loading
│   └── hooks.js            # Typed selectors
├── App.jsx                 # Providers
└── main.jsx                # Entry point
```