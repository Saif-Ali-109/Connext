export const generateKeyPair = async () => {
  if (typeof window === 'undefined') throw new Error('Crypto is only available in the browser');
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicKey = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privateKey = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKey))),
    privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKey))),
  };
};

export const encryptMessage = async (publicKeyStr: string, plaintext: string) => {
  if (typeof window === 'undefined') throw new Error('Crypto is only available in the browser');
  const publicKeyBuf = Uint8Array.from(atob(publicKeyStr), (c) => c.charCodeAt(0));
  const publicKey = await window.crypto.subtle.importKey(
    "spki",
    publicKeyBuf,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );

  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    publicKey,
    encoded
  );

  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
};

export const decryptMessage = async (privateKeyStr: string, ciphertext: string) => {
  if (typeof window === 'undefined') throw new Error('Crypto is only available in the browser');
  const privateKeyBuf = Uint8Array.from(atob(privateKeyStr), (c) => c.charCodeAt(0));
  const privateKey = await window.crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuf,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"]
  );

  const encryptedBuf = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    encryptedBuf
  );

  return new TextDecoder().decode(decrypted);
};

export const validateKeyPair = async (publicKeyStr: string, privateKeyStr: string) => {
  if (!publicKeyStr || !privateKeyStr) return false;

  try {
    const probe = `connext-key-check:${Date.now()}`;
    const encrypted = await encryptMessage(publicKeyStr, probe);
    const decrypted = await decryptMessage(privateKeyStr, encrypted);
    return decrypted === probe;
  } catch {
    return false;
  }
};

export const storePrivateKey = (wallet: string, privateKey: string) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`chat_priv_${wallet.toLowerCase()}`, privateKey);
};

export const getPrivateKey = (wallet: string) => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(`chat_priv_${wallet.toLowerCase()}`);
};
