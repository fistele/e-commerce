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
├── config/           # Config DB, Cloudinary
├── controllers/      # Logique métier
├── models/           # Schémas MongoDB
├── routes/           # Endpoints API
├── services/         # Email, Upload
├── utils/            # JWT, Validateurs
├── app.js            # Config Express
└── server.js         # Lancement
```
### Front (/front)
```
src/
├── assets/ 
├── components/      # Composants réutilisables
├── features/        # Par fonctionnalité
|   ├── admin/       # Admin
│   ├── auth/        # Authentification
│   ├── cart/        # Panier
│   └── products/    # Gestion produits
├── hooks/           # Custom hooks
├── pages/           # Pages Next.js
├── store/           # Redux Toolkit
├── styles/          # CSS modulaire
└── utils/           # Helpers, constants
```