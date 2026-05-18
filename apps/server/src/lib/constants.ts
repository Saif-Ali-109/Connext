
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { readEnv, readNumberEnv } from './env';

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var mongoose: MongooseCache;
}

export const JWT_SECRET = readEnv('JWT_SECRET', 'fallback_secret', { requiredInProduction: true });
export const JWT_EXPIRES_DAYS = readEnv('JWT_EXPIRES_DAYS', '24h');
export const EXPECTED_EVM_CHAIN_ID = readNumberEnv('SEPOLIA_CHAIN_ID', 11155111);
export const MONGODB_URI = readEnv('MONGODB_URI', 'mongodb://localhost:27017/wallet-chat', { requiredInProduction: true });
export const PORT = readNumberEnv('PORT', 4001);

const globalCache = global.mongoose || { conn: null, promise: null };
global.mongoose = globalCache;

export async function connectDB() {
  if (globalCache.conn) return globalCache.conn;
  if (!globalCache.promise) {
    globalCache.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });
  }
  globalCache.conn = await globalCache.promise;
  return globalCache.conn;
}
