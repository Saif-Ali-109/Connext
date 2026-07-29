import { BREVO_API_KEY, EMAIL_FROM } from './constants';
import { logger } from './logger';

const BREVO_SEND_TIMEOUT_MS = 10_000;

function parseSender(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || undefined, email: match[2].trim() };
  return { email: from.trim() };
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  textContent: string;
  htmlContent?: string;
}): Promise<void> {
  if (!BREVO_API_KEY) {
    logger.warn('[email] BREVO_API_KEY not configured. Skipping email send.');
    return;
  }

  const sender = parseSender(EMAIL_FROM);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BREVO_SEND_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        sender,
        to: [{ email: params.to }],
        subject: params.subject,
        textContent: params.textContent,
        htmlContent: params.htmlContent || params.textContent,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Brevo send failed (${res.status}): ${detail}`);
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Email service timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
