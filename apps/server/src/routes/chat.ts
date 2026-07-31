import { Router } from 'express';
import {
  sendRequest,
  respondToRequest,
  getRequests,
  removeRequest,
  getMessages,
  sendMessage,
  toggleReaction,
  searchMessages,
  getUnreadMessageCounts,
  updateContactName,
  disconnectChat,
  getOnlineStatus,
  createInvite,
  acceptInvite,
} from '../controllers/chat.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  chatRequest,
  sendMessage as msgLimiter,
  reactToMessage as reactLimiter,
  createInvite as inviteLimiter,
  standard,
} from '../middleware/rateLimiter';

const router = Router();

router.post('/request', authenticateToken, chatRequest, sendRequest);
router.post('/respond', authenticateToken, chatRequest, respondToRequest);
router.get('/requests', authenticateToken, getRequests);
router.delete('/request/:requestId', authenticateToken, removeRequest);
router.get('/messages/:roomId', authenticateToken, getMessages);
router.post('/send-message', authenticateToken, msgLimiter, sendMessage);
router.post('/react', authenticateToken, reactLimiter, toggleReaction);
router.get('/unreadCounts', authenticateToken, getUnreadMessageCounts);
router.put('/contact-name', authenticateToken, standard, updateContactName);
router.post('/disconnect', authenticateToken, disconnectChat);
router.get('/online-status/:userId', authenticateToken, getOnlineStatus);
router.get('/search', authenticateToken, standard, searchMessages);
router.post('/invite', authenticateToken, inviteLimiter, createInvite);
router.post('/invite/accept', authenticateToken, acceptInvite);

export default router;
