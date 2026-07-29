import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const storage = new Map<string, string>();

const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => storage.clear(),
  get length() { return storage.size; },
  key: (i: number) => [...storage.keys()][i] ?? null,
};

beforeAll(() => {
  vi.stubGlobal('localStorage', mockLocalStorage);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  storage.clear();
});

describe('crypto module', () => {
  it('generates a key pair', async () => {
    const { generateKeyPair } = await import('./crypto');
    const { publicKey, privateKey } = await generateKeyPair();
    expect(publicKey).toBeTruthy();
    expect(typeof publicKey).toBe('string');
    expect(privateKey).toBeTruthy();
    expect(typeof privateKey).toBe('string');
    expect(publicKey).not.toBe(privateKey);
  });

  it('storeKeyPair persists keys to localStorage', async () => {
    const { storeKeyPair, getStoredPublicKey } = await import('./crypto');
    storeKeyPair('pub-key-123', 'priv-key-456');
    expect(getStoredPublicKey()).toBe('pub-key-123');
  });

  it('encrypt / store / decrypt roundtrip', async () => {
    const { generateKeyPair, storeKeyPair, encryptMessage, decryptMessage } = await import('./crypto');

    const { publicKey, privateKey } = await generateKeyPair();
    storeKeyPair(publicKey, privateKey);

    const original = 'Secret message for E2EE';
    const ciphertext = await encryptMessage(publicKey, original);
    expect(ciphertext).toBeTruthy();
    expect(ciphertext).not.toContain('Secret');

    const decrypted = await decryptMessage(ciphertext);
    expect(decrypted).toBe(original);
  });

  it('decryptWithKey works with explicit private key', async () => {
    const { generateKeyPair, decryptWithKey, encryptMessage } = await import('./crypto');

    const { publicKey, privateKey } = await generateKeyPair();
    const ciphertext = await encryptMessage(publicKey, 'Explicit key decryption');
    const decrypted = await decryptWithKey(privateKey, ciphertext);
    expect(decrypted).toBe('Explicit key decryption');
  });

  it('wrong key cannot decrypt', async () => {
    const { generateKeyPair, encryptMessage, decryptMessage, storeKeyPair } = await import('./crypto');

    const alice = await generateKeyPair();
    const bob = await generateKeyPair();

    const ciphertext = await encryptMessage(bob.publicKey, 'For Bob only');

    // Store Alice's key — can't decrypt Bob's ciphertext
    storeKeyPair(alice.publicKey, alice.privateKey);
    await expect(decryptMessage(ciphertext)).rejects.toThrow();
  });

  it('getStoredPublicKey returns null when empty', async () => {
    const { getStoredPublicKey } = await import('./crypto');
    expect(getStoredPublicKey()).toBeNull();
  });

  it('hasKeys returns false when no keys stored', async () => {
    const { hasKeys } = await import('./crypto');
    expect(hasKeys()).toBe(false);
  });

  it('hasKeys returns true after storing keys', async () => {
    const { hasKeys, storeKeyPair } = await import('./crypto');
    const { generateKeyPair } = await import('./crypto');
    const { publicKey, privateKey } = await generateKeyPair();
    storeKeyPair(publicKey, privateKey);
    expect(hasKeys()).toBe(true);
  });

  it('ensureKeys returns existing key without uploading', async () => {
    const { ensureKeys, storeKeyPair } = await import('./crypto');
    const { generateKeyPair } = await import('./crypto');
    const { publicKey, privateKey } = await generateKeyPair();
    storeKeyPair(publicKey, privateKey);
    const result = await ensureKeys('http://localhost:4001');
    expect(result).toBe(publicKey);
  });

  it('ensureKeys generates keys when none exist', async () => {
    storage.clear();
    const { ensureKeys, hasKeys } = await import('./crypto');
    expect(hasKeys()).toBe(false);
    const result = await ensureKeys('http://localhost:4001');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});
