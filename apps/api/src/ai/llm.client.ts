// What the app needs from a language model. The real implementation talks to Groq; tests plug in a fake.
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type LlmMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string; name: string };

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface LlmRequest {
  model: string;
  messages: LlmMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  /** Ask for a JSON object (structured output). */
  json?: boolean;
  signal?: AbortSignal;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LlmResult {
  content: string;
  toolCalls: ToolCall[];
  usage: LlmUsage;
}

export type LlmEvent = { type: 'text'; text: string } | ({ type: 'done' } & LlmResult);

export abstract class LlmClient {
  abstract complete(req: LlmRequest): Promise<LlmResult>;
  /** Text arrives in pieces; the last event is "done" with the full result (and tool calls, if any). */
  abstract stream(req: LlmRequest): AsyncGenerator<LlmEvent>;
}
