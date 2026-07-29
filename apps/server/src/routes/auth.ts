import { Router } from 'express';
import {
  bridgeSession,
  getSession,
  getToken,
  logout,
  updateUsername,
  updateFcmToken,
  uploadPublicKey,
  getUserByQuery,
  updatePassword,
  sendVerificationEmail,
  verifyEmail,
} from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  strictAuth,
  passwordChange,
  sendVerification,
  verifyEmailLimiter,
  standard,
} from '../middleware/rateLimiter';

const router = Router();

router.post('/bridge', strictAuth, bridgeSession);
router.get('/session', authenticateToken, getSession);
router.get('/token', authenticateToken, getToken);
router.post('/logout', authenticateToken, logout);
router.post('/username', authenticateToken, updateUsername);
router.post('/update-password', authenticateToken, passwordChange, updatePassword);
router.post('/fcm-token', authenticateToken, updateFcmToken);
router.post('/public-key', authenticateToken, uploadPublicKey);
router.get('/user/:query', authenticateToken, standard, getUserByQuery);
router.get('/search', authenticateToken, standard, getUserByQuery);
router.post('/send-verification', authenticateToken, sendVerification, sendVerificationEmail);
router.post('/verify-email', authenticateToken, verifyEmailLimiter, verifyEmail);

export default router;
