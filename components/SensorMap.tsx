'use client';
import { MapContainer, TileLayer, CircleMarker, Popup, LayersControl, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import Link from 'next/link';

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(points as any, { padding: [50, 50], maxZoom: 13 });
  }, [map, points]);
  return null;
}

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
  signal?: { kind: string; decision: string } | null;
  escalation?: { id: string; status: string } | null;
}

// Darchula district rough bounds
const DARCHULA_CENTER: [number, number] = [29.75, 80.58];

export function SensorMap({ sensors }: { sensors: MapSensor[] }) {
  const pts = sensors.filter((s) => s.lat && s.lng);
  return (
    <MapContainer
      center={DARCHULA_CENTER}
      zoom={11}
      className="h-full w-full"
      scrollWheelZoom
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Satellite">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics"
            maxZoom={18}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Terrain">
          <TileLayer
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenTopoMap (CC-BY-SA)"
            maxZoom={17}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Streets">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <FitBounds points={pts.map((s) => [s.lat, s.lng])} />

      {pts.map((s) => {
        const color = !s.active ? '#94a3b8' : s.escalation ? '#fb7185' : s.signal?.decision === 'watching' ? '#fbbf24' : '#34d399';
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            radius={9}
            pathOptions={{ color: '#0b1220', weight: 2, fillColor: color, fillOpacity: 0.95 }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{s.name}</div>
                <div className="mono text-xs text-[var(--muted)]">{s.id} · {s.village}</div>
                <div className="mt-1.5 space-y-0.5">
                  <div>Status: <b style={{ color }}>{s.active ? 'active' : 'inactive'}</b></div>
                  <div>Location: <span className="mono">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</span> · {s.elevation_m} m</div>
                  <div>Flow: {s.current_flow_lpm != null ? `${s.current_flow_lpm.toFixed(2)} L/min` : '—'}
                    {s.anomaly_pct != null && <span className="text-[var(--muted)]"> ({s.anomaly_pct > 0 ? '+' : ''}{s.anomaly_pct}% vs baseline)</span>}
                  </div>
                  {s.signal && <div>Latest signal: {s.signal.kind} · {s.signal.decision}</div>}
                </div>
                {s.escalation && (
                  <Link href={`/escalated/${s.escalation.id}`} className="text-sky-400 underline text-xs">
                    view escalation analysis →
                  </Link>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
