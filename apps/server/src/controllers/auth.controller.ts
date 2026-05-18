import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { User } from '../models/User';
import { JWT_SECRET, EXPECTED_EVM_CHAIN_ID, JWT_EXPIRES_DAYS } from '../lib/constants';
import { readEnv, ZERO_ADDRESS } from '../lib/env';

const CHAT_REGISTRY_ADDRESS = readEnv('CHAT_REGISTRY_ADDRESS', ZERO_ADDRESS, { requiredInProduction: true });
const REGISTRY_ABI = ["function getEncryptionKey(address user) view returns (bytes)"];

async function fetchPublicKeyFromChain(address: string): Promise<string | null> {
  try {
    const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
    const contract = new ethers.Contract(CHAT_REGISTRY_ADDRESS as string, REGISTRY_ABI, provider);
    const keyBytes = await contract.getEncryptionKey(address);
    if (keyBytes && keyBytes !== '0x') {
      return ethers.toUtf8String(keyBytes);
    }
  } catch (err) {
    console.error('[AUTH] Error fetching public key from chain:', err);
  }
  return null;
}

export const getNonce = async (req: Request, res: Response) => {
  const { publicAddress, walletType, chainId } = req.body;
  console.log(`\n[AUTH] Nonce Request Received:`);
  console.log(`      Address: ${publicAddress}`);
  console.log(`      Wallet:  ${walletType}`);
  console.log(`      Chain:   ${chainId}`);
  
  try {
    if (!publicAddress) {
      return res.status(400).json({ error: 'Public address is required' });
    }
    if (walletType !== 'solana' && chainId && Number(chainId) !== EXPECTED_EVM_CHAIN_ID) {
      return res.status(400).json({ error: `Unsupported chain. Expected ${EXPECTED_EVM_CHAIN_ID}` });
    }

    const nonce = uuidv4();
    const formattedAddress = walletType === 'solana' ? publicAddress : publicAddress.toLowerCase();
    
    let user = await User.findOne({ publicAddress: formattedAddress });

    if (user) {
      user.nonce = nonce;
      user.lastSeenAt = new Date();
      await user.save();
    } else {
      user = await User.create({
        publicAddress: formattedAddress,
        nonce,
        walletType: walletType || 'walletconnect',
        lastSeenAt: new Date(),
      });
    }

    console.log(`[AUTH] Nonce Generated: ${nonce} for ${formattedAddress}`);
    return res.status(200).json({ nonce });
  } catch (error) {
    console.error('[AUTH] Error in getNonce:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const verifySignature = async (req: Request, res: Response) => {
  const { publicAddress, signature, walletType, chainId } = req.body;
  console.log(`\n[AUTH] Signature Verification Request:`);
  console.log(`      Address: ${publicAddress}`);
  console.log(`      Wallet:  ${walletType}`);
  
  try {

    if (!publicAddress || !signature) {
      return res.status(400).json({ error: 'Public address and signature are required' });
    }
    if (walletType !== 'solana' && chainId && Number(chainId) !== EXPECTED_EVM_CHAIN_ID) {
      return res.status(400).json({ error: `Unsupported chain. Expected ${EXPECTED_EVM_CHAIN_ID}` });
    }

    const formattedAddress = walletType === 'solana' ? publicAddress : publicAddress.toLowerCase();
    const user = await User.findOne({ publicAddress: formattedAddress });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const msg = `I am signing my one-time nonce: ${user.nonce}`;
    let isValid = false;

    if (walletType === 'solana') {
      try {
        const signatureUint8 = bs58.decode(signature);
        const pubKeyUint8 = bs58.decode(publicAddress);
        const msgUint8 = new TextEncoder().encode(msg);
        isValid = nacl.sign.detached.verify(msgUint8, signatureUint8, pubKeyUint8);
      } catch (err) {
        console.error('Solana verification error:', err);
        isValid = false;
      }
    } else {
      // Default to Ethereum signature verification for WalletConnect sessions.
      try {
        const recoveredAddress = ethers.verifyMessage(msg, signature);
        isValid = recoveredAddress.toLowerCase() === publicAddress.toLowerCase();
      } catch (err) {
        console.error('Ethereum verification error:', err);
        isValid = false;
      }
    }

    if (!isValid) {
      console.log(`[AUTH] Verification Failed: Invalid signature for ${publicAddress}`);
      return res.status(401).json({ error: 'Signature verification failed' });
    }
    
    console.log(`[AUTH] Verification Success: ${publicAddress}`);

    // Update nonce to prevent replay attacks
    user.nonce = uuidv4();
    user.lastSeenAt = new Date();
    await user.save();

    // Generate JWT
    const expiresIn = (JWT_EXPIRES_DAYS.toString().includes('h') || JWT_EXPIRES_DAYS.toString().includes('d'))
      ? JWT_EXPIRES_DAYS
      : `${JWT_EXPIRES_DAYS}d`;

    const token = jwt.sign(
      { 
        id: user._id, 
        publicAddress: user.publicAddress,
        walletType: user.walletType
      }, 
      JWT_SECRET, 
      { expiresIn: expiresIn as any }
    );

    console.log(`[AUTH] Token Generated for ${user.publicAddress}`);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Only true for HTTPS
      sameSite: 'lax', // Changed from 'strict' to allow cross-site requests during development
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.status(200).json({ user });
  } catch (error) {
    console.error('[AUTH] Error in verifySignature:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSession = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    const user = await User.findById(userId).select('_id publicAddress publicKey username walletType');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.publicKey && user.walletType !== 'solana') {
      const onChainKey = await fetchPublicKeyFromChain(user.publicAddress);
      if (onChainKey) {
        user.publicKey = onChainKey;
        await user.save();
      }
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error('[AUTH] Error in getSession:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePublicKey = async (req: any, res: Response) => {
  try {
    const { publicKey } = req.body;
    const userId = req.user.id;

    if (!publicKey) {
      return res.status(400).json({ error: 'Public key is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.publicKey = publicKey;
    await user.save();

    return res.status(200).json({ message: 'Public key updated successfully' });
  } catch (error) {
    console.error('Error in updatePublicKey:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPublicKeyByWallet = async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    const user = await User.findOne({ publicAddress: wallet.toLowerCase() });

    if (user && user.publicKey) {
      return res.status(200).json({ publicKey: user.publicKey });
    }

    // Fallback to checking the smart contract
    const onChainKey = await fetchPublicKeyFromChain(wallet);
    if (onChainKey) {
      if (user) {
        user.publicKey = onChainKey;
        await user.save();
      } else {
        // We could create a basic user record here, but it's not strictly necessary just to return the key
      }
      return res.status(200).json({ publicKey: onChainKey });
    }

    return res.status(404).json({ error: 'Public key not found for this wallet' });
  } catch (error) {
    console.error('Error in getPublicKeyByWallet:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserByWallet = async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    const normalizedWallet = wallet.trim();
    const walletCandidates = Array.from(new Set([
      normalizedWallet,
      normalizedWallet.toLowerCase(),
      normalizedWallet.toUpperCase(),
    ]));

    let user = null;
    for (const candidate of walletCandidates) {
      user = await User.findOne({
        $or: [
          { publicAddress: candidate },
          { publicKey: candidate },
        ],
      });
      if (user) break;
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      user: {
        _id: user._id,
        publicAddress: user.publicAddress,
        publicKey: user.publicKey,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        walletType: user.walletType,
      },
    });
  } catch (error) {
    console.error('Error in getUserByWallet:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateFcmToken = async (req: any, res: Response) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user.id;
    if (!fcmToken) {
      return res.status(400).json({ error: 'fcmToken is required' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.fcmToken = fcmToken;
    user.lastSeenAt = new Date();
    await user.save();
    return res.status(200).json({ message: 'FCM token updated' });
  } catch (error) {
    console.error('Error in updateFcmToken:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
