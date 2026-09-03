'use client';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import type { MapSensor } from '@/components/SensorMap';

const SensorMap = dynamic(() => import('@/components/SensorMap').then((m) => m.SensorMap), {
  ssr: false,
  loading: () => <div className="h-full grid place-items-center text-[var(--muted)]">Loading map…</div>,
});

export default function MapPage() {
  const [sensors, setSensors] = useState<MapSensor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await api('/api/sensors');
    setSensors(d.sensors);
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function seed() {
    setBusy(true);
    await api('/api/seed?wipe=1', { method: 'POST' });
    await load();
    setBusy(false);
  }

  return (
    <div className="relative" style={{ height: 'calc(100vh - 3.5rem)' }}>
      {loaded && <SensorMap sensors={sensors} />}

      <div className="absolute top-3 left-3 z-[1000] panel px-3 py-2 text-xs space-y-1">
        <div className="font-medium text-sm">Sensor network — Darchula</div>
        <div className="flex items-center gap-3 text-[var(--muted)]">
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#34d399' }} /> active</span>
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#fbbf24' }} /> watching</span>
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#fb7185' }} /> escalated</span>
          <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#94a3b8' }} /> inactive</span>
        </div>
        <div className="text-[var(--muted)]">{sensors.length} sensors · click a dot for details</div>
      </div>

      {loaded && sensors.length === 0 && (
        <div className="absolute inset-0 z-[1000] grid place-items-center">
          <button onClick={seed} disabled={busy}
            className="rounded-lg bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy ? 'Setting up…' : 'Set up demo sensor network'}
          </button>
        </div>
      )}
    </div>
  );
}
