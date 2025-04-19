const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');
const logger = require('../utils/logger');

// Configuration de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Force HTTPS
});


// Vérification de la configuration
if (!process.env.CLOUDINARY_CLOUD_NAME || 
    !process.env.CLOUDINARY_API_KEY || 
    !process.env.CLOUDINARY_API_SECRET) {
  logger.error('❌ Configuration Cloudinary manquante dans .env'.red.bold);
  process.exit(1);
}

console.log('Cloudinary configuré avec succès');

// Formats d'images autorisés
const allowedFormats = ['jpg', 'jpeg', 'png', 'webp', 'avif'];

// Configuration du stockage Multer pour Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Génération d'un nom de fichier unique
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalName = path.parse(file.originalname).name;
    const publicId = `ecommerce/${req.user?.id || 'temp'}/${originalName}-${uniqueSuffix}`;

    return {
      folder: 'ecommerce',
      public_id: publicId,
      allowed_formats: allowedFormats,
      transformation: [
        { width: 800, height: 800, crop: 'limit', quality: 'auto' },
        { fetch_format: 'auto' }
      ],
      resource_type: 'auto'
    };
  },
});

// Filtrage des fichiers
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase().substring(1);
  if (allowedFormats.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non supporté: ${ext}`), false);
  }
};

// Configuration de Multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 5 // Max 5 fichiers par upload
  }
});

// Fonctions utilitaires
const cloudinaryUtils = {
  deleteImage: async (publicId) => {
    try {
      await cloudinary.uploader.destroy(publicId);
      logger.info(`Image supprimée: ${publicId}`);
    } catch (error) {
      logger.error(`Erreur suppression image: ${error.message}`);
      throw error;
    }
  },

  optimizeImage: (url, options = {}) => {
    const defaults = {
      quality: 'auto',
      fetch_format: 'auto',
      width: 600
    };
    const params = { ...defaults, ...options };
    return cloudinary.url(url, params);
  }
};

module.exports = {
  cloudinary,
  upload,
  ...cloudinaryUtils
};