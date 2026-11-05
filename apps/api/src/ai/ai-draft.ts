import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A draft is a booking proposal signed by the server. Only a valid, fresh draft can be confirmed by the
 * customer's click, so the model can never create a booking by itself (AI-01, AC-05).
 */
export interface DraftPayload {
  businessId: string;
  serviceId: string;
  staffId: string | null;
  startsAt: string; // ISO UTC
  expiresAt: number; // epoch ms
}

export const DRAFT_TTL_MS = 20 * 60_000;

const sign = (body: string, secret: string): string =>
  createHmac('sha256', `${secret}:ai-draft`).update(body).digest('base64url');

export function signDraft(p: DraftPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(p)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

/** null = forged, damaged or expired. */
export function verifyDraft(token: string, secret: string, now = Date.now()): DraftPayload | null {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as DraftPayload;
    if (typeof p.expiresAt !== 'number' || p.expiresAt < now) return null;
    return p;
  } catch {
    return null;
  }
}
