import { Router } from 'express';
import { getNonce, verifySignature, updatePublicKey, getPublicKeyByWallet, getUserByWallet, updateFcmToken, getSession } from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.post('/nonce', getNonce);
router.post('/verify', verifySignature);
router.get('/session', authenticateToken, getSession);
router.post('/public-key', authenticateToken, updatePublicKey);
router.post('/fcm-token', authenticateToken, updateFcmToken);
router.get('/public-key/:wallet', getPublicKeyByWallet);
router.get('/user/:wallet', getUserByWallet);

export default router;
