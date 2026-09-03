import { env } from '../env';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatResult {
  message: ChatMessage;
  finishReason: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
}

export async function chat(opts: {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  toolChoice?: 'auto' | 'none' | 'required';
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'json_object';
}): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    max_completion_tokens: opts.maxTokens ?? 1200,
  };
  if (opts.responseFormat) body.response_format = { type: opts.responseFormat };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice ?? 'auto';
  }
  // some models (gpt-5.x, o-series) only allow the default temperature
  if (opts.temperature != null && !/^(gpt-5|o\d)/i.test(opts.model)) body.temperature = opts.temperature;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${env.llmBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': env.llmApiKey,
          Authorization: `Bearer ${env.llmApiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const txt = await r.text();
        if (r.status === 429 || r.status >= 500) {
          lastErr = new Error(`LLM ${r.status}: ${txt.slice(0, 200)}`);
          await sleep(800 * (attempt + 1));
          continue;
        }
        throw new Error(`LLM ${r.status}: ${txt.slice(0, 300)}`);
      }
      const j = await r.json();
      const choice = j.choices?.[0];
      if (!choice) throw new Error('LLM returned no choices');
      return {
        message: normalizeMessage(choice.message),
        finishReason: choice.finish_reason ?? 'stop',
        usage: j.usage,
        model: j.model ?? opts.model,
      };
    } catch (e) {
      lastErr = e;
      await sleep(600 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('LLM call failed');
}

function normalizeMessage(m: Record<string, unknown>): ChatMessage {
  return {
    role: 'assistant',
    content: (m.content as string) ?? null,
    tool_calls: (m.tool_calls as ToolCall[]) ?? undefined,
  };
}

export function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
