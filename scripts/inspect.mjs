import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const t = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
for (const l of t.split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)/); if (m) process.env[m[1]] = m[2].trim(); }
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const inv = process.argv[2];
const tr = await c.from('trace_steps').select('step_no,actor,tool_name,content').eq('investigation_id', inv).order('step_no');
for (const s of tr.data || []) console.log(s.step_no, s.actor, s.tool_name || '', ':', (s.content || '').replace(/\s+/g, ' ').slice(0, 200));
const h = await c.from('hypotheses').select('code,status,confidence,label').eq('investigation_id', inv).order('confidence', { ascending: false });
console.log('\nHYPOTHESES'); for (const x of h.data || []) console.log(' ', x.code, x.label, '->', x.status, x.confidence);
const iv = await c.from('investigations').select('status,models_used,summary').eq('id', inv).single();
console.log('\nINV', JSON.stringify(iv.data));
const rp = await c.from('reports').select('*').eq('investigation_id', inv).single();
if (rp.data) console.log('\nREPORT', JSON.stringify(rp.data, null, 1).slice(0, 2500));
