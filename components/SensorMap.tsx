'use client';
import { MapContainer, TileLayer, CircleMarker, Tooltip, LayersControl, useMap } from 'react-leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { type MapSensor, statusOf, STATUS_COLOR } from '@/lib/sensor-status';

const DARCHULA: [number, number] = [29.74, 80.58];

function MapController({
  bounds,
  focusKey,
  focusPos,
}: {
  bounds: [number, number][];
  focusKey: string | null;
  focusPos: [number, number] | null;
}) {
  const map = useMap();
  const didFit = useRef(false);

  // fit to the whole network exactly once
  useEffect(() => {
    if (didFit.current || bounds.length === 0) return;
    map.fitBounds(bounds, { padding: [64, 64], maxZoom: 11.4 });
    didFit.current = true;
  }, [map, bounds]);

  // fly only when the selected station actually changes
  useEffect(() => {
    if (focusPos) map.flyTo(focusPos, 13, { duration: 0.9 });
  }, [map, focusKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export function SensorMap({
  sensors,
  selected,
  onSelect,
}: {
  sensors: MapSensor[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const pts = useMemo(() => sensors.filter((s) => s.lat && s.lng), [sensors]);
  const bounds = useMemo<[number, number][]>(() => pts.map((s) => [s.lat, s.lng]), [pts]);
  const focus = selected ? pts.find((s) => s.id === selected) ?? null : null;
  const focusPos: [number, number] | null = focus ? [focus.lat, focus.lng] : null;

  return (
    <MapContainer center={DARCHULA} zoom={11} zoomControl={false} className="w-full h-full" scrollWheelZoom>
      <LayersControl position="bottomright">
        <LayersControl.BaseLayer checked name="Terrain">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}"
            attribution="Esri, National Geographic, Garmin, HERE, USGS, NASA, NOAA"
            maxZoom={16}
            className="map-terrain"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Topographic">
          <TileLayer url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" attribution="© OpenTopoMap (CC-BY-SA)" maxZoom={17} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Esri, Maxar, Earthstar Geographics"
            maxZoom={18}
            className="map-satellite"
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <MapController bounds={bounds} focusKey={selected} focusPos={focusPos} />

      {pts.map((s) => {
        const st = statusOf(s);
        const color = STATUS_COLOR[st];
        const active = selected === s.id;
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lng]}
            radius={active ? 10 : st === 'escalated' ? 7.5 : 6}
            pathOptions={{
              color: '#201e17',
              weight: active ? 2.5 : 1.5,
              fillColor: color,
              fillOpacity: st === 'inactive' ? 0.55 : 1,
            }}
            eventHandlers={{ click: () => onSelect(active ? null : s.id) }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <span className="font-semibold text-[var(--ink)]">{s.name}</span>
              <span className="text-[var(--ink-3)]"> · {s.current_flow_lpm != null ? `${s.current_flow_lpm.toFixed(1)} L/min` : 'offline'}</span>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
