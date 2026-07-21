import { Router } from 'express';
import {
  sendRequest,
  respondToRequest,
  getRequests,
  removeRequest,
  getMessages,
  sendMessage,
  getUnreadMessageCounts,
  updateContactName,
  disconnectChat,
  getOnlineStatus,
  createInvite,
  acceptInvite,
} from '../controllers/chat.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.post('/request', authenticateToken, sendRequest);
router.post('/respond', authenticateToken, respondToRequest);
router.get('/requests', authenticateToken, getRequests);
router.delete('/request/:requestId', authenticateToken, removeRequest);
router.get('/messages/:roomId', authenticateToken, getMessages);
router.post('/send-message', authenticateToken, sendMessage);
router.get('/unreadCounts', authenticateToken, getUnreadMessageCounts);
router.put('/contact-name', authenticateToken, updateContactName);
router.post('/disconnect', authenticateToken, disconnectChat);
router.get('/online-status/:userId', authenticateToken, getOnlineStatus);
router.post('/invite', authenticateToken, createInvite);
router.post('/invite/accept', authenticateToken, acceptInvite);

export default router;
