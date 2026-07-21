import { Response } from 'express';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, eq, or } from 'drizzle-orm';
import { chatRequests } from '@connext/db';
import { getR2Client, R2_BUCKET, isR2Configured } from '../lib/r2';
import { AuthRequest } from '../middleware/auth.middleware';
import { getDb } from '../lib/constants';

const MAX_FILE_BYTES = Number(process.env.MAX_MEDIA_FILE_BYTES || 25 * 1024 * 1024);
const DEFAULT_SIGNED_URL_SECONDS = Number(process.env.R2_SIGNED_URL_TTL_SECONDS || 300);

export function buildObjectKey(userId: string, originalName: string) {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `chat-media/${userId}/${Date.now()}-${safeName}`;
}

export const signUploadUrl = async (req: AuthRequest, res: Response) => {
  try {
    if (!isR2Configured()) {
      return res.status(500).json({ error: 'R2 is not configured' });
    }

    const authUserId = req.user?.id;
    const { fileName, contentType, size } = req.body;
    if (!authUserId || !fileName || !contentType || !size) {
      return res.status(400).json({ error: 'Authenticated user, fileName, contentType, and size are required' });
    }

    const numericSize = Number(size);
    if (!Number.isFinite(numericSize) || numericSize <= 0) {
      return res.status(400).json({ error: 'Invalid file size' });
    }
    if (numericSize > MAX_FILE_BYTES) {
      return res.status(413).json({ error: `File too large. Max allowed is ${MAX_FILE_BYTES} bytes` });
    }

    const objectKey = buildObjectKey(String(authUserId), String(fileName));
    const client = getR2Client();
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
      ContentType: String(contentType),
      ContentLength: numericSize,
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: DEFAULT_SIGNED_URL_SECONDS });
    return res.status(200).json({
      objectKey,
      uploadUrl,
      expiresIn: DEFAULT_SIGNED_URL_SECONDS,
      maxFileBytes: MAX_FILE_BYTES,
    });
  } catch (error) {
    console.error('Error in signUploadUrl:', error);
    return res.status(500).json({ error: 'Failed to create upload URL' });
  }
};

export const signDownloadUrl = async (req: AuthRequest, res: Response) => {
  try {
    if (!isR2Configured()) {
      return res.status(500).json({ error: 'R2 is not configured' });
    }
    const { objectKey } = req.body;
    if (!objectKey || typeof objectKey !== 'string') {
      return res.status(400).json({ error: 'objectKey is required' });
    }

    const authUserId = req.user?.id;
    if (!authUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Extract uploader user ID from objectKey. Example: chat-media/userId/123-file.png
    const parts = objectKey.split('/');
    if (parts.length < 3 || parts[0] !== 'chat-media') {
      return res.status(400).json({ error: 'Invalid object key format' });
    }
    const uploaderUserId = parts[1];

    if (uploaderUserId !== String(authUserId)) {
      const db = getDb();
      const hasConnection = await db.query.chatRequests.findFirst({
        where: and(
          or(
            and(
              eq(chatRequests.fromUserId, String(authUserId)),
              eq(chatRequests.toUserId, uploaderUserId)
            ),
            and(
              eq(chatRequests.fromUserId, uploaderUserId),
              eq(chatRequests.toUserId, String(authUserId))
            )
          ),
          eq(chatRequests.status, 'accepted')
        ),
      });

      if (!hasConnection) {
        return res.status(403).json({ error: 'Forbidden: You do not have an active chat with the uploader of this file' });
      }
    }

    const client = getR2Client();
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: String(objectKey),
    });
    const downloadUrl = await getSignedUrl(client, command, { expiresIn: DEFAULT_SIGNED_URL_SECONDS });

    return res.status(200).json({
      objectKey,
      downloadUrl,
      expiresIn: DEFAULT_SIGNED_URL_SECONDS,
    });
  } catch (error) {
    console.error('Error in signDownloadUrl:', error);
    return res.status(500).json({ error: 'Failed to create download URL' });
  }
};

export const proxyUpload = async (req: AuthRequest, res: Response) => {
  try {
    if (!isR2Configured()) {
      return res.status(500).json({ error: 'R2 is not configured' });
    }

    const authUserId = req.user?.id;
    if (!authUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const objectKey = buildObjectKey(String(authUserId), file.originalname);
    const client = getR2Client();
    
    await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
      ContentType: file.mimetype,
      Body: file.buffer,
    }));

    return res.status(200).json({
      objectKey,
      message: 'File uploaded successfully through proxy',
    });
  } catch (error) {
    console.error('Error in proxyUpload:', error);
    return res.status(500).json({ error: 'Failed to upload file through proxy' });
  }
};
