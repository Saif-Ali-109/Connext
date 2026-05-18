import { Response } from 'express';
import { User } from '../models/User';
import { ChatRequest } from '../models/ChatRequest';
import { Message } from '../models/Message';
import { AuthRequest } from '../middleware/auth.middleware';
import mongoose from 'mongoose';

// Validation regex patterns
const ROOM_ID_REGEX = /^0x[a-fA-F0-9]+-0x[a-fA-F0-9]+$/;
const PUBLIC_KEY_REGEX = /^[0-9a-zA-Z+/=]+$/; // Base64url or hex format

const getAuthenticatedUserId = (req: AuthRequest): string =>
  String(req.user?.id || req.user?._id || '');

const isParticipant = (chatReq: { from: { toString(): string }, to: { toString(): string } }, userId: string) =>
  chatReq.from.toString() === userId || chatReq.to.toString() === userId;

const getRoomIdForWallets = (walletA: string, walletB: string) =>
  [walletA.toLowerCase().trim(), walletB.toLowerCase().trim()].sort().join('-');

export const sendRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { fromUserId, toPublicKey } = req.body;
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    if (!toPublicKey) {
      return res.status(400).json({ error: 'Recipient public key is required' });
    }

    if (fromUserId && String(fromUserId) !== authenticatedUserId) {
      return res.status(403).json({ error: 'Forbidden: sender does not match authenticated session' });
    }

    const fromUser = await User.findById(authenticatedUserId);
    if (!fromUser) return res.status(404).json({ error: 'Sender not found' });

    // Robust recipient lookup: try publicKey, then try as publicAddress
    let toUser = await User.findOne({ publicKey: toPublicKey });
    
    if (!toUser) {
      console.log('[sendRequest] Recipient not found by PK, trying publicAddress...');
      toUser = await User.findOne({ publicAddress: toPublicKey });
    }

    if (!toUser) return res.status(404).json({ error: 'Recipient not found on this platform' });

    if (fromUser._id.toString() === toUser._id.toString()) {
      return res.status(400).json({ error: 'Cannot send request to yourself' });
    }

    // Check for existing request in either direction
    const existing = await ChatRequest.findOne({
      $or: [
        { from: fromUser._id, to: toUser._id },
        { from: toUser._id, to: fromUser._id }
      ]
    });

    if (existing) {
      const isHiddenBySender = existing.hiddenBy?.some(
        (id) => id.toString() === fromUser._id.toString()
      );

      if (isHiddenBySender) {
        // Reconnecting after a user intentionally hid an accepted chat should
        // require a new pending request instead of silently restoring the chat.
        existing.status = 'pending';
        existing.from = fromUser._id;
        existing.to = toUser._id;
        existing.fromWallet = fromUser.publicAddress;
        existing.toWallet = toUser.publicAddress;
        existing.hiddenBy = [];
        await existing.save();
        return res.status(200).json({ message: 'Request re-opened', request: existing });
      }

      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'Chat already accepted' });
      }
      
      // Mutual pending request: automatically accept it
      if (existing.status === 'pending') {
        if (existing.to.toString() === fromUser._id.toString()) {
           existing.status = 'accepted';
           await existing.save();
           return res.status(200).json({ message: 'Mutual request found, chat automatically accepted', request: existing });
        }
        return res.status(400).json({ error: 'Request already pending' });
      }
      
      // If rejected, allow re-requesting
      existing.status = 'pending';
      existing.from = fromUser._id;
      existing.to = toUser._id;
      existing.fromWallet = fromUser.publicAddress;
      existing.toWallet = toUser.publicAddress;
      existing.hiddenBy = []; // Reset hidden status on new request
      await existing.save();
      return res.status(200).json(existing);
    }

    const newRequest = await ChatRequest.create({
      from: fromUser._id,
      to: toUser._id,
      fromWallet: fromUser.publicAddress,
      toWallet: toUser.publicAddress,
      status: 'pending',
    });

    return res.status(201).json(newRequest);
  } catch (error) {
    console.error('Error in sendRequest:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const respondToRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId, status } = req.body;
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const chatReq = await ChatRequest.findById(requestId);
    if (!chatReq) return res.status(404).json({ error: 'Request not found' });

    if (chatReq.to.toString() !== authenticatedUserId) {
      return res.status(403).json({ error: 'Forbidden: only the request recipient can respond' });
    }

    chatReq.status = status;
    await chatReq.save();

    return res.status(200).json(chatReq);
  } catch (error) {
    console.error('Error in respondToRequest:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getRequests = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.query;
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    if (userId && String(userId).toLowerCase() !== authenticatedUserId.toLowerCase()) {
      return res.status(403).json({ error: 'Forbidden: userId does not match authenticated session' });
    }

    const user = await User.findById(authenticatedUserId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Incoming requests for the user (not hidden by user)
    const incoming = await ChatRequest.find({ 
      to: new mongoose.Types.ObjectId(authenticatedUserId), 
      status: 'pending',
      hiddenBy: { $ne: new mongoose.Types.ObjectId(authenticatedUserId) }
    }).populate('from', 'publicAddress publicKey username');
    
    // Outgoing requests from the user
    const outgoing = await ChatRequest.find({ 
      from: new mongoose.Types.ObjectId(authenticatedUserId),
      status: 'pending',
      hiddenBy: { $ne: new mongoose.Types.ObjectId(authenticatedUserId) }
    }).populate('to', 'publicAddress publicKey username');

    // Accepted contacts (either direction), not hidden by this user
    const contacts = await ChatRequest.find({
      $or: [
        { from: new mongoose.Types.ObjectId(authenticatedUserId) },
        { to: new mongoose.Types.ObjectId(authenticatedUserId) }
      ],
      status: 'accepted',
      hiddenBy: { $ne: new mongoose.Types.ObjectId(authenticatedUserId) }
    }).populate('from to', 'publicAddress publicKey username');

    return res.status(200).json({ incoming, outgoing, contacts });
  } catch (error) {
    console.error('Error in getRequests:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const { currentUserId } = req.query;
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    if (currentUserId && String(currentUserId) !== authenticatedUserId) {
      return res.status(403).json({ error: 'Forbidden: currentUserId does not match authenticated session' });
    }

    if (!roomId) {
      return res.status(400).json({ error: 'Room ID is required' });
    }

    // Validate roomId format (two wallet addresses separated by dash)
    if (!ROOM_ID_REGEX.test(roomId)) {
      return res.status(400).json({ error: 'Invalid Room ID format' });
    }

    const user = await User.findById(authenticatedUserId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const acceptedChats = await ChatRequest.find({
      $or: [{ from: authenticatedUserId }, { to: authenticatedUserId }],
      status: 'accepted',
      hiddenBy: { $ne: authenticatedUserId }
    }).select('fromWallet toWallet');

    const isAuthorizedForRoom = acceptedChats.some((chatReq) =>
      getRoomIdForWallets(chatReq.fromWallet, chatReq.toWallet) === roomId
    );

    if (!isAuthorizedForRoom) {
      return res.status(403).json({ error: 'Forbidden: no accepted connection for this room' });
    }
    
    const pageNum = parseInt(req.query.page as string) || 1;
    const limitNum = parseInt(req.query.limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const totalCount = await Message.countDocuments({ roomId });

    const messages = await Message.find({ roomId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('sender', 'publicAddress username displayName');

    const formattedMessages = messages.map((msg) => ({
      id: msg._id.toString(),
      sender: msg.sender.toString() === authenticatedUserId ? 'me' : 'other',
      text: msg.encryptedContent,
      encryptedContentForSender: msg.encryptedContentForSender,
      createdAt: msg.timestamp,
      deliveryState: msg.read ? 'read' : 'delivered'
    }));

    return res.status(200).json({
      messages: formattedMessages,
      totalCount,
      page: pageNum,
      limit: limitNum,
      hasMore: skip + messages.length < totalCount,
    });
  } catch (error) {
    console.error('Error in getMessages:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { senderId, recipientPublicKey, encryptedContent, encryptedContentForSender, encryptedMediaMeta } = req.body;
    const authenticatedUserId = String(req.user?.id || req.user?._id || '');
    console.log('[REST sendMessage] Request received from senderId:', senderId);
    console.log('[REST sendMessage] Recipient PK starts with:', recipientPublicKey?.substring(0, 20));

    if (!senderId || !recipientPublicKey || !encryptedContent) {
      console.error('[REST sendMessage] Missing fields');
      return res.status(400).json({ error: 'senderId, recipientPublicKey, and encryptedContent are required' });
    }

    // Validate senderId matches authenticated user
    if (!authenticatedUserId || authenticatedUserId !== String(senderId)) {
      console.error('[REST sendMessage] Sender/token mismatch', {
        authenticatedUserId,
      });
      return res.status(403).json({ error: 'Forbidden: sender does not match authenticated session' });
    }

    // Validate recipientPublicKey format (base64 or hex)
    if (!PUBLIC_KEY_REGEX.test(recipientPublicKey)) {
      return res.status(400).json({ error: 'Invalid recipientPublicKey format' });
    }

    const sender = await User.findById(authenticatedUserId);
    if (!sender) {
      console.error('[REST sendMessage] Sender not found:', authenticatedUserId);
      return res.status(404).json({ error: 'Sender not found' });
    }

    // Robust recipient lookup: try publicKey, then try as publicAddress
    let recipient = await User.findOne({ publicKey: recipientPublicKey });
    
    if (!recipient) {
      console.log('[REST sendMessage] Recipient not found by PK, trying publicAddress...');
      recipient = await User.findOne({ publicAddress: recipientPublicKey });
    }

    if (!recipient) {
      console.error('[REST sendMessage] Recipient not found');
      return res.status(404).json({ error: 'Recipient not found' });
    }

    console.log('[REST sendMessage] Found recipient:', recipient.publicAddress);

    // Verify accepted connection
    const request = await ChatRequest.findOne({
      $or: [
        { from: sender._id, to: recipient._id },
        { from: recipient._id, to: sender._id }
      ],
      status: 'accepted'
    });

    if (!request) {
      console.error('[REST sendMessage] No accepted connection found');
      return res.status(403).json({ error: 'No accepted connection between these users' });
    }

    const roomId = [sender.publicAddress.toLowerCase(), recipient.publicAddress.toLowerCase()].sort().join('-');

    const newMessage = await Message.create({
      sender: sender._id,
      roomId,
      encryptedContent,
      encryptedContentForSender: encryptedContentForSender || null,
      timestamp: new Date(),
    });

    return res.status(202).json({
      relayOnly: false,
      queuedOnClient: false,
      roomId,
      messageId: newMessage._id,
      hasEncryptedMediaMeta: !!encryptedMediaMeta,
      message: 'Message persisted to database.'
    });
  } catch (error) {
    console.error('[REST sendMessage] CRITICAL ERROR:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const removeRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { requestId } = req.params;
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    if (!requestId) return res.status(400).json({ error: 'Request ID is required' });

    const chatReq = await ChatRequest.findById(requestId);
    if (!chatReq) return res.status(404).json({ error: 'Request not found' });

    if (!isParticipant(chatReq, authenticatedUserId)) {
      return res.status(403).json({ error: 'Forbidden: you are not part of this request' });
    }

    await chatReq.deleteOne();

    return res.status(200).json({ message: 'Connection removed successfully' });
  } catch (error) {
    console.error('Error in removeRequest:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUnreadMessageCounts = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.query;
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    if (userId && String(userId) !== authenticatedUserId) {
      return res.status(403).json({ error: 'Forbidden: userId does not match authenticated session' });
    }

    const user = await User.findById(authenticatedUserId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find all accepted connections for this user
    const userObjectId = new mongoose.Types.ObjectId(authenticatedUserId);
    const acceptedRequests = await ChatRequest.find({
      $or: [{ from: userObjectId }, { to: userObjectId }],
      status: 'accepted'
    });

    const unreadCounts: Record<string, number> = {};

    for (const request of acceptedRequests) {
      const isFromMe = request.from.toString() === authenticatedUserId;
      const otherUserId = isFromMe ? request.to.toString() : request.from.toString();
      
      const otherUser = await User.findById(otherUserId);
      if (!otherUser) {
        console.log('[UnreadCounts] Other user not found:', otherUserId);
        continue;
      }

      const roomId = [user.publicAddress.toLowerCase().trim(), otherUser.publicAddress.toLowerCase().trim()].sort().join('-');

      const count = await Message.countDocuments({
        roomId,
        sender: { $ne: userObjectId },
        read: false
      });

      if (count > 0) {
        unreadCounts[otherUserId] = count;
        console.log(`[UnreadCounts] Room ${roomId}: ${count} unread for user ${otherUser.publicAddress}`);
      }
    }

    return res.status(200).json(unreadCounts);
  } catch (error) {
    console.error('Error in getUnreadMessageCounts:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateContactName = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, contactUserId, customName } = req.body;
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    if (!contactUserId) {
      return res.status(400).json({ error: 'Contact user ID is required' });
    }

    if (userId && String(userId) !== authenticatedUserId) {
      return res.status(403).json({ error: 'Forbidden: userId does not match authenticated session' });
    }

    const chatReq = await ChatRequest.findOne({
      $or: [
        { from: authenticatedUserId, to: contactUserId },
        { from: contactUserId, to: authenticatedUserId }
      ],
      status: 'accepted'
    });

    if (!chatReq) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    if (chatReq.from.toString() === authenticatedUserId) {
      chatReq.fromCustomName = customName;
    } else {
      chatReq.toCustomName = customName;
    }

    await chatReq.save();

    return res.status(200).json({ message: 'Contact name updated successfully', customName });
  } catch (error) {
    console.error('Error in updateContactName:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const disconnectChat = async (req: AuthRequest, res: Response) => {
  try {
    const { userId, contactUserId } = req.body;
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    if (!contactUserId) {
      return res.status(400).json({ error: 'Contact user ID is required' });
    }

    if (userId && String(userId) !== authenticatedUserId) {
      return res.status(403).json({ error: 'Forbidden: userId does not match authenticated session' });
    }

    const chatReq = await ChatRequest.findOne({
      $or: [
        { from: authenticatedUserId, to: contactUserId },
        { from: contactUserId, to: authenticatedUserId }
      ]
    });

    if (!chatReq) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Add to hiddenBy if not already there
    if (!chatReq.hiddenBy.map(id => id.toString()).includes(authenticatedUserId)) {
      chatReq.hiddenBy.push(authenticatedUserId as any);
      await chatReq.save();
    }

    return res.status(200).json({ message: 'Disconnected successfully' });
  } catch (error) {
    console.error('Error in disconnectChat:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// This will be called from index.ts where `onlineSocketsByUserId` is accessible
// For the REST endpoint, we'll export a function that checks online status
let onlineSocketsByUserIdRef: Map<string, Set<string>>;

export const setOnlineSocketsRef = (ref: Map<string, Set<string>>) => {
  onlineSocketsByUserIdRef = ref;
};

export const getOnlineStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = getAuthenticatedUserId(req);

    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    const isOnline = (onlineSocketsByUserIdRef?.get(userId)?.size ?? 0) > 0;
    return res.status(200).json({ userId, online: !!isOnline });
  } catch (error) {
    console.error('Error in getOnlineStatus:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
