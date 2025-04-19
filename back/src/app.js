const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const path = require('path');
const { logger, requestLogger } = require('./utils/logger');
const ErrorHandler = require('./middlewares/error.middleware');
const { NODE_ENV, PORT } = require('dotenv');


// Import des routes
const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/product.routes');
console.log('Product routes loaded.../product.routes'); // Debugging line to check if product routes are loaded
const userRoutes = require('./routes/user.routes');
const orderRoutes = require('./routes/order.routes');
const cartRoutes = require('./routes/cart.routes');
const adminRoutes = require('./routes/admin.routes');


// Initialisation de l'application Express
console.log(`NODE_ENV: ${NODE_ENV}`);
console.log(`PORT: ${PORT}`);
const app = express();

// 1) Middlewares globaux

// Sécurité HTTP headers
app.use(helmet());

// Logger des requêtes HTTP
app.use(requestLogger);

// Limiteur de requêtes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: NODE_ENV === 'development' ? 1000 : 100, // Limite différente selon l'environnement
  message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard'
});
app.use('/api', limiter);

// Body parser
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Nettoyage des données contre les attaques NoSQL
app.use(mongoSanitize());

// Nettoyage contre les attaques XSS
app.use(xss());

// Protection contre la pollution des paramètres HTTP
app.use(hpp({
  whitelist: [ // Champs autorisés pour les doublons
    'price',
    'ratingsAverage',
    'ratingsQuantity',
    'category'
  ]
}));

// Configuration CORS
const corsOptions = {
  origin: NODE_ENV === 'development' 
    ? ['http://localhost:3000', 'http://127.0.0.1:3000']
    : process.env.CORS_ORIGIN,
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// 2) Routes de l'API
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/admin', adminRoutes);

// 3) Gestion des routes non trouvées
app.all('*', (req, res, next) => {
  next(new ErrorResponse(`Route non trouvée: ${req.originalUrl}`, 404));
});

// 4) Middleware de gestion des erreurs (doit être le dernier middleware)
app.use(ErrorHandler.handle());

// Export pour les tests et le démarrage
module.exports = app;