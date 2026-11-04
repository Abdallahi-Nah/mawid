import { ApiError } from '@/lib/api';

type T = { (key: string): string; has: (key: string) => boolean };

/** Friendly message for an API error, in the current language (keys under apiErrors.*). */
export function errorMessage(t: T, e: unknown): string {
  if (e instanceof ApiError && t.has(`apiErrors.${e.code}`)) return t(`apiErrors.${e.code}`);
  if (e instanceof TypeError) return t('apiErrors.NETWORK'); // fetch could not reach the server
  return t('apiErrors.UNKNOWN');
}

/** Field errors of a validation error: { fieldName: translationKeyUnderFormErrors }. */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_ERROR') return {};
  return Object.fromEntries((e.details ?? []).map((d) => [d.path.split('.')[0], d.message]));
}
