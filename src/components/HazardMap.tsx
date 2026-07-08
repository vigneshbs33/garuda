'use client';

import { useEffect, useRef } from 'react';

interface HazardPoint {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: number;
    camera_id: string;
    location: string;
    damage_type: string;
    road_health_score: number;
    risk_level: 'LOW' | 'WARNING' | 'CRITICAL';
    predicted_critical: string | null;
    alert_fired: boolean;
    timestamp: string;
  };
}

interface GeoJSON {
  type: 'FeatureCollection';
  features: HazardPoint[];
}

interface Props {
  geojson: GeoJSON;
  center?: [number, number];
  zoom?: number;
}

// RHS → marker colour
function rhsToColor(rhs: number): string {
  if (rhs < 30) return '#ef4444';   // red  — critical
  if (rhs < 55) return '#f59e0b';   // amber — warning
  return '#22c55e';                  // green — low risk
}

export default function HazardMap({ geojson, center = [20.5937, 78.9629], zoom = 5 }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;

    // Dynamically import Leaflet (SSR safe)
    import('leaflet').then((L) => {
      // Fix default icon path issue with Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      // Initialise once
      if (!leafletMap.current) {
        leafletMap.current = L.map(mapRef.current!).setView(center, zoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
        }).addTo(leafletMap.current);
      }

      const map = leafletMap.current;

      // Clear old markers
      map.eachLayer((layer: any) => {
        if (layer instanceof L.CircleMarker) map.removeLayer(layer);
      });

      // Render new markers
      geojson.features.forEach((f) => {
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties;
        const color = rhsToColor(p.road_health_score);

        const marker = L.circleMarker([lat, lon], {
          radius: p.road_health_score < 30 ? 14 : p.road_health_score < 55 ? 10 : 8,
          fillColor: color,
          color: '#0f172a',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.85,
        }).addTo(map);

        marker.bindPopup(`
          <div style="font-family:sans-serif;min-width:200px">
            <div style="font-weight:700;font-size:14px;margin-bottom:6px">
              ${p.risk_level === 'CRITICAL' ? '🚨' : p.risk_level === 'WARNING' ? '⚠️' : '✅'}
              ${p.location}
            </div>
            <div><b>Damage:</b> ${p.damage_type.replace(/_/g, ' ')}</div>
            <div><b>Road Health:</b> ${p.road_health_score.toFixed(0)}/100</div>
            <div><b>Risk Level:</b> <span style="color:${color};font-weight:600">${p.risk_level}</span></div>
            ${p.predicted_critical ? `<div style="margin-top:4px;color:#ef4444"><b>⏰ Critical by:</b> ${p.predicted_critical}</div>` : ''}
            ${p.alert_fired ? '<div style="margin-top:4px;color:#ef4444;font-weight:600">🚨 ALERT FIRED</div>' : ''}
            <div style="margin-top:6px;font-size:11px;color:#666">${new Date(p.timestamp).toLocaleString()}</div>
          </div>
        `);
      });
    });

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson]);

  return (
    <>
      {/* Leaflet CSS */}
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
      />
      <div ref={mapRef} style={{ height: '100%', width: '100%', borderRadius: '12px' }} />
    </>
  );
}
