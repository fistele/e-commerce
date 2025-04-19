const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    // Options de connexion recommandées pour Mongoose 6+
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout après 5s au lieu de 30s par défaut
      maxPoolSize: 10, // Nombre max de connexions dans le pool
    });

    logger.info(`✅ MongoDB Connecté: ${conn.connection.host}`.cyan.underline);

    // Événements de connexion
    mongoose.connection.on('connected', () => {
      logger.info('Mongoose connecté à la DB'.green);
    });

    mongoose.connection.on('error', (err) => {
      logger.error(`Erreur de connexion Mongoose: ${err.message}`.red);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Mongoose déconnecté de la DB'.yellow);
    });

    // Gestion propre des arrêts
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('Connexion MongoDB fermée suite à SIGINT'.blue);
      process.exit(0);
    });

  } catch (error) {
    logger.error(`❌ Erreur de connexion MongoDB: ${error.message}`.red.bold);
    process.exit(1); // Quitte l'application avec échec
  }
};

module.exports = connectDB;