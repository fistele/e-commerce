console.log('Server started...'); // Debugging line to check if the server is starting
const app = require('./app');
console.log('App initialized.../app'); // Debugging line to check if the app is initialized
const mongoose = require('mongoose');
const { logger } = require('./utils/logger');
const { MONGODB_URI, PORT, NODE_ENV } = require('./config');

// Configuration pour les sockets (optionnel)
// const http = require('http');
// const socketio = require('socket.io');
// const configureSockets = require('./sockets'); // À créer si besoin


class Server {
  constructor() {
    this.app = app;
    this.port = PORT;
    this.env = NODE_ENV;
    this.server = http.createServer(this.app);
    this.io = socketio(this.server, {
      cors: {
        origin: NODE_ENV === 'development' 
          ? ['http://localhost:3000'] 
          : process.env.CORS_ORIGIN,
        methods: ['GET', 'POST']
      }
    });
  }

  async connectDB() {
    try {
      await mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useCreateIndex: true,
        useFindAndModify: false
      });
      logger.info('✅ Connecté à MongoDB');

      // Indexation automatique (optionnel)
      if (this.env === 'development') {
        await mongoose.connection.db.collection('products').createIndex({ name: 'text' });
      }
    } catch (err) {
      logger.error(`❌ Échec de connexion à MongoDB: ${err.message}`);
      process.exit(1);
    }
  }

  configureSockets() {
    configureSockets(this.io);
    logger.info('🔌 Sockets.io configuré');
  }

  start() {
    this.server.listen(this.port, () => {
      logger.info(`🚀 Serveur démarré sur le port ${this.port} (${this.env})`);

      // Affichage des routes disponibles (dev seulement)
      if (this.env === 'development') {
        const routes = [];
        this.app._router.stack.forEach(middleware => {
          if (middleware.route) {
            routes.push({
              path: middleware.route.path,
              methods: Object.keys(middleware.route.methods)
            });
          }
        });
        logger.debug('Routes disponibles:', routes);
      }
    });

    // Gestion des erreurs non catchées
    process.on('unhandledRejection', (err) => {
      logger.error('UNHANDLED REJECTION! 💥', err);
      this.server.close(() => process.exit(1));
    });

    process.on('SIGTERM', () => {
      logger.info('SIGTERM REÇU. Arrêt propre du serveur');
      this.server.close(() => {
        mongoose.connection.close(false, () => {
          logger.info('MongoDB déconnecté');
          process.exit(0);
        });
      });
    });
  }
}

// Lancement du serveur
(async () => {
  const server = new Server();
  await server.connectDB();
  
  // Activer les sockets si nécessaire (optionnel)
  if (process.env.ENABLE_SOCKETS === 'true') {
    server.configureSockets();
  }

  server.start();
})();