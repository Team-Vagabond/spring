'use client';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Circle, Rectangle, Tooltip, LayersControl, useMap } from 'react-leaflet';
import { useEffect, useMemo, useRef } from 'react';
import * as turf from '@turf/turf';

function FitPolygon({ bounds }: { bounds?: [[number, number], [number, number]] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !bounds) return;
    map.fitBounds(bounds, { padding: [24, 24] });
    done.current = true;
  }, [map, bounds]);
  return null;
}

export function RechargeMap({
  polygon,
  spring,
  springSnapped,
  aoi,
  height = 420,
}: {
  polygon: any;
  spring: { lat: number; lng: number; name: string };
  springSnapped?: { lat: number; lng: number };
  aoi?: [number, number, number, number];
  height?: number;
}) {
  const bounds = useMemo<[[number, number], [number, number]] | undefined>(() => {
    try {
      const b = turf.bbox(polygon);
      const pad = 0.12;
      const dx = (b[2] - b[0]) * pad;
      const dy = (b[3] - b[1]) * pad;
      return [[b[1] - dy, b[0] - dx], [b[3] + dy, b[2] + dx]];
    } catch {
      return undefined;
    }
  }, [polygon]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-[var(--hairline-2)]" style={{ height }}>
      <MapContainer bounds={bounds} className="w-full h-full" scrollWheelZoom zoomControl={false}>
        <FitPolygon bounds={bounds} />
        <LayersControl position="bottomright">
          <LayersControl.BaseLayer checked name="Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Esri, Maxar"
              maxZoom={18}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Terrain">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}"
              attribution="Esri, National Geographic"
              maxZoom={16}
              className="map-terrain"
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {aoi && (
          <Rectangle
            bounds={[[aoi[1], aoi[0]], [aoi[3], aoi[2]]]}
            pathOptions={{ color: '#e9ede6', weight: 1, opacity: 0.35, dashArray: '2 6', fill: false }}
          />
        )}

        <GeoJSON
          data={polygon}
          style={{ color: '#f2c46b', weight: 2.5, opacity: 0.95, fillColor: '#4fa8ab', fillOpacity: 0.14 }}
        />

        {springSnapped && (
          <CircleMarker
            center={[springSnapped.lat, springSnapped.lng]}
            radius={3}
            pathOptions={{ color: '#74c9ca', weight: 1, fillColor: '#74c9ca', fillOpacity: 0.4 }}
          >
            <Tooltip>drainage outlet used for the trace</Tooltip>
          </CircleMarker>
        )}

        <Circle center={[spring.lat, spring.lng]} radius={140} pathOptions={{ color: '#74c9ca', weight: 1, opacity: 0.5, fill: false }} />
        <CircleMarker
          center={[spring.lat, spring.lng]}
          radius={7}
          pathOptions={{ color: '#04100f', weight: 2, fillColor: '#74c9ca', fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -8]}>{spring.name}</Tooltip>
        </CircleMarker>
      </MapContainer>

      <div className="absolute left-3 bottom-3 z-[500] flex flex-col gap-1.5 rounded-lg bg-[var(--ink-a80)] backdrop-blur-sm border border-[var(--hairline)] px-2.5 py-2 text-[0.68rem] text-[var(--text-2)]">
        <span className="flex items-center gap-2"><span className="w-3 h-[2px] bg-[#f2c46b]" /> estimated catchment</span>
        <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#74c9ca]" /> spring sensor</span>
        {aoi && <span className="flex items-center gap-2"><span className="w-3 border-t border-dashed border-white/40" /> imagery footprint</span>}
      </div>
    </div>
  );
}
