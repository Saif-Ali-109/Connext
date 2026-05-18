import { getApiBaseUrl, getAuthenticatedHeaders } from './api';

export interface FileAttachment {
  type: 'file';
  fileType: string;
  fileName: string;
  objectKey: string;
  size?: number;
}

export interface UploadResult {
  objectKey: string;
  url: string;
}

export async function uploadMedia(file: File): Promise<UploadResult> {
  const baseUrl = getApiBaseUrl();
  const headers = getAuthenticatedHeaders();
  // Do NOT set Content-Type here, let the browser set it with the boundary for FormData

  const formData = new FormData();
  formData.append('file', file);

  try {
    const uploadRes = await fetch(`${baseUrl}/media/upload`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    if (!uploadRes.ok) {
      let errorMsg = 'Failed to upload file to proxy';
      try {
        const data = await uploadRes.json();
        errorMsg = data.error || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }

    const { objectKey } = await uploadRes.json();
    return { objectKey, url: '' }; // URL is not needed for the upload result anymore as we use getMediaDownloadUrl later
  } catch (err) {
    console.error('[uploadMedia] Proxy upload failed:', err);
    throw err;
  }
}

export async function getMediaDownloadUrl(objectKey: string): Promise<string> {
  const baseUrl = getApiBaseUrl();
  const headers = getAuthenticatedHeaders();
  headers.set('Content-Type', 'application/json');

  const signRes = await fetch(`${baseUrl}/media/sign-download`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ objectKey }),
    credentials: 'include',
  });

  if (!signRes.ok) {
    let errorMsg = 'Failed to get download URL';
    try {
      const data = await signRes.json();
      errorMsg = data.error || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  const { downloadUrl } = await signRes.json();
  return downloadUrl;
}
