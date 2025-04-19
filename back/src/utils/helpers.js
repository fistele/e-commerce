const crypto = require('crypto');
const mongoose = require('mongoose');
const validator = require('validator');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

/**
 * Génère un hash à partir d'une string
 * @param {String} text - Texte à hasher
 * @returns {String} Hash SHA-256
 */
const generateHash = (text) => {
  return crypto.createHash('sha256').update(text).digest('hex');
};

/**
 * Valide un ObjectId MongoDB
 * @param {String} id - ID à valider
 * @returns {Boolean} True si valide
 */
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id) && 
         new mongoose.Types.ObjectId(id).toString() === id;
};

/**
 * Formate une date pour l'affichage
 * @param {Date} date - Date à formater
 * @param {String} format - Format moment.js
 * @returns {String} Date formatée
 */
const formatDate = (date, format = 'DD/MM/YYYY HH:mm') => {
  return moment(date).format(format);
};

/**
 * Génère une référence de commande unique
 * @returns {String} Référence (ex: CMD-AB12-2023)
 */
const generateOrderReference = () => {
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  const year = new Date().getFullYear();
  return `CMD-${random}-${year}`;
};

/**
 * Nettoie et formate un numéro de téléphone
 * @param {String} phone - Numéro à nettoyer
 * @returns {String|Null} Numéro formaté ou null
 */
const sanitizePhone = (phone) => {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length > 9 ? cleaned : null;
};

/**
 * Vérifie si une valeur est une URL valide
 * @param {String} url - URL à vérifier
 * @returns {Boolean} True si valide
 */
const isValidUrl = (url) => {
  return validator.isURL(url, {
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true
  });
};

/**
 * Crée un slug à partir d'un texte
 * @param {String} text - Texte à slugifier
 * @returns {String} Slug
 */
const slugify = (text) => {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
};

/**
 * Génère un token aléatoire
 * @param {Number} length - Longueur du token
 * @returns {String} Token
 */
const generateRandomToken = (length = 32) => {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

/**
 * Convertit un prix en cents en format décimal
 * @param {Number} cents - Prix en cents
 * @param {String} currency - Devise (€, $)
 * @returns {String} Prix formaté
 */
const formatPrice = (cents, currency = '€') => {
  return (cents / 100).toFixed(2) + currency;
};

/**
 * Extrait les données de pagination depuis une requête
 * @param {Object} query - Query Express
 * @returns {Object} { page, limit, skip }
 */
const getPagination = (query) => {
  const page = Math.abs(parseInt(query.page, 10)) || 1;
  const limit = Math.abs(parseInt(query.limit, 10)) || 10;
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Met en pause l'exécution
 * @param {Number} ms - Millisecondes à attendre
 * @returns {Promise}
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Génère un UUID v4
 * @returns {String} UUID
 */
const generateUUID = () => {
  return uuidv4();
};

/**
 * Valide un code promo
 * @param {String} code - Code à valider
 * @returns {Boolean} True si valide
 */
const validatePromoCode = (code) => {
  const regex = /^[A-Z0-9]{6,12}$/;
  return regex.test(code);
};

module.exports = {
  generateHash,
  isValidObjectId,
  formatDate,
  generateOrderReference,
  sanitizePhone,
  isValidUrl,
  slugify,
  generateRandomToken,
  formatPrice,
  getPagination,
  sleep,
  generateUUID,
  validatePromoCode
};