'use client';

import { useEffect, useRef, useState } from 'react';

interface AlertPayload {
  hazard_id: number;
  camera_id: string;
  location: string;
  lat: number;
  lon: number;
  damage_type: string;
  road_health_score: number;
  reason: string;
  predicted_critical_at: string | null;
  severity: 'CRITICAL' | 'WARNING';
  timestamp: string;
}

export default function AlertBanner() {
  const [alerts, setAlerts] = useState<AlertPayload[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket('ws://localhost:8000/ws/feed');
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === 'road_hazard_alert') {
            setAlerts((prev) => [data as AlertPayload, ...prev].slice(0, 5));
            // Auto-dismiss after 12 seconds
            setTimeout(() => {
              setAlerts((prev) => prev.filter((a) => a.hazard_id !== data.hazard_id));
            }, 12000);
          }
        } catch (_) {}
      };

      ws.onclose = () => setTimeout(connect, 3000); // reconnect
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-80">
      {alerts.map((alert) => (
        <div
          key={`${alert.hazard_id}-${alert.timestamp}`}
          className={`rounded-xl border shadow-2xl p-4 animate-slide-in ${
            alert.severity === 'CRITICAL'
              ? 'bg-red-950 border-red-500 text-red-100'
              : 'bg-yellow-950 border-yellow-500 text-yellow-100'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{alert.severity === 'CRITICAL' ? '🚨' : '⚠️'}</span>
            <span className="font-bold text-sm uppercase tracking-wide">
              {alert.severity} Road Hazard
            </span>
          </div>
          <p className="text-xs opacity-90 mb-1">📍 {alert.location}</p>
          <p className="text-xs opacity-80">{alert.reason}</p>
          <div className="mt-2 flex justify-between items-center">
            <span className="text-xs opacity-60">
              RHS: {alert.road_health_score.toFixed(0)}/100
            </span>
            {alert.predicted_critical_at && (
              <span className="text-xs bg-red-800 px-2 py-0.5 rounded-full">
                Critical: {alert.predicted_critical_at}
              </span>
            )}
          </div>
          <button
            onClick={() =>
              setAlerts((prev) => prev.filter((a) => a.hazard_id !== alert.hazard_id))
            }
            className="absolute top-2 right-2 text-white opacity-50 hover:opacity-100 text-xs"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
