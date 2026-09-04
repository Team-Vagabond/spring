import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const t = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
for (const l of t.split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)/); if (m) process.env[m[1]] = m[2].trim(); }
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const id = process.argv[2];
const { data: e } = await c.from('escalations').select('*').eq('id', id).single();
console.log('STATUS', e.status, '· gate', e.gate_status, '· steps', e.steps, '· failures', e.tool_failures, '· NPR', e.cost_npr, '· tokens', e.tokens_prompt + '+' + e.tokens_completion, '· conf', e.confidence, '· models', (e.models_used || []).join('+'));
console.log('\n--- TRACE ---');
for (const x of e.trace || []) {
  const hh = x.t.slice(11, 19);
  if (x.kind === 'tool' || x.kind === 'retry' || x.kind === 'note') console.log(`[${hh}] ${x.kind.padEnd(6)} ${x.tool}${x.error ? ' ✗' + x.error : ''} → ${x.result || ''} ${x.ms ? '(' + x.ms + 'ms)' : ''}`);
  else if (x.kind === 'gate') console.log(`[${hh}] GATE   ${x.content}`);
  else console.log(`[${hh}] ${(x.kind || '').toUpperCase().padEnd(6)} ${x.model ? '·' + x.model + ' ' : ''}${(x.content || '').replace(/\s+/g, ' ').slice(0, 240)}`);
}
console.log('\n--- DISPATCH ---');
console.log(JSON.stringify(e.dispatch, null, 1)?.slice(0, 1600));
