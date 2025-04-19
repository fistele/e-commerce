
const express = require('express');

const router = express.Router();

const passport = require('passport');
console.log('Passport initialized.../passport'); // Debugging line to check if passport is initialized
const {
  register,
  login,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
  updateDetails,
  updatePassword,
  confirmEmail,
  oauthCallback,
  linkProvider,
  unlinkProvider
} = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');
const { uploadUserAvatar } = require('../middlewares/upload.middleware');


// ==================== Authentification Locale ====================
router.post('/register', register);
router.post('/login', login);
router.get('/logout', logout);
router.get('/me', protect, getMe);
router.put('/updatedetails', protect, uploadUserAvatar.single('avatar'), updateDetails);
router.put('/updatepassword', protect, updatePassword);
router.post('/forgotpassword', forgotPassword); 
router.put('/resetpassword/:resettoken', resetPassword);
router.get('/confirmemail', confirmEmail);


// ==================== OAuth Strategies ====================
// Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get('/google/callback', passport.authenticate('google', { session: false }), oauthCallback);

// LinkedIn
router.get('/linkedin', passport.authenticate('linkedin', { session: false }));
router.get('/linkedin/callback', passport.authenticate('linkedin', { session: false }), oauthCallback);

// ==================== Account Linking ====================
router.post('/:provider/link', protect, linkProvider);
router.post('/:provider/unlink', protect, unlinkProvider);

module.exports = router;