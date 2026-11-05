// Calls the AI chat of the API and reads its Server-Sent Events. The browser never talks to Groq:
// it only talks to our API (the Groq key stays on the server).
import type { AiChatInput, AiStreamEvent } from '@mawid/shared';
import { ApiError } from '@/lib/api';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

/** Splits a text buffer into complete events; the incomplete end is kept for the next chunk. */
export function parseSse(buffer: string): { events: AiStreamEvent[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  const events: AiStreamEvent[] = [];
  for (const part of parts) {
    const line = part.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(6)) as AiStreamEvent);
    } catch {
      /* damaged line: skip it */
    }
  }
  return { events, rest };
}

/**
 * Sends the conversation and calls `onEvent` for each event as soon as it arrives (word by word).
 * Throws ApiError when the server refuses before the stream starts (503 AI_UNAVAILABLE, 429, 404...).
 */
export async function streamChat(
  body: AiChatInput,
  onEvent: (e: AiStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/public/ai/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { code?: string };
    throw new ApiError(res.status, data.code ?? 'UNKNOWN');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSse(buffer);
    buffer = parsed.rest;
    parsed.events.forEach(onEvent);
  }
}
