const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;
const User = require('../models/User');
const logger = require('../utils/logger');

// Configuration JWT
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
  issuer: process.env.JWT_ISSUER || 'ecommerce-api',
  audience: process.env.JWT_AUDIENCE || 'ecommerce-client'
};

// Stratégie JWT
passport.use(new JwtStrategy(jwtOptions, async (payload, done) => {
  try {
    const user = await User.findById(payload.sub);
    
    if (!user) {
      logger.warn(`JWT - Utilisateur introuvable: ${payload.sub}`);
      return done(null, false);
    }

    if (user.isBanned) {
      logger.warn(`JWT - Tentative de connexion bannie: ${user.email}`);
      return done(null, false, { message: 'Compte suspendu' });
    }

    logger.info(`Connexion JWT réussie: ${user.email}`);
    return done(null, user);
  } catch (error) {
    logger.error(`Erreur JWT: ${error.message}`);
    return done(error, false);
  }
}));

// Stratégie Google OAuth
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.API_BASE_URL}/auth/google/callback`,
    scope: ['profile', 'email'],
    state: true
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const existingUser = await User.findOne({ 'oauth.google': profile.id });
      
      if (existingUser) {
        logger.info(`Connexion Google existante: ${existingUser.email}`);
        return done(null, existingUser);
      }

      const email = profile.emails[0].value;
      const newUser = await User.create({
        email,
        firstName: profile.name.givenName,
        lastName: profile.name.familyName,
        avatar: profile.photos[0].value,
        oauth: { google: profile.id },
        isEmailVerified: true
      });

      logger.info(`Nouvel utilisateur Google: ${newUser.email}`);
      done(null, newUser);
    } catch (error) {
      logger.error(`Erreur Google OAuth: ${error.message}`);
      done(error, null);
    }
  }));
}

// Stratégie LinkedIn OAuth
if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
  passport.use(new LinkedInStrategy({
    clientID: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    callbackURL: `${process.env.API_BASE_URL}/auth/linkedin/callback`,
    scope: ['r_emailaddress', 'r_liteprofile'],
    state: true
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const existingUser = await User.findOne({ 'oauth.linkedin': profile.id });
      
      if (existingUser) {
        logger.info(`Connexion LinkedIn existante: ${existingUser.email}`);
        return done(null, existingUser);
      }

      const email = profile.emails[0].value;
      const newUser = await User.create({
        email,
        firstName: profile.name.givenName,
        lastName: profile.name.familyName,
        avatar: profile.photos && profile.photos[0].value,
        oauth: { linkedin: profile.id },
        isEmailVerified: true
      });

      logger.info(`Nouvel utilisateur LinkedIn: ${newUser.email}`);
      done(null, newUser);
    } catch (error) {
      logger.error(`Erreur LinkedIn OAuth: ${error.message}`);
      done(error, null);
    }
  }));
}

// Sérialisation utilisateur
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Désérialisation utilisateur
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;