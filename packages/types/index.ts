export interface User {
  id: string;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  roomId: string;
}

export interface ChatRoom {
  id: string;
  participants: string[];
  lastMessage?: Message;
}
