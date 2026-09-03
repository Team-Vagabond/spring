import { admin } from '@/lib/db';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const { data: s } = await admin.from('sensors').select('active').eq('id', id).single();
  if (!s) return bad('sensor not found', 404);
  const active = typeof b.active === 'boolean' ? b.active : !s.active;
  await admin.from('sensors').update({ active }).eq('id', id);
  return json({ ok: true, id, active });
}
