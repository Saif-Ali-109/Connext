export interface CachedChatContact {
  id: string;
  username?: string;
  displayName?: string;
  email?: string;
  customName?: string;
}

export const setEncryptedItem = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  try {
    const encoded = btoa(unescape(encodeURIComponent(value)));
    localStorage.setItem(key, encoded);
  } catch (e) {
    console.error('Encryption failed', e);
  }
};

export const getEncryptedItem = (key: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    try {
      return decodeURIComponent(escape(atob(item)));
    } catch {
      return item;
    }
  } catch {
    return null;
  }
};

export const removeEncryptedItem = (key: string) => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key);
};

const cachedContactsKey = (userId: string) => `chat_cached_contacts_${userId}`;

export const saveCachedContacts = (userId: string, contacts: CachedChatContact[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(cachedContactsKey(userId), JSON.stringify(contacts));
};

export const loadCachedContacts = (userId: string): CachedChatContact[] => {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(cachedContactsKey(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CachedChatContact[];
  } catch {
    return [];
  }
};

export const clearAuthSession = () => {
  if (typeof window === 'undefined') return;
  removeEncryptedItem('auth_address');
  removeEncryptedItem('auth_publicKey');
  removeEncryptedItem('auth_user_id');
  localStorage.removeItem('auth_user_id');
};
