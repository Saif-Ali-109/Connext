import { getEncryptedItem } from './storage';

export function getAuthenticatedHeaders(headers?: HeadersInit): Headers {
  return new Headers(headers);
}

export function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_SERVER_URL;
  if (configured) return configured;

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    const apiProtocol = protocol === 'https:' ? 'https:' : 'http:';
    return `${apiProtocol}//${hostname}:4001`;
  }

  return 'http://localhost:4001';
}

export function getNetworkErrorMessage() {
  const baseUrl = getApiBaseUrl();
  return `NetworkError: unable to reach backend at ${baseUrl}. Please start server and try again.`;
}

export async function getSessionHealthStatus(): Promise<'valid' | 'invalid' | 'unreachable'> {
  const baseUrl = getApiBaseUrl();

  try {
    const healthResponse = await fetch(`${baseUrl}/health`, {
      cache: 'no-store',
      credentials: 'include',
    });

    if (!healthResponse.ok) {
      return 'unreachable';
    }

    const response = await fetch(`${baseUrl}/auth/session`, {
      cache: 'no-store',
      credentials: 'include',
    });

    if (response.ok) {
      return 'valid';
    }

    if (response.status === 401 || response.status === 403) {
      return 'invalid';
    }

    return 'invalid';
  } catch {
    return 'unreachable';
  }
}
