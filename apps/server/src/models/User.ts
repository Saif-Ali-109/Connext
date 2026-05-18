import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  publicAddress: {
    type: String,
    required: true,
    unique: true,
  },
  nonce: {
    type: String,
    required: true,
  },
  username: {
    type: String,
  },
  displayName: {
    type: String,
  },
  avatarUrl: {
    type: String,
  },
  walletType: {
    type: String,
    enum: ['walletconnect', 'metamask', 'solana'],
    default: 'walletconnect',
  },
  publicKey: {
    type: String,
    unique: true,
    sparse: true, 
  },
  fcmToken: {
    type: String,
  },
  lastSeenAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

userSchema.index({ publicAddress: 1 });

export interface UserDocument extends mongoose.Document {
  publicAddress: string;
  nonce: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  walletType?: 'walletconnect' | 'metamask' | 'solana';
  publicKey?: string;
  fcmToken?: string;
  lastSeenAt?: Date;
}

export const User = mongoose.model<UserDocument>('User', userSchema);
