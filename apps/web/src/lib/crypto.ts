const PRIVATE_KEY_STORAGE_KEY = 'connext_private_key';
const PUBLIC_KEY_STORAGE_KEY = 'connext_public_key';

const KEY_ALGORITHM = 'RSA-OAEP';
const KEY_LENGTH = 2048;
const HASH = 'SHA-256';

export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: KEY_ALGORITHM,
      modulusLength: KEY_LENGTH,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: HASH,
    },
    true,
    ['encrypt', 'decrypt']
  );

  const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(publicKey),
    privateKey: arrayBufferToBase64(privateKey),
  };
}

export function storeKeyPair(publicKey: string, privateKey: string): void {
  try {
    localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, publicKey);
    localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, privateKey);
  } catch {
    // storage full or unavailable
  }
}

export function getStoredPublicKey(): string | null {
  try {
    return localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getStoredPrivateKey(): string | null {
  try {
    return localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function encryptMessage(peerPublicKeyBase64: string, plaintext: string): Promise<string> {
  const peerPublicKey = await crypto.subtle.importKey(
    'spki',
    base64ToArrayBuffer(peerPublicKeyBase64),
    { name: KEY_ALGORITHM, hash: HASH },
    false,
    ['encrypt']
  );

  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: KEY_ALGORITHM },
    peerPublicKey,
    encoded
  );

  return arrayBufferToBase64(ciphertext);
}

export async function decryptMessage(ciphertextBase64: string): Promise<string> {
  const privateKeyBase64 = getStoredPrivateKey();
  if (!privateKeyBase64) throw new Error('No private key found');

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(privateKeyBase64),
    { name: KEY_ALGORITHM, hash: HASH },
    false,
    ['decrypt']
  );

  const ciphertext = base64ToArrayBuffer(ciphertextBase64);
  const decrypted = await crypto.subtle.decrypt(
    { name: KEY_ALGORITHM },
    privateKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

export async function decryptWithKey(privateKeyBase64: string, ciphertextBase64: string): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(privateKeyBase64),
    { name: KEY_ALGORITHM, hash: HASH },
    false,
    ['decrypt']
  );

  const ciphertext = base64ToArrayBuffer(ciphertextBase64);
  const decrypted = await crypto.subtle.decrypt(
    { name: KEY_ALGORITHM },
    privateKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
