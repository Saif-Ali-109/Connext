import { Router } from 'express';
import {
  bridgeSession,
  getSession,
  logout,
  updateUsername,
  updateFcmToken,
  getUserByQuery,
  updatePassword,
} from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.post('/bridge', bridgeSession);
router.get('/session', authenticateToken, getSession);
router.post('/logout', authenticateToken, logout);
router.post('/username', authenticateToken, updateUsername);
router.post('/update-password', authenticateToken, updatePassword);
router.post('/fcm-token', authenticateToken, updateFcmToken);
router.get('/user/:query', authenticateToken, getUserByQuery);
router.get('/search', authenticateToken, getUserByQuery);

export default router;
