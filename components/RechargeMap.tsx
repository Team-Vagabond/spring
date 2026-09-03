'use client';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Rectangle, Popup, LayersControl } from 'react-leaflet';
import { useMemo } from 'react';
import * as turf from '@turf/turf';

export function RechargeMap({
  polygon, spring, springSnapped, aoi, height = 380,
}: {
  polygon: any;
  spring: { lat: number; lng: number; name: string };
  springSnapped?: { lat: number; lng: number };
  aoi?: [number, number, number, number]; // w,s,e,n
  height?: number;
}) {
  const center = useMemo<[number, number]>(() => {
    try {
      const c = turf.centroid(polygon).geometry.coordinates;
      return [c[1], c[0]];
    } catch {
      return [spring.lat, spring.lng];
    }
  }, [polygon, spring]);

  const bounds = useMemo<[[number, number], [number, number]] | undefined>(() => {
    try {
      const b = turf.bbox(polygon);
      return [[b[1], b[0]], [b[3], b[2]]];
    } catch { return undefined; }
  }, [polygon]);

  return (
    <MapContainer
      center={center}
      bounds={bounds}
      zoom={13}
      style={{ height }}
      className="w-full rounded-lg overflow-hidden"
      scrollWheelZoom
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Satellite">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri"
            maxZoom={18}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Terrain">
          <TileLayer url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" attribution="&copy; OpenTopoMap" maxZoom={17} />
        </LayersControl.BaseLayer>
      </LayersControl>

      {aoi && (
        <Rectangle
          bounds={[[aoi[1], aoi[0]], [aoi[3], aoi[2]]]}
          pathOptions={{ color: '#38bdf8', weight: 1, dashArray: '4 4', fill: false }}
        />
      )}

      <GeoJSON data={polygon} style={{ color: '#fbbf24', weight: 2, fillColor: '#fbbf24', fillOpacity: 0.15 }} />

      <CircleMarker center={[spring.lat, spring.lng]} radius={8}
        pathOptions={{ color: '#0b1220', weight: 2, fillColor: '#38bdf8', fillOpacity: 1 }}>
        <Popup>{spring.name} (sensor)</Popup>
      </CircleMarker>
      {springSnapped && (
        <CircleMarker center={[springSnapped.lat, springSnapped.lng]} radius={4}
          pathOptions={{ color: '#38bdf8', weight: 1, fillColor: '#38bdf8', fillOpacity: 0.5 }}>
          <Popup>drainage outlet used for the catchment trace</Popup>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
