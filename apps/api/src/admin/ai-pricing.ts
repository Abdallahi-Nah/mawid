/**
 * Groq price per 1 million tokens, in US dollars (input / output).
 * This is an ESTIMATE for the admin screen, copied from the public Groq price list: check
 * https://groq.com/pricing and update the numbers when they change. An unknown model costs 0 here.
 */
export const GROQ_PRICE_PER_MILLION: Record<string, { in: number; out: number }> = {
  'llama-3.3-70b-versatile': { in: 0.59, out: 0.79 },
  'llama-3.1-8b-instant': { in: 0.05, out: 0.08 },
};

export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const p = GROQ_PRICE_PER_MILLION[model];
  if (!p) return 0;
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}
