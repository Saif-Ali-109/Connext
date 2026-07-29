export interface CachedChatContact {
  id: string;
  username?: string;
  displayName?: string;
  email?: string;
  customName?: string;
}

export const setEncodedItem = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  try {
    const encoded = btoa(unescape(encodeURIComponent(value)));
    localStorage.setItem(key, encoded);
  } catch {
    // ignore encode errors
  }
};

export const getEncodedItem = (key: string): string | null => {
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

const removeItem = (key: string) => {
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
  removeItem('auth_user_id');
};
