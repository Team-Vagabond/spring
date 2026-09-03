export interface MapSensor {
  id: string;
  name: string;
  village: string;
  lat: number;
  lng: number;
  elevation_m: number;
  active: boolean;
  current_flow_lpm: number | null;
  anomaly_pct: number | null;
  spark?: number[];
  signal?: { kind: string; decision: string; severity: string } | null;
  escalation?: { id: string; status: string } | null;
}

export type SensorStatus = 'escalated' | 'watching' | 'healthy' | 'inactive';

export function statusOf(s: MapSensor): SensorStatus {
  if (!s.active) return 'inactive';
  if (s.escalation) return 'escalated';
  if (s.signal?.decision === 'watching') return 'watching';
  return 'healthy';
}

export const STATUS_COLOR: Record<SensorStatus, string> = {
  escalated: '#cd6152',
  watching: '#cc8542',
  healthy: '#4fa8ab',
  inactive: '#6c7b70',
};

export const STATUS_LABEL: Record<SensorStatus, string> = {
  escalated: 'under investigation',
  watching: 'watching',
  healthy: 'nominal',
  inactive: 'inactive',
};
