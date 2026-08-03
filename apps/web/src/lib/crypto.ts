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

export function getStoredPrivateKey(): string | null {
  try {
    return localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function hasKeys(): boolean {
  return !!(getStoredPublicKey() && getStoredPrivateKey());
}

export async function ensureKeys(serverUrl: string): Promise<string> {
  const existing = getStoredPublicKey();
  if (existing) return existing;

  const { publicKey, privateKey } = await generateKeyPair();
  storeKeyPair(publicKey, privateKey);

  try {
    await fetch(`${serverUrl}/auth/public-key`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey }),
    });
  } catch {
    // non-blocking: keys are stored locally, upload can retry later
  }

  return publicKey;
}

export async function computeFingerprint(publicKeyBase64: string): Promise<string> {
  const spkiBytes = base64ToArrayBuffer(publicKeyBase64);
  const digest = await crypto.subtle.digest('SHA-256', spkiBytes);
  return arrayBufferToBase64(digest);
}

export async function signNonce(privateKeyBase64: string, nonce: string): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(privateKeyBase64),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(nonce)
  );

  return arrayBufferToBase64(signature);
}

export async function uploadKeyWithProof(serverUrl: string): Promise<void> {
  let publicKey = getStoredPublicKey();
  let privateKey = getStoredPrivateKey();
  if (!publicKey || !privateKey) {
    const generated = await generateKeyPair();
    publicKey = generated.publicKey;
    privateKey = generated.privateKey;
    storeKeyPair(publicKey, privateKey);
  }

  const fingerprint = await computeFingerprint(publicKey);
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = Array.from(nonceBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const signature = await signNonce(privateKey, nonce);

  const res = await fetch(`${serverUrl}/auth/public-key`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey, fingerprint, nonce, signature }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Failed to upload key (${res.status})`);
  }
}

export async function syncKeyWithServer(serverUrl: string): Promise<{
  status: 'ok' | 'mismatch' | 'unavailable';
  serverFingerprint: string | null;
}> {
  if (!hasKeys()) {
    await ensureKeys(serverUrl);
  }

  try {
    const res = await fetch(`${serverUrl}/auth/key-status`, { credentials: 'include' });
    if (!res.ok) return { status: 'unavailable', serverFingerprint: null };
    const data = (await res.json()) as {
      publicKey?: string | null;
      fingerprint?: string | null;
    };
    const serverFingerprint = data.fingerprint ?? null;
    const localPublicKey = getStoredPublicKey();
    if (!localPublicKey) return { status: 'unavailable', serverFingerprint };

    if (!data.publicKey) {
      try {
        await uploadKeyWithProof(serverUrl);
        return { status: 'ok', serverFingerprint };
      } catch {
        return { status: 'unavailable', serverFingerprint };
      }
    }

    const localFingerprint = await computeFingerprint(localPublicKey);
    if (serverFingerprint === localFingerprint) {
      return { status: 'ok', serverFingerprint };
    }
    return { status: 'mismatch', serverFingerprint };
  } catch {
    return { status: 'unavailable', serverFingerprint: null };
  }
}

// Hybrid envelope (JSON string, NOT base64), so decrypt can detect it by its
// `{"v":` prefix and fall back to legacy raw RSA-OAEP base64 for old messages:
//   {"v":2,"k":"<base64 AES key wrapped with RSA-OAEP>","i":"<base64 12-byte IV>","c":"<base64 AES-GCM ciphertext+tag>"}
// AES-GCM returns ciphertext||authTag concatenated, so there is no separate tag.
export async function encryptMessage(peerPublicKeyBase64: string, plaintext: string): Promise<string> {
  const rsaPublicKey = await crypto.subtle.importKey(
    'spki',
    base64ToArrayBuffer(peerPublicKeyBase64),
    { name: KEY_ALGORITHM, hash: HASH },
    false,
    ['wrapKey']
  );

  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);
  const wrappedKey = await crypto.subtle.wrapKey('raw', aesKey, rsaPublicKey, { name: KEY_ALGORITHM });

  return JSON.stringify({
    v: 2,
    k: arrayBufferToBase64(wrappedKey),
    i: arrayBufferToBase64(iv.buffer),
    c: arrayBufferToBase64(ciphertext),
  });
}

async function decryptPayload(privateKeyBase64: string, payload: string): Promise<string> {
  if (payload.startsWith('{"v":')) {
    const envelope = JSON.parse(payload) as { k: string; i: string; c: string };
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      base64ToArrayBuffer(privateKeyBase64),
      { name: KEY_ALGORITHM, hash: HASH },
      false,
      ['unwrapKey']
    );
    const aesKey = await crypto.subtle.unwrapKey(
      'raw',
      base64ToArrayBuffer(envelope.k),
      privateKey,
      { name: KEY_ALGORITHM },
      { name: 'AES-GCM', length: 256 },
      true,
      ['decrypt']
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToArrayBuffer(envelope.i) },
      aesKey,
      base64ToArrayBuffer(envelope.c)
    );
    return new TextDecoder().decode(decrypted);
  }

  // Legacy raw RSA-OAEP base64 ciphertext
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(privateKeyBase64),
    { name: KEY_ALGORITHM, hash: HASH },
    false,
    ['decrypt']
  );
  const ciphertext = base64ToArrayBuffer(payload);
  const decrypted = await crypto.subtle.decrypt(
    { name: KEY_ALGORITHM },
    privateKey,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

export async function decryptMessage(payload: string): Promise<string> {
  const privateKeyBase64 = getStoredPrivateKey();
  if (!privateKeyBase64) throw new Error('No private key found');
  return decryptPayload(privateKeyBase64, payload);
}

export async function decryptWithKey(privateKeyBase64: string, payload: string): Promise<string> {
  return decryptPayload(privateKeyBase64, payload);
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
