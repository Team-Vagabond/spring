import { admin } from '@/lib/db';
import { json } from '@/lib/http';
import { SENSOR_SEEDS, generateFlowHistory } from '@/lib/synthetic';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const wipe = new URL(req.url).searchParams.get('wipe') === '1';
  if (wipe) {
    for (const t of ['escalations', 'signals', 'readings', 'sensors']) {
      await admin.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
  }

  const seeded: Record<string, number> = {};
  for (const s of SENSOR_SEEDS) {
    await admin.from('sensors').upsert({
      id: s.id, name: s.name, village: s.village, lat: s.lat, lng: s.lng,
      elevation_m: s.elevation_m, expected_flow_lpm: s.expected_flow_lpm,
      scenario: s.scenario, active: s.active, installed_on: s.installed_on,
    });
    await admin.from('readings').delete().eq('sensor_id', s.id);
    const hist = generateFlowHistory(s, 130);
    for (let i = 0; i < hist.length; i += 200) {
      await admin.from('readings').insert(
        hist.slice(i, i + 200).map((h) => ({ sensor_id: s.id, flow_lpm: h.flow_lpm, ts: h.ts, synthetic: true })),
      );
    }
    seeded[s.id] = hist.length;
  }
  return json({ ok: true, seeded });
}
