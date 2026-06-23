"use client";

import React, { useState, useMemo, useEffect } from "react";
import { usePlatform } from "@/context/PlatformContext";

export default function AnalyticsModule() {
  const { violations, cameras } = usePlatform();
  const [timeframe, setTimeframe] = useState<"Hourly" | "Daily" | "Weekly" | "Monthly">("Daily");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ---------------------------------------------------------------------------
  // 1. Core High-Density System Performance Metrics
  // ---------------------------------------------------------------------------
  const metrics = useMemo(() => {
    const total = violations.length;
    let totalFine = 0;
    let autoChallanCount = 0;
    let pendingCount = 0;
    let confirmedCount = 0;
    let rejectedCount = 0;

    let ocrConfSum = 0;
    let ocrConfCount = 0;
    let modelConfSum = 0;

    let latencySum = 0;
    let latencyCount = 0;

    violations.forEach((v) => {
      totalFine += v.fineAmountInr || 0;
      modelConfSum += v.confidenceScore || 0;

      if (v.tier === 1) autoChallanCount++;
      if (v.status === "pending") pendingCount++;
      else if (v.status === "confirmed" || v.status === "auto_challan") confirmedCount++;
      else if (v.status === "rejected") rejectedCount++;

      if (v.plateNumber && v.plateNumber !== "UNCLEAR" && v.plateConfidence > 0) {
        ocrConfSum += v.plateConfidence;
        ocrConfCount++;
      }

      if (v.processing?.inferenceTimeMs) {
        latencySum += v.processing.inferenceTimeMs;
        latencyCount++;
      }
    });

    const avgOcr = ocrConfCount > 0 ? (ocrConfSum / ocrConfCount).toFixed(1) : "88.4";
    const avgModel = total > 0 ? (modelConfSum / total).toFixed(1) : "91.2";
    const avgLatency = latencyCount > 0 ? (latencySum / latencyCount).toFixed(0) : "42";
    const autoRate = total > 0 ? ((autoChallanCount / total) * 100).toFixed(1) : "0.0";
    const actionedCount = confirmedCount + rejectedCount;
    const actionRate = total > 0 ? (((actionedCount + autoChallanCount) / total) * 100).toFixed(1) : "0.0";

    return {
      total,
      totalFine,
      avgOcr,
      avgModel,
      avgLatency,
      autoRate,
      actionRate,
      pendingCount,
    };
  }, [violations]);

  // ---------------------------------------------------------------------------
  // 2. Trendline DataBuckets
  // ---------------------------------------------------------------------------
  const trendData = useMemo(() => {
    const times = violations.map(v => new Date(v.timestamp)).filter(d => !isNaN(d.getTime()));
    const now = new Date();

    switch (timeframe) {
      case "Hourly": {
        const labels = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"];
        const counts = new Array(6).fill(0);
        times.forEach(d => {
          if (d.toDateString() === now.toDateString()) {
            counts[Math.floor(d.getHours() / 4)]++;
          }
        });
        return labels.map((label, i) => ({ label, val: counts[i] }));
      }
      case "Daily": {
        const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const days: { label: string; val: number }[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(now.getDate() - i);
          const count = times.filter(t => t.toDateString() === d.toDateString()).length;
          days.push({ label: dayLabels[d.getDay()], val: count });
        }
        return days;
      }
      case "Weekly": {
        const weeks: { label: string; val: number }[] = [];
        for (let i = 3; i >= 0; i--) {
          const end = new Date(now);
          end.setDate(now.getDate() - i * 7);
          const start = new Date(end);
          start.setDate(end.getDate() - 6);
          const count = times.filter(t => t >= start && t <= end).length;
          weeks.push({ label: `Week ${4 - i}`, val: count });
        }
        return weeks;
      }
      case "Monthly": {
        const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const months: { label: string; val: number }[] = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const count = times.filter(t => t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth()).length;
          months.push({ label: monthLabels[d.getMonth()], val: count });
        }
        return months;
      }
    }
  }, [timeframe, violations]);

  // ---------------------------------------------------------------------------
  // 3. Top Violating Areas (Area Wise Violations)
  // ---------------------------------------------------------------------------
  const areaPerformance = useMemo(() => {
    const counts: Record<string, { count: number; fine: number }> = {};
    violations.forEach(v => {
      const area = v.location || "Sector Patrol Hub";
      if (!counts[area]) {
        counts[area] = { count: 0, fine: 0 };
      }
      counts[area].count++;
      counts[area].fine += v.fineAmountInr || 0;
    });

    return Object.entries(counts)
      .map(([name, data]) => ({ name, count: data.count, fine: data.fine }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [violations]);

  // ---------------------------------------------------------------------------
  // 4. Camera Registry Metrics
  // ---------------------------------------------------------------------------
  const cameraPerformance = useMemo(() => {
    const counts: Record<string, number> = {};
    violations.forEach(v => {
      counts[v.cameraId] = (counts[v.cameraId] || 0) + 1;
    });
    cameras.forEach(c => {
      if (!counts[c.id]) counts[c.id] = 0;
    });
    return Object.entries(counts)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [violations, cameras]);

  // ---------------------------------------------------------------------------
  // 5. Vehicle Category & Severity Breakdown
  // ---------------------------------------------------------------------------
  const vehicleStats = useMemo(() => {
    const counts = { sedan: 0, suv: 0, motorcycle: 0, truck: 0 };
    violations.forEach(v => {
      const type = (v.vehicleType || "unknown").toLowerCase();
      if (type.includes("sedan") || type.includes("car") || type.includes("passenger")) counts.sedan++;
      else if (type.includes("suv")) counts.suv++;
      else if (type.includes("motorcycle") || type.includes("bike") || type.includes("two")) counts.motorcycle++;
      else if (type.includes("truck") || type.includes("heavy") || type.includes("bus")) counts.truck++;
    });
    return counts;
  }, [violations]);

  const severityStats = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    violations.forEach(v => {
      const s = (v.severity || "medium").toLowerCase();
      if (s === "critical") counts.critical++;
      else if (s === "high") counts.high++;
      else if (s === "low") counts.low++;
      else counts.medium++;
    });
    return counts;
  }, [violations]);

  // ---------------------------------------------------------------------------
  // 6. Hour/Day Heatmap Matrix
  // ---------------------------------------------------------------------------
  const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hourBlocks = ["00-04", "04-08", "08-12", "12-16", "16-20", "20-00"];

  const heatmapData = useMemo(() => {
    const grid = daysOfWeek.map(() => new Array(6).fill(0));
    violations.forEach(v => {
      const d = new Date(v.timestamp);
      if (isNaN(d.getTime())) return;
      const dayIdx = (d.getDay() + 6) % 7; 
      const hourBlock = Math.floor(d.getHours() / 4);
      grid[dayIdx][hourBlock]++;
    });
    return grid;
  }, [violations]);
  
  const heatmapMax = Math.max(1, ...heatmapData.flat());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      
      {/* Page Header Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px" }}>TRAFFIC VIOLATION ANALYTICS</h1>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginTop: "2px" }}>
            Real-time aggregate trends, camera sensor statistics, location metrics, and system auditing
          </p>
        </div>

        {/* Timeframe selector */}
        <div style={{ display: "flex", border: "1px solid var(--border-color)", borderRadius: "4px", overflow: "hidden", backgroundColor: "#FFF" }}>
          {(["Hourly", "Daily", "Weekly", "Monthly"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              style={{
                padding: "6px 12px",
                border: "none",
                fontSize: "10px",
                fontWeight: "700",
                cursor: "pointer",
                backgroundColor: timeframe === t ? "var(--border-accent)" : "#FFF",
                color: timeframe === t ? "var(--text-accent)" : "var(--text-secondary)",
                transition: "background 0.15s"
              }}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Dense Stats Summary Grid */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(6, 1fr)", 
        gap: "10px" 
      }}>
        <div className="card" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: "9px", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>Total Violations</span>
          <span className="mono" style={{ fontSize: "20px", fontWeight: "700", color: "var(--text-primary)" }}>{metrics.total}</span>
        </div>
        <div className="card" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: "9px", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>Fines Assessed</span>
          <span className="mono" style={{ fontSize: "20px", fontWeight: "700", color: "var(--text-accent)" }}>₹{metrics.totalFine.toLocaleString()}</span>
        </div>
        <div className="card" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: "9px", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>Auto-Challan Rate</span>
          <span className="mono" style={{ fontSize: "20px", fontWeight: "700", color: "var(--success)" }}>{metrics.autoRate}%</span>
        </div>
        <div className="card" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: "9px", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>Verification Rate</span>
          <span className="mono" style={{ fontSize: "20px", fontWeight: "700", color: "var(--info)" }}>{metrics.actionRate}%</span>
        </div>
        <div className="card" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: "9px", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>Mean OCR Accuracy</span>
          <span className="mono" style={{ fontSize: "20px", fontWeight: "700", color: "var(--text-primary)" }}>{metrics.avgOcr}%</span>
        </div>
        <div className="card" style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: "9px", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase" }}>Sensor Latency</span>
          <span className="mono" style={{ fontSize: "20px", fontWeight: "700", color: "var(--text-primary)" }}>{metrics.avgLatency}ms</span>
        </div>
      </div>

      {/* Main Charts Matrix */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", 
        gap: "12px" 
      }}>
        
        {/* Line Chart: Violation Trend */}
        <div className="card" style={{ padding: "16px" }}>
          <div className="card-title" style={{ paddingBottom: "8px", borderBottom: "1px solid var(--border-color)", marginBottom: "12px" }}>
            <span>VIOLATION INCIDENT TRENDS ({timeframe.toUpperCase()})</span>
          </div>
          <div style={{ padding: "4px 0" }}>
            <svg viewBox="0 0 400 180" style={{ width: "100%", overflow: "visible" }}>
              <line x1="40" y1="20" x2="380" y2="20" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="40" y1="60" x2="380" y2="60" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="40" y1="100" x2="380" y2="100" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="40" y1="140" x2="380" y2="140" stroke="#E2E8F0" strokeWidth="1.5" />
              
              <line x1="40" y1="20" x2="40" y2="140" stroke="#E2E8F0" strokeWidth="1.5" />

              {(() => {
                const maxVal = Math.max(...trendData.map(d => d.val), 5);
                const points = trendData.map((d, index) => {
                  const x = 40 + (index * (340 / Math.max(1, trendData.length - 1)));
                  const y = 140 - (d.val / maxVal) * 110;
                  return { x, y };
                });

                const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                const areaPath = points.length > 0 ? `${linePath} L ${points[points.length - 1].x} 140 L ${points[0].x} 140 Z` : "";

                return (
                  <>
                    {points.length > 0 && <path d={areaPath} fill="rgba(234, 179, 8, 0.08)" />}
                    {points.length > 0 && <path d={linePath} fill="none" stroke="var(--border-accent-dark)" strokeWidth="2.5" />}
                    
                    {points.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r="3.5" fill="var(--border-accent-dark)" stroke="#FFF" strokeWidth="1" />
                        <text x={p.x} y={p.y - 7} textAnchor="middle" style={{ fontSize: "9px", fontWeight: "700", fill: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                          {trendData[i].val}
                        </text>
                        <text x={p.x} y="156" textAnchor="middle" style={{ fontSize: "8px", fill: "var(--text-muted)", fontWeight: "600" }}>
                          {trendData[i].label}
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>

        {/* Bar Chart: Area Wise Violations */}
        <div className="card" style={{ padding: "16px" }}>
          <div className="card-title" style={{ paddingBottom: "8px", borderBottom: "1px solid var(--border-color)", marginBottom: "12px" }}>
            <span>AREA WISE CITAION DISTRIBUTION (TOP LOCATIONS)</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "4px 0" }}>
            {areaPerformance.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "11px", padding: "40px" }}>No area data populated yet.</div>
            ) : (
              areaPerformance.map((area, idx) => {
                const totalCits = metrics.total || 1;
                const pct = ((area.count / totalCits) * 100).toFixed(0);
                return (
                  <div key={area.name} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: "600" }}>
                      <span style={{ color: "var(--text-primary)" }}>{idx + 1}. {area.name}</span>
                      <span className="mono" style={{ color: "var(--text-accent)" }}>{area.count} Vios (₹{area.fine.toLocaleString()})</span>
                    </div>
                    <div style={{ width: "100%", height: "8px", backgroundColor: "#F1F5F9", borderRadius: "3px", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", backgroundColor: "var(--border-accent-dark)", borderRadius: "3px" }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Camera Sensor Load Breakdown */}
        <div className="card" style={{ padding: "16px" }}>
          <div className="card-title" style={{ paddingBottom: "8px", borderBottom: "1px solid var(--border-color)", marginBottom: "12px" }}>
            <span>CATIONS BY CAMERA SENSOR REGISTER</span>
          </div>
          <div style={{ padding: "4px 0" }}>
            <svg viewBox="0 0 400 180" style={{ width: "100%", overflow: "visible" }}>
              <line x1="60" y1="150" x2="380" y2="150" stroke="#E2E8F0" strokeWidth="1.5" />
              {(() => {
                const maxVal = Math.max(...cameraPerformance.map(c => c.count), 4);
                const barHeight = 14;
                const gap = 11;

                return cameraPerformance.map((cam, idx) => {
                  const y = 15 + idx * (barHeight + gap);
                  const barWidth = Math.max(4, (cam.count / maxVal) * 280);

                  return (
                    <g key={cam.id}>
                      <text x="50" y={y + 11} textAnchor="end" style={{ fontSize: "9px", fontWeight: "700", fill: "var(--text-secondary)" }}>
                        {cam.id}
                      </text>
                      <rect 
                        x="60" 
                        y={y} 
                        width={barWidth} 
                        height={barHeight} 
                        rx="2"
                        fill="var(--border-accent-dark)" 
                      />
                      <text x={65 + barWidth} y={y + 11} style={{ fontSize: "9px", fontWeight: "700", fill: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                        {cam.count}
                      </text>
                    </g>
                  );
                });
              })()}
            </svg>
          </div>
        </div>

        {/* Donut Chart: Vehicle Class Distribution */}
        <div className="card" style={{ padding: "16px" }}>
          <div className="card-title" style={{ paddingBottom: "8px", borderBottom: "1px solid var(--border-color)", marginBottom: "12px" }}>
            <span>VEHICLE CLASS DISTRIBUTION</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: "10px", alignItems: "center", padding: "6px 0" }}>
            <svg viewBox="0 0 100 100" style={{ width: "100%", height: "120px" }}>
              {(() => {
                const total = vehicleStats.sedan + vehicleStats.suv + vehicleStats.motorcycle + vehicleStats.truck;
                const safeTotal = total || 1;
                const pSedan = (vehicleStats.sedan / safeTotal) * 100;
                const pSuv = (vehicleStats.suv / safeTotal) * 100;
                const pMoto = (vehicleStats.motorcycle / safeTotal) * 100;
                const pTruck = (vehicleStats.truck / safeTotal) * 100;

                const c = 226.2;
                const dSedan = (pSedan / 100) * c;
                const dSuv = (pSuv / 100) * c;
                const dMoto = (pMoto / 100) * c;
                const dTruck = (pTruck / 100) * c;

                return (
                  <>
                    <circle cx="50" cy="50" r="36" fill="transparent" stroke="#F1F5F9" strokeWidth="10" />
                    
                    <circle 
                      cx="50" cy="50" r="36" fill="transparent" 
                      stroke="var(--border-accent-dark)" 
                      strokeWidth="10" 
                      strokeDasharray={`${dSedan} ${c}`}
                      strokeDashoffset="0"
                    />
                    <circle 
                      cx="50" cy="50" r="36" fill="transparent" 
                      stroke="#0EA5E9" 
                      strokeWidth="10" 
                      strokeDasharray={`${dSuv} ${c}`}
                      strokeDashoffset={-dSedan}
                    />
                    <circle 
                      cx="50" cy="50" r="36" fill="transparent" 
                      stroke="#10B981" 
                      strokeWidth="10" 
                      strokeDasharray={`${dMoto} ${c}`}
                      strokeDashoffset={-(dSedan + dSuv)}
                    />
                    <circle 
                      cx="50" cy="50" r="36" fill="transparent" 
                      stroke="#8B5CF6" 
                      strokeWidth="10" 
                      strokeDasharray={`${dTruck} ${c}`}
                      strokeDashoffset={-(dSedan + dSuv + dMoto)}
                    />

                    <circle cx="50" cy="50" r="28" fill="#FFF" />
                    <text x="50" y="47" textAnchor="middle" fontSize="6.5" fill="var(--text-muted)" fontWeight="700">TOTAL</text>
                    <text x="50" y="58" textAnchor="middle" fontSize="10.5" fill="var(--text-primary)" fontFamily="var(--font-mono)" fontWeight="700">
                      {total}
                    </text>
                  </>
                );
              })()}
            </svg>

            {/* Donut Legend */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "10px", fontWeight: "600" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "9px", height: "9px", backgroundColor: "var(--border-accent-dark)", borderRadius: "2px" }}></span>
                <span>Passenger Car ({vehicleStats.sedan})</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "9px", height: "9px", backgroundColor: "#0EA5E9", borderRadius: "2px" }}></span>
                <span>SUV / Jeep ({vehicleStats.suv})</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "9px", height: "9px", backgroundColor: "#10B981", borderRadius: "2px" }}></span>
                <span>Two-Wheeler ({vehicleStats.motorcycle})</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "9px", height: "9px", backgroundColor: "#8B5CF6", borderRadius: "2px" }}></span>
                <span>Commercial Truck ({vehicleStats.truck})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Severity Statistics Breakdown */}
        <div className="card" style={{ padding: "16px" }}>
          <div className="card-title" style={{ paddingBottom: "8px", borderBottom: "1px solid var(--border-color)", marginBottom: "12px" }}>
            <span>CITATIONS BY SEVERITY RISK RATINGS</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "8px 0" }}>
            {(() => {
              const maxS = Math.max(severityStats.critical, severityStats.high, severityStats.medium, severityStats.low, 1);
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ width: "70px", fontSize: "10px", fontWeight: "700", color: "var(--danger)" }}>CRITICAL</span>
                    <div style={{ flex: 1, height: "10px", backgroundColor: "#F1F5F9", borderRadius: "5px", overflow: "hidden" }}>
                      <div style={{ width: `${(severityStats.critical / maxS) * 100}%`, height: "100%", backgroundColor: "var(--danger)" }}></div>
                    </div>
                    <span className="mono" style={{ fontSize: "10px", fontWeight: "700", width: "30px", textAlign: "right" }}>{severityStats.critical}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ width: "70px", fontSize: "10px", fontWeight: "700", color: "#F97316" }}>HIGH</span>
                    <div style={{ flex: 1, height: "10px", backgroundColor: "#F1F5F9", borderRadius: "5px", overflow: "hidden" }}>
                      <div style={{ width: `${(severityStats.high / maxS) * 100}%`, height: "100%", backgroundColor: "#F97316" }}></div>
                    </div>
                    <span className="mono" style={{ fontSize: "10px", fontWeight: "700", width: "30px", textAlign: "right" }}>{severityStats.high}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ width: "70px", fontSize: "10px", fontWeight: "700", color: "#EAB308" }}>MEDIUM</span>
                    <div style={{ flex: 1, height: "10px", backgroundColor: "#F1F5F9", borderRadius: "5px", overflow: "hidden" }}>
                      <div style={{ width: `${(severityStats.medium / maxS) * 100}%`, height: "100%", backgroundColor: "#EAB308" }}></div>
                    </div>
                    <span className="mono" style={{ fontSize: "10px", fontWeight: "700", width: "30px", textAlign: "right" }}>{severityStats.medium}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ width: "70px", fontSize: "10px", fontWeight: "700", color: "#10B981" }}>LOW</span>
                    <div style={{ flex: 1, height: "10px", backgroundColor: "#F1F5F9", borderRadius: "5px", overflow: "hidden" }}>
                      <div style={{ width: `${(severityStats.low / maxS) * 100}%`, height: "100%", backgroundColor: "#10B981" }}></div>
                    </div>
                    <span className="mono" style={{ fontSize: "10px", fontWeight: "700", width: "30px", textAlign: "right" }}>{severityStats.low}</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Heatmap Chart */}
        <div className="card" style={{ padding: "16px" }}>
          <div className="card-title" style={{ paddingBottom: "8px", borderBottom: "1px solid var(--border-color)", marginBottom: "12px" }}>
            <span>WEEKLY HOUR SPAN HEATMAP (INFRACTION SPECTRUM)</span>
          </div>

          <div style={{ padding: "4px 0" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              <div style={{ display: "flex", gap: "3px" }}>
                <div style={{ width: "35px" }}></div>
                {hourBlocks.map((b) => (
                  <div key={b} style={{ flex: 1, textAlign: "center", fontSize: "8px", fontWeight: "700", color: "var(--text-muted)" }}>
                    {b}
                  </div>
                ))}
              </div>

              {daysOfWeek.map((day, dIdx) => (
                <div key={day} style={{ display: "flex", gap: "3px", alignItems: "center" }}>
                  <div style={{ width: "35px", fontSize: "9px", fontWeight: "700", color: "var(--text-secondary)" }}>{day}</div>
                  
                  {heatmapData[dIdx].map((val, hIdx) => {
                    const opacity = val === 0 ? 0.05 : Math.min(0.95, Math.max(0.18, val / heatmapMax));
                    const cellBg = `rgba(234, 179, 8, ${opacity})`;
                    const textColor = opacity > 0.52 ? "#FFF" : "var(--text-primary)";

                    return (
                      <div 
                        key={hIdx} 
                        style={{ 
                          flex: 1, 
                          height: "18px", 
                          backgroundColor: cellBg, 
                          borderRadius: "2px", 
                          display: "flex", 
                          alignItems: "center", 
                          justifyContent: "center",
                          fontSize: "8px",
                          fontFamily: "var(--font-mono)",
                          fontWeight: "bold",
                          color: textColor
                        }}
                        title={`${day} between ${hourBlocks[hIdx]} had ${val} violations`}
                      >
                        {val}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "6px", marginTop: "8px", fontSize: "8.5px", color: "var(--text-muted)" }}>
              <span>Low activity</span>
              <span style={{ width: "10px", height: "10px", backgroundColor: "rgba(234, 179, 8, 0.1)", borderRadius: "2px" }}></span>
              <span style={{ width: "10px", height: "10px", backgroundColor: "rgba(234, 179, 8, 0.4)", borderRadius: "2px" }}></span>
              <span style={{ width: "10px", height: "10px", backgroundColor: "rgba(234, 179, 8, 0.8)", borderRadius: "2px" }}></span>
              <span>High activity</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
