export interface PublicUser {
  id: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  hasPassword: boolean;
  emailVerified: string | null;
}

export interface FormattedMessage {
  id: string;
  sender: 'me' | 'other';
  text: string;
  createdAt: Date;
  deliveryState: 'sent' | 'delivered' | 'read';
}

export interface PaginatedMessages {
  messages: FormattedMessage[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ApiError {
  error: string;
}

export interface ApiOk {
  ok: true;
}

export type ApiResponse<T> = { data: T } | ApiError;
