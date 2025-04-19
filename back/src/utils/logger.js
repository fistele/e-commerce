const winston = require('winston');
const { combine, timestamp, printf, colorize, errors, json } = winston.format;
const path = require('path');
const DailyRotateFile = require('winston-daily-rotate-file');
const { inspect } = require('util');
const { NODE_ENV, LOGS_DIR = 'logs' } = process.env;

// Niveaux de log personnalisés
const levels = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  http: 4,
  debug: 5,
  sql: 6
};

// Couleurs pour les niveaux
const colors = {
  fatal: 'red',
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
  sql: 'cyan'
};
winston.addColors(colors);

// Format de base pour les logs
const baseFormat = combine(
  errors({ stack: true }), // Capture les stack traces
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })
);

// Format console (développement)
const consoleFormat = combine(
  colorize(),
  printf(({ level, message, timestamp, stack }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (stack) msg += `\n${stack}`;
    return msg;
  })
);

// Format fichier (production)
const fileFormat = combine(
  json(),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      stack,
      meta: Object.keys(meta).length ? meta : undefined
    });
  })
);

// Transport pour les logs d'erreurs
const errorTransport = new DailyRotateFile({
  level: 'error',
  filename: path.join(LOGS_DIR, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  format: fileFormat
});

// Transport pour les logs HTTP
const httpTransport = new DailyRotateFile({
  level: 'http',
  filename: path.join(LOGS_DIR, 'http-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  format: fileFormat
});

// Transport pour les logs d'application
const appTransport = new DailyRotateFile({
  level: 'info',
  filename: path.join(LOGS_DIR, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  format: fileFormat
});

// Transport SQL (optionnel)
const sqlTransport = new DailyRotateFile({
  level: 'sql',
  filename: path.join(LOGS_DIR, 'sql-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '10m',
  maxFiles: '7d',
  format: fileFormat
});

// Configuration principale du logger
const logger = winston.createLogger({
  levels,
  level: NODE_ENV === 'development' ? 'debug' : 'info',
  format: baseFormat,
  defaultMeta: { service: 'ecommerce-api' },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      silent: NODE_ENV === 'test'
    }),
    errorTransport,
    httpTransport,
    appTransport
  ],
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(LOGS_DIR, 'exceptions.log') 
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(LOGS_DIR, 'rejections.log') 
    })
  ]
});

// Logger spécial pour les requêtes HTTP (middleware Express)
const httpLogger = winston.createLogger({
  levels: { http: 0 },
  transports: [
    httpTransport,
    new winston.transports.Console({
      format: consoleFormat,
      level: 'http'
    })
  ]
});

// Logger SQL (optionnel)
const sqlLogger = winston.createLogger({
  levels: { sql: 0 },
  transports: [
    sqlTransport,
    new winston.transports.Console({
      format: printf(({ message }) => message),
      level: 'sql',
      silent: NODE_ENV !== 'development'
    })
  ]
});

// Middleware pour Express
const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl } = req;
    const { statusCode } = res;
    const contentLength = res.get('content-length') || 0;

    httpLogger.http('', {
      method,
      url: originalUrl,
      status: statusCode,
      duration,
      contentLength,
      userAgent: req.get('user-agent'),
      ip: req.ip
    });
  });

  next();
};

// Fonction pour formater les objets complexes
const formatObject = (obj) => {
  return inspect(obj, {
    colors: NODE_ENV === 'development',
    depth: 5,
    breakLength: Infinity
  });
};

// Export des utilitaires
module.exports = {
  logger,
  httpLogger,
  sqlLogger,
  requestLogger,
  formatObject,
  stream: {
    write: (message) => logger.http(message.trim())
  }
};