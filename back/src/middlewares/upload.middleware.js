const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary'); 
const multer = require('multer');
const path = require('path');
const ErrorResponse = require('../utils/error.response');

// Configuration de Cloudinary (déjà configuré dans config/cloudinary.js)
const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

// Vérification des types de fichiers
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return cb(new ErrorResponse(`Type de fichier non supporté. Formats acceptés: ${allowedExtensions.join(', ')}`, 400));
  }
  cb(null, true);
};

// Configuration des storages Cloudinary
const productStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'ecommerce/products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }],
    resource_type: 'image'
  }
});

const userStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'ecommerce/users',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [{ width: 500, height: 500, crop: 'thumb', gravity: 'face' }],
    resource_type: 'image'
  }
});

// Middlewares d'upload
const uploadProductImages = multer({
  storage: productStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5 // Max 5 fichiers
  }
});

const uploadUserAvatar = multer({
  storage: userStorage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB
  }
});

// Middleware de suppression d'image
const deleteImage = async (publicId, resourceType = 'image') => {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error('Erreur suppression Cloudinary:', err.message);
    throw new ErrorResponse('Erreur lors de la suppression du fichier', 500);
  }
};

// Extrait l'ID public d'une URL Cloudinary
const getPublicIdFromUrl = (url) => {
  const matches = url.match(/\/upload\/v\d+\/(.+?)\.\w+$/);
  return matches ? matches[1] : null;
};

// Middleware pour nettoyer les uploads en cas d'erreur
const cleanupUploads = (req, res, next) => {
  // Si la requête échoue, supprime les fichiers uploadés
  if (!req.files || req.files.length === 0) return next();

  const originalSend = res.send;
  res.send = async function (body) {
    if (res.statusCode >= 400) {
      try {
        await Promise.all(
          req.files.map(file => 
            deleteImage(getPublicIdFromUrl(file.path))
          )
        );
      } catch (err) {
        console.error('Nettoyage uploads échoué:', err);
      }
    }
    originalSend.call(this, body);
  };
  next();
};

module.exports = {
  uploadProductImages,
  uploadUserAvatar,
  deleteImage,
  getPublicIdFromUrl,
  cleanupUploads
};