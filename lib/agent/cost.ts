// Token accounting → cost. Prices are public list-price estimates (USD / 1M tokens);
// the hackathon endpoint is free, but slide 7 needs a real cost-per-run figure so we
// price every call as if it ran on list-price infrastructure.
const USD_PER_NPR = 1 / 133; // ~ NPR 133 = USD 1 (Sept 2026)

const PRICE: Record<string, { in: number; out: number }> = {
  'gpt-5.5': { in: 1.25, out: 10 },
  'deepseek-v4-flash': { in: 0.1, out: 0.3 },
  'deepseek-v4-pro': { in: 0.55, out: 2.2 },
  'grok-4.6': { in: 2, out: 10 },
  'kimi-k2.6': { in: 0.6, out: 2.5 },
};

function key(model: string): string {
  const m = model.toLowerCase();
  if (m.startsWith('gpt-5')) return 'gpt-5.5';
  if (m.includes('flash')) return 'deepseek-v4-flash';
  if (m.includes('deepseek')) return 'deepseek-v4-pro';
  if (m.includes('grok')) return 'grok-4.6';
  if (m.includes('kimi')) return 'kimi-k2.6';
  return 'deepseek-v4-flash';
}

export interface Meter {
  promptTokens: number;
  completionTokens: number;
  usd: number;
  calls: number;
  byModel: Record<string, { calls: number; prompt: number; completion: number; usd: number }>;
}

export function newMeter(): Meter {
  return { promptTokens: 0, completionTokens: 0, usd: 0, calls: 0, byModel: {} };
}

export function addUsage(
  meter: Meter,
  model: string,
  usage?: { prompt_tokens?: number; completion_tokens?: number },
) {
  const p = usage?.prompt_tokens ?? 0;
  const c = usage?.completion_tokens ?? 0;
  const price = PRICE[key(model)];
  const usd = (p * price.in + c * price.out) / 1_000_000;
  meter.promptTokens += p;
  meter.completionTokens += c;
  meter.usd += usd;
  meter.calls += 1;
  const k = key(model);
  meter.byModel[k] ??= { calls: 0, prompt: 0, completion: 0, usd: 0 };
  meter.byModel[k].calls += 1;
  meter.byModel[k].prompt += p;
  meter.byModel[k].completion += c;
  meter.byModel[k].usd += usd;
}

export const npr = (usd: number) => usd / USD_PER_NPR;
export const nprStr = (usd: number) => `NPR ${(usd / USD_PER_NPR).toFixed(2)}`;
