import { Response } from 'express';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, eq, or } from 'drizzle-orm';
import { chatRequests } from '@connext/db';
import { getR2Client, R2_BUCKET, isR2Configured } from '../lib/r2';
import { AuthRequest } from '../middleware/auth.middleware';
import { getDb } from '../lib/constants';
import { asyncHandler } from '../lib/asyncHandler';
import { sendSuccess, sendError } from '../lib/response';

const MAX_FILE_BYTES = Number(process.env.MAX_MEDIA_FILE_BYTES || 25 * 1024 * 1024);
const DEFAULT_SIGNED_URL_SECONDS = Number(process.env.R2_SIGNED_URL_TTL_SECONDS || 300);

export function buildObjectKey(userId: string, originalName: string) {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `chat-media/${userId}/${Date.now()}-${safeName}`;
}

export const signUploadUrl = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isR2Configured()) {
    return sendError(res, 'R2 is not configured', 500);
  }

  const authUserId = req.user?.id;
  const { fileName, contentType, size } = req.body;
  if (!authUserId || !fileName || !contentType || !size) {
    return sendError(res, 'Authenticated user, fileName, contentType, and size are required', 400);
  }

  const numericSize = Number(size);
  if (!Number.isFinite(numericSize) || numericSize <= 0) {
    return sendError(res, 'Invalid file size', 400);
  }
  if (numericSize > MAX_FILE_BYTES) {
    return sendError(res, `File too large. Max allowed is ${MAX_FILE_BYTES} bytes`, 413);
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
  return sendSuccess(res, {
    objectKey,
    uploadUrl,
    expiresIn: DEFAULT_SIGNED_URL_SECONDS,
    maxFileBytes: MAX_FILE_BYTES,
  });
});

export const signDownloadUrl = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isR2Configured()) {
    return sendError(res, 'R2 is not configured', 500);
  }
  const { objectKey } = req.body;
  if (!objectKey || typeof objectKey !== 'string') {
    return sendError(res, 'objectKey is required', 400);
  }

  const authUserId = req.user?.id;
  if (!authUserId) {
    return sendError(res, 'Unauthorized', 401);
  }

  const parts = objectKey.split('/');
  if (parts.length < 3 || parts[0] !== 'chat-media') {
    return sendError(res, 'Invalid object key format', 400);
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
      return sendError(res, 'Forbidden: You do not have an active chat with the uploader of this file', 403);
    }
  }

  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: String(objectKey),
  });
  const downloadUrl = await getSignedUrl(client, command, { expiresIn: DEFAULT_SIGNED_URL_SECONDS });

  return sendSuccess(res, {
    objectKey,
    downloadUrl,
    expiresIn: DEFAULT_SIGNED_URL_SECONDS,
  });
});

export const proxyUpload = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isR2Configured()) {
    return sendError(res, 'R2 is not configured', 500);
  }

  const authUserId = req.user?.id;
  if (!authUserId) {
    return sendError(res, 'Unauthorized', 401);
  }

  const file = req.file;
  if (!file) {
    return sendError(res, 'No file uploaded', 400);
  }

  const objectKey = buildObjectKey(String(authUserId), file.originalname);
  const client = getR2Client();

  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: objectKey,
    ContentType: file.mimetype,
    Body: file.buffer,
  }));

  return sendSuccess(res, {
    objectKey,
    message: 'File uploaded successfully through proxy',
  });
});
