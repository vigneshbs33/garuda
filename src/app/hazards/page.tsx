'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useRef } from 'react';
import AlertBanner from '@/components/AlertBanner';

const HazardMap = dynamic(() => import('@/components/HazardMap'), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Stats {
  total_detections: number;
  critical_zones:   number;
  warning_zones:    number;
  alerts_fired:     number;
  average_rhs:      number;
}

interface Hazard {
  id:                    number;
  camera_id:             string;
  location:              string;
  damage_type:           string;
  road_health_score:     number;
  risk_level:            'LOW' | 'WARNING' | 'CRITICAL';
  deterioration_rate:    number;
  predicted_critical_at: string | null;
  days_until_critical:   number | null;
  alert_fired:           boolean;
  timestamp:             string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function riskBadge(level: string) {
  const cls =
    level === 'CRITICAL'
      ? 'bg-red-900 text-red-300 border-red-700'
      : level === 'WARNING'
      ? 'bg-yellow-900 text-yellow-300 border-yellow-700'
      : 'bg-green-900 text-green-300 border-green-700';
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cls}`}>
      {level}
    </span>
  );
}

function rhsBar(rhs: number) {
  const color = rhs < 30 ? '#ef4444' : rhs < 55 ? '#f59e0b' : '#22c55e';
  return (
    <div className="w-full bg-gray-800 rounded-full h-2 mt-1">
      <div
        className="h-2 rounded-full transition-all"
        style={{ width: `${rhs}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function HazardsPage() {
  const [stats, setStats]       = useState<Stats | null>(null);
  const [hazards, setHazards]   = useState<Hazard[]>([]);
  const [geojson, setGeojson]   = useState<any>({ type: 'FeatureCollection', features: [] });
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);

  // ------------------------------------------------------------------
  // Fetch data
  // ------------------------------------------------------------------
  const fetchAll = async () => {
    try {
      const [s, h, g] = await Promise.all([
        fetch(`${API}/api/v1/hazards/stats`).then((r) => r.json()),
        fetch(`${API}/api/v1/hazards/?limit=30`).then((r) => r.json()),
        fetch(`${API}/api/v1/hazards/heatmap`).then((r) => r.json()),
      ]);
      setStats(s);
      setHazards(Array.isArray(h) ? h : []);
      setGeojson(g);
    } catch (e) {
      console.error('Failed to fetch hazard data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 15000);
    return () => clearInterval(iv);
  }, []);

  // ------------------------------------------------------------------
  // Upload + analyze
  // ------------------------------------------------------------------
  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    const form = new FormData();
    form.append('file', file);
    form.append('camera_id', cameraRef.current?.value || 'demo-cam');
    form.append('location',  locationRef.current?.value || 'Demo Location');
    form.append('lat', '0');
    form.append('lon', '0');

    setUploading(true);
    setUploadResult(null);
    try {
      const res = await fetch(`${API}/api/v1/hazards/analyze`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      setUploadResult(data);
      await fetchAll();
    } catch (e) {
      setUploadResult({ error: 'Upload failed. Check backend.' });
    } finally {
      setUploading(false);
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Real-time alert banner */}
      <AlertBanner />

      {/* Header */}
      <div className="px-6 pt-8 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-3xl">🛣️</span>
          <h1 className="text-2xl font-bold">Road Hazard Intelligence</h1>
          <span className="ml-auto text-xs text-gray-500 bg-gray-800 px-3 py-1 rounded-full">
            Auto-refresh 15s
          </span>
        </div>
        <p className="text-sm text-gray-400">
          Real-time road damage detection · Early damage prediction · Time-based risk scoring
        </p>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Total Detections', value: stats.total_detections, icon: '🔍', color: 'blue' },
              { label: 'Critical Zones', value: stats.critical_zones, icon: '🚨', color: 'red' },
              { label: 'Warning Zones', value: stats.warning_zones, icon: '⚠️', color: 'yellow' },
              { label: 'Alerts Fired', value: stats.alerts_fired, icon: '📢', color: 'orange' },
              { label: 'Avg Road Health', value: `${stats.average_rhs}/100`, icon: '💪', color: 'green' },
            ].map((c) => (
              <div
                key={c.label}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition"
              >
                <div className="text-2xl mb-1">{c.icon}</div>
                <div className="text-2xl font-bold">{c.value}</div>
                <div className="text-xs text-gray-400 mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Map + Upload side-by-side */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Heatmap */}
          <div className="xl:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              🗺️ Road Damage Heatmap
              <span className="text-xs text-gray-500 font-normal ml-2">
                🟢 Low &nbsp; 🟡 Warning &nbsp; 🔴 Critical
              </span>
            </h2>
            <div className="rounded-xl overflow-hidden" style={{ height: 400 }}>
              {!loading && <HazardMap geojson={geojson} />}
              {loading && (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Loading map...
                </div>
              )}
            </div>
          </div>

          {/* Upload panel */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-semibold mb-4">📸 Analyze Road Image</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Camera / Sensor ID</label>
                <input
                  ref={cameraRef}
                  defaultValue="CAM-01"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Location Name</label>
                <input
                  ref={locationRef}
                  defaultValue="NH-44, Km 120"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Road Image (JPG/PNG)</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="w-full text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-xs hover:file:bg-blue-700"
                />
              </div>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition text-sm"
              >
                {uploading ? '⏳ Analyzing...' : '🔍 Run Detection'}
              </button>

              {/* Upload result */}
              {uploadResult && (
                <div
                  className={`rounded-xl p-3 text-xs border ${
                    uploadResult.error
                      ? 'bg-red-950 border-red-800 text-red-300'
                      : uploadResult.risk_level === 'CRITICAL'
                      ? 'bg-red-950 border-red-700 text-red-200'
                      : uploadResult.risk_level === 'WARNING'
                      ? 'bg-yellow-950 border-yellow-800 text-yellow-200'
                      : 'bg-green-950 border-green-800 text-green-200'
                  }`}
                >
                  {uploadResult.error ? (
                    <p>❌ {uploadResult.error}</p>
                  ) : (
                    <>
                      <p className="font-bold text-sm mb-1">
                        {uploadResult.risk_level === 'CRITICAL' ? '🚨' : uploadResult.risk_level === 'WARNING' ? '⚠️' : '✅'}{' '}
                        {uploadResult.risk_level} — RHS {uploadResult.road_health_score.toFixed(0)}/100
                      </p>
                      <p>Detections: {uploadResult.total_detections}</p>
                      {uploadResult.damage_type && <p>Type: {uploadResult.damage_type?.replace(/_/g, ' ')}</p>}
                      {uploadResult.predicted_critical_at && (
                        <p className="text-red-300 mt-1">⏰ Critical by: {uploadResult.predicted_critical_at}</p>
                      )}
                      {uploadResult.days_until_critical !== null && (
                        <p>Days until critical: {uploadResult.days_until_critical}</p>
                      )}
                      {uploadResult.alert_fired && (
                        <p className="font-bold text-red-300 mt-1">🚨 Emergency alert fired!</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent detections table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold mb-4">📋 Recent Detections</h2>
          {hazards.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">
              No detections yet. Upload a road image above to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-800">
                    <th className="text-left pb-2 pr-4">Location</th>
                    <th className="text-left pb-2 pr-4">Damage</th>
                    <th className="text-left pb-2 pr-4">Road Health</th>
                    <th className="text-left pb-2 pr-4">Risk</th>
                    <th className="text-left pb-2 pr-4">Deterioration</th>
                    <th className="text-left pb-2 pr-4">Critical Date</th>
                    <th className="text-left pb-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {hazards.map((h) => (
                    <tr
                      key={h.id}
                      className="border-b border-gray-800/50 hover:bg-gray-800/30 transition"
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium">{h.location || h.camera_id}</p>
                        <p className="text-xs text-gray-500">{h.camera_id}</p>
                      </td>
                      <td className="py-3 pr-4 capitalize">
                        {h.damage_type.replace(/_/g, ' ')}
                      </td>
                      <td className="py-3 pr-4 w-28">
                        <span className="font-mono font-bold">{h.road_health_score.toFixed(0)}</span>
                        {rhsBar(h.road_health_score)}
                      </td>
                      <td className="py-3 pr-4">{riskBadge(h.risk_level)}</td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {h.deterioration_rate < 0 ? (
                          <span className="text-red-400">{h.deterioration_rate.toFixed(2)}/day</span>
                        ) : h.deterioration_rate > 0 ? (
                          <span className="text-green-400">+{h.deterioration_rate.toFixed(2)}/day</span>
                        ) : (
                          <span className="text-gray-500">stable</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        {h.predicted_critical_at ? (
                          <span className="text-red-400">
                            {h.predicted_critical_at}
                            {h.days_until_critical !== null && (
                              <span className="text-gray-500 ml-1">({h.days_until_critical}d)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="py-3 text-xs text-gray-500">
                        {new Date(h.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
