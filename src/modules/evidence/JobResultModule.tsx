"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlatform } from "@/context/PlatformContext";
import { ChevronLeftIcon, DownloadIcon, ChevronDownIcon, AlertIcon, PlayIcon } from "@/components/Icons";
import { SEVERITY_COLOR, VIOLATION_SEVERITY_BY_TYPE } from "@/lib/violations";
import {
  fetchJobResult,
  aggregateRecords,
  evidenceFileUrl,
  JobResult,
  PipelineRecord,
  StageAggregate,
} from "@/lib/evidence";

const TIER_LABEL: Record<number, string> = {
  1: "TIER 1 — AUTO CHALLAN",
  2: "TIER 2 — HUMAN REVIEW",
  3: "TIER 3 — LOGGED / DISCARDED",
};

const NOISE_PLATE_TEXTS = ["UNCLEAR", "PLATE-UNREAD", ""];

const componentStyles = `
  @keyframes pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 0.95; }
  }
  .skeleton-pulse {
    animation: pulse 1.8s infinite ease-in-out;
  }
  .custom-dropdown-item:hover {
    background-color: var(--bg-tertiary);
    color: var(--text-accent);
  }
  .spinner {
    border: 3px solid #e2e8f0;
    border-top: 3px solid var(--border-accent-dark);
    border-radius: 50%;
    width: 24px;
    height: 24px;
    animation: spin 1s linear infinite;
    margin: 0 auto;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

function RecordCard({ record, index }: { record: PipelineRecord; index: number }) {
  const [activeTab, setActiveTab] = useState<"annotated" | "demo" | "raw">("annotated");
  const paths = {
    annotated: record.evidence?.annotated_image,
    demo: record.evidence?.demo_image,
    raw: record.evidence?.raw_frame,
  };
  const path = paths[activeTab];
  const compliant = (record.violations || []).length === 0;
  const readablePlates = (record.all_plates_detected || []).filter(
    (p) => p.confidence > 0 && !NOISE_PLATE_TEXTS.includes(p.plate_text)
  );

  return (
    <div className="card" style={{ transform: "none" }}>
      <div className="card-title">
        <span>
          ITEM #{index + 1} — <span className="mono">{record.violation_id}</span>
        </span>
        <span className={`badge ${record.tier === 1 ? "approved" : record.tier === 2 ? "review" : "disabled"}`}>
          {TIER_LABEL[record.tier] || `TIER ${record.tier}`}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "10px" }}>
        <div className="evidence-pane" style={{ minHeight: "0" }}>
          <div className="evidence-stages">
            <div className={`stage-tab ${activeTab === "annotated" ? "active" : ""}`} onClick={() => setActiveTab("annotated")}>
              ANNOTATED
            </div>
            <div className={`stage-tab ${activeTab === "demo" ? "active" : ""}`} onClick={() => setActiveTab("demo")}>
              DEMO
            </div>
            <div className={`stage-tab ${activeTab === "raw" ? "active" : ""}`} onClick={() => setActiveTab("raw")}>
              RAW
            </div>
          </div>
          <div className="stage-viewer" style={{ minHeight: "220px" }}>
            {path ? (
              <img
                src={evidenceFileUrl(path)}
                alt={`${activeTab} evidence for ${record.violation_id}`}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
              />
            ) : (
              <div className="skeleton-pulse" style={{ width: "100%", height: "220px", backgroundColor: "#334155" }} />
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)" }}>Vehicle Class:</span>
            <span style={{ fontWeight: "600" }}>{record.vehicle?.vehicle_class || "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)" }}>Plate:</span>
            <span className="mono" style={{ fontWeight: "700" }}>
              {NOISE_PLATE_TEXTS.includes(record.vehicle?.license_plate || "") ? "Not Readable" : record.vehicle.license_plate}
            </span>
          </div>
          {!NOISE_PLATE_TEXTS.includes(record.vehicle?.license_plate || "") && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Plate Confidence:</span>
              <span className="mono">{Math.round((record.vehicle?.plate_confidence || 0) * 100)}%</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)" }}>Timestamp:</span>
            <span className="mono" style={{ fontSize: "10px" }}>{new Date(record.timestamp).toLocaleString()}</span>
          </div>

          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "6px" }}>
            <div style={{ fontWeight: "700", fontSize: "10px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
              Violations {compliant && <span style={{ color: "var(--success)" }}>— None (Compliant)</span>}
            </div>
            {record.violations.map((v, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", marginBottom: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ color: SEVERITY_COLOR[v.severity] || "var(--text-secondary)", fontWeight: "600" }}>{v.type}</span>
                  <span className="mono">{Math.round(v.confidence * 100)}%</span>
                </div>
                {v.plate_text && v.plate_text !== "UNCLEAR" && (
                  <span style={{ fontSize: "9px", color: "var(--success)", fontWeight: "600", marginTop: "1px" }}>
                    Associated Plate: {v.plate_text}
                  </span>
                )}
              </div>
            ))}
          </div>

          {readablePlates.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "6px" }}>
              <div style={{ fontWeight: "700", fontSize: "10px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
                All Plates In Frame ({readablePlates.length})
              </div>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {readablePlates.map((p, i) => (
                  <span key={i} className="mono" style={{ fontSize: "10px", border: "1px solid var(--border-color)", borderRadius: "4px", padding: "2px 5px" }}>
                    {p.plate_text} ({Math.round(p.confidence * 100)}%)
                  </span>
                ))}
              </div>
            </div>
          )}

          {record.driver_state?.alerts?.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "6px" }}>
              <div style={{ fontWeight: "700", fontSize: "10px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
                Driver State Alerts
              </div>
              {record.driver_state.alerts.map((a, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{a.alert_type.replace(/_/g, " ")}</span>
                  <span className="mono">{Math.round(a.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "6px", fontSize: "10px", color: "var(--text-muted)" }}>
            {record.processing?.model} · {record.processing?.inference_time_ms}ms · {record.processing?.vehicles_detected}V/{record.processing?.persons_detected}P
            {record.processing?.camera_calibrated && <span style={{ color: "var(--text-accent)" }}> · CALIBRATED</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StageCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ transform: "none", marginBottom: "8px" }}>
      <div className="card-title" style={{ marginBottom: "6px", paddingBottom: "4px" }}>
        <span>{title}</span>
      </div>
      <div style={{ fontSize: "11px", display: "flex", flexDirection: "column", gap: "4px" }}>{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontWeight: "600" }}>{value}</span>
    </div>
  );
}

function PipelineBreakdown({ agg, job }: { agg: StageAggregate; job: JobResult["job"] }) {
  return (
    <>
      <StageCard title="1. PREPROCESSOR">
        <Row label="Source Type" value={job.source_type} />
        <Row label="Items Processed" value={agg.itemCount} />
        <Row label="Job Duration" value={`${job.duration}s`} />
      </StageCard>

      <StageCard title="2. DETECTOR">
        <Row label="Model(s) Used" value={agg.modelsUsed.join(", ") || "—"} />
        <Row label="Total Vehicles Detected" value={agg.totalVehicles} />
        <Row label="Total Persons Detected" value={agg.totalPersons} />
        <Row label="Avg Inference Time" value={`${agg.itemCount ? Math.round(agg.totalInferenceMs / agg.itemCount) : 0}ms`} />
      </StageCard>

      <StageCard title="3. TRACKER">
        <Row label="Track-Based Detections Fired" value={agg.tracked ? "YES" : "NO (static fallback only)"} />
        <Row label="Calibrated Items" value={`${agg.calibratedCount} / ${agg.itemCount}`} />
      </StageCard>

      <StageCard title="4. VIOLATION CLASSIFIER (9 Checks)">
        {agg.violationsByType.length === 0 ? (
          <span style={{ color: "var(--success)" }}>No violations fired across any item.</span>
        ) : (
          agg.violationsByType.map((vt) => (
            <div key={vt.type} style={{ marginBottom: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: "700", color: SEVERITY_COLOR[VIOLATION_SEVERITY_BY_TYPE[vt.type]] }}>{vt.type}</span>
                <span className="mono">{vt.count}x</span>
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                {Object.entries(vt.methods).map(([m, c]) => `${m} (${c})`).join(", ")}
              </div>
            </div>
          ))
        )}
      </StageCard>

      <StageCard title="5. DRIVER STATE">
        {Object.keys(agg.driverAlertsByType).length === 0 ? (
          <span style={{ color: "var(--text-muted)" }}>No driver-state alerts.</span>
        ) : (
          Object.entries(agg.driverAlertsByType).map(([type, count]) => (
            <Row key={type} label={type.replace(/_/g, " ")} value={`${count}x`} />
          ))
        )}
      </StageCard>

      <StageCard title="6. OCR (PLATE RECOGNITION)">
        <Row label="OCR Engine(s)" value={agg.ocrEngine || "—"} />
        <Row label="Plates Read" value={agg.platesRead.length} />
        {agg.platesRead.slice(0, 8).map((p, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
            <span className="mono">{p.text}</span>
            <span>{Math.round(p.confidence * 100)}% {p.valid ? "✓" : "✕"}</span>
          </div>
        ))}
      </StageCard>

      <StageCard title="7. CONFIDENCE ROUTER">
        <Row label="Tier 1 (Auto-Challan)" value={agg.tierCounts.tier1} />
        <Row label="Tier 2 (Human Review)" value={agg.tierCounts.tier2} />
        <Row label="Tier 3 (Logged/Discarded)" value={agg.tierCounts.tier3} />
      </StageCard>

      <StageCard title="8. EVIDENCE PACKAGER">
        <Row label="Evidence Folder" value={<span className="mono" style={{ fontSize: "10px" }}>{agg.evidenceFolder || "—"}</span>} />
        <Row label="Files Generated" value={agg.fileCount} />
      </StageCard>
    </>
  );
}

function TimelineFrameDetail({
  record,
  incidentFrameIdx,
  focusedTimelineOffset,
  activeIncident,
  activeFrameTab,
  setActiveFrameTab,
}: {
  record: PipelineRecord;
  incidentFrameIdx: number;
  focusedTimelineOffset: number;
  activeIncident: any;
  activeFrameTab: "annotated" | "demo" | "raw";
  setActiveFrameTab: (t: "annotated" | "demo" | "raw") => void;
}) {
  const paths = {
    annotated: record.evidence?.annotated_image,
    demo: record.evidence?.demo_image,
    raw: record.evidence?.raw_frame,
  };
  const path = paths[activeFrameTab];
  const compliant = (record.violations || []).length === 0;
  const readablePlates = (record.all_plates_detected || []).filter(
    (p) => p.confidence > 0 && !NOISE_PLATE_TEXTS.includes(p.plate_text)
  );

  return (
    <div className="card" style={{ transform: "none", border: focusedTimelineOffset === 0 ? "2px solid var(--border-accent-dark)" : "1px solid var(--border-color)" }}>
      {/* Banner */}
      <div style={{
        padding: "8px 12px",
        borderRadius: "4px",
        marginBottom: "10px",
        fontSize: "11px",
        fontWeight: "700",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        backgroundColor: focusedTimelineOffset === 0 ? "var(--danger-bg)" : "var(--bg-tertiary)",
        color: focusedTimelineOffset === 0 ? "var(--danger)" : "var(--text-accent)",
        borderLeft: focusedTimelineOffset === 0 ? "4px solid var(--danger)" : "4px solid var(--border-accent-dark)"
      }}>
        <AlertIcon size={14} />
        {focusedTimelineOffset === 0 ? (
          <span>VIOLATION DETECTED FRAME — {activeIncident.type.toUpperCase()} ({Math.round(activeIncident.confidence * 100)}% CONFIDENCE)</span>
        ) : focusedTimelineOffset === -6 ? (
          <span>PRE-VIOLATION REFERENCE FRAME (1.0s BEFORE)</span>
        ) : (
          <span>POST-VIOLATION REFERENCE FRAME (1.0s AFTER)</span>
        )}
      </div>

      <div className="card-title" style={{ borderBottom: "none", paddingBottom: "0" }}>
        <span>
          TIMELINE VIEW — <span className="mono">{record.violation_id}</span>
        </span>
        <span className={`badge ${record.tier === 1 ? "approved" : record.tier === 2 ? "review" : "disabled"}`}>
          {TIER_LABEL[record.tier] || `TIER ${record.tier}`}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "10px", marginTop: "10px" }}>
        <div className="evidence-pane" style={{ minHeight: "0" }}>
          <div className="evidence-stages">
            <div className={`stage-tab ${activeFrameTab === "annotated" ? "active" : ""}`} onClick={() => setActiveFrameTab("annotated")}>
              ANNOTATED
            </div>
            <div className={`stage-tab ${activeFrameTab === "demo" ? "active" : ""}`} onClick={() => setActiveFrameTab("demo")}>
              DEMO
            </div>
            <div className={`stage-tab ${activeFrameTab === "raw" ? "active" : ""}`} onClick={() => setActiveFrameTab("raw")}>
              RAW
            </div>
          </div>
          <div className="stage-viewer" style={{ minHeight: "220px" }}>
            {path ? (
              <img
                src={evidenceFileUrl(path)}
                alt={`${activeFrameTab} evidence for ${record.violation_id}`}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
              />
            ) : (
              <div className="skeleton-pulse" style={{ width: "100%", height: "220px", backgroundColor: "#334155" }} />
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)" }}>Vehicle Class:</span>
            <span style={{ fontWeight: "600" }}>{record.vehicle?.vehicle_class || "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)" }}>Plate:</span>
            <span className="mono" style={{ fontWeight: "700" }}>
              {NOISE_PLATE_TEXTS.includes(record.vehicle?.license_plate || "") ? "Not Readable" : record.vehicle.license_plate}
            </span>
          </div>
          {!NOISE_PLATE_TEXTS.includes(record.vehicle?.license_plate || "") && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Plate Confidence:</span>
              <span className="mono">{Math.round((record.vehicle?.plate_confidence || 0) * 100)}%</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)" }}>Timestamp:</span>
            <span className="mono" style={{ fontSize: "10px" }}>{new Date(record.timestamp).toLocaleString()}</span>
          </div>

          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "6px" }}>
            <div style={{ fontWeight: "700", fontSize: "10px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
              Violations {compliant && <span style={{ color: "var(--success)" }}>— None (Compliant)</span>}
            </div>
            {record.violations.map((v, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", marginBottom: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ color: SEVERITY_COLOR[v.severity] || "var(--text-secondary)", fontWeight: "600" }}>{v.type}</span>
                  <span className="mono">{Math.round(v.confidence * 100)}%</span>
                </div>
                {v.plate_text && v.plate_text !== "UNCLEAR" && (
                  <span style={{ fontSize: "9px", color: "var(--success)", fontWeight: "600", marginTop: "1px" }}>
                    Associated Plate: {v.plate_text}
                  </span>
                )}
              </div>
            ))}
          </div>

          {readablePlates.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "6px" }}>
              <div style={{ fontWeight: "700", fontSize: "10px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
                All Plates In Frame ({readablePlates.length})
              </div>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {readablePlates.map((p, i) => (
                  <span key={i} className="mono" style={{ fontSize: "10px", border: "1px solid var(--border-color)", borderRadius: "4px", padding: "2px 5px" }}>
                    {p.plate_text} ({Math.round(p.confidence * 100)}%)
                  </span>
                ))}
              </div>
            </div>
          )}

          {record.driver_state?.alerts?.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "6px" }}>
              <div style={{ fontWeight: "700", fontSize: "10px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
                Driver State Alerts
              </div>
              {record.driver_state.alerts.map((a, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{a.alert_type.replace(/_/g, " ")}</span>
                  <span className="mono">{Math.round(a.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "6px", fontSize: "10px", color: "var(--text-muted)" }}>
            {record.processing?.model} · {record.processing?.inference_time_ms}ms · {record.processing?.vehicles_detected}V/{record.processing?.persons_detected}P
            {record.processing?.camera_calibrated && <span style={{ color: "var(--text-accent)" }}> · CALIBRATED</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function JobResultModule({ jobId }: { jobId: string }) {
  const { token } = usePlatform();
  const router = useRouter();
  const [result, setResult] = useState<JobResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Layout state
  const [selectedBatchIdx, setSelectedBatchIdx] = useState(0);
  const [selectedTrackId, setSelectedTrackId] = useState<string | number | null>(null);
  const [selectedIncidentIdx, setSelectedIncidentIdx] = useState(0);
  const [videoTab, setVideoTab] = useState<"demo" | "annotated" | "side-by-side">("demo");
  const [activeFrameTab, setActiveFrameTab] = useState<"annotated" | "demo" | "raw">("annotated");
  const [focusedTimelineOffset, setFocusedTimelineOffset] = useState<number>(0);
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timerId: NodeJS.Timeout | null = null;

    async function poll() {
      try {
        const r = await fetchJobResult(jobId, token);
        if (cancelled) return;
        setResult(r);
        setError(null);
        setLoading(false);

        // Keep polling if the job is still processing/queued
        if (r.job.status === "Processing" || r.job.status === "Queued") {
          timerId = setTimeout(poll, 3000);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load result.");
        setLoading(false);
        // Retry on error if not completed
        timerId = setTimeout(poll, 5000);
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [jobId, token]);

  const handleDownload = () => {
    if (!result) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 2));
    const a = document.createElement("a");
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `GARUDA_RESULT_${jobId}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (loading) {
    return <div style={{ padding: "60px", textAlign: "center", color: "var(--text-muted)" }}>Loading clubbed result…</div>;
  }
  if (error || !result) {
    return <div style={{ padding: "60px", textAlign: "center", color: "var(--danger)" }}>{error || "Job result not found."}</div>;
  }

  if (result.records.length === 0 && (result.job.status === "Processing" || result.job.status === "Queued")) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <style dangerouslySetInnerHTML={{ __html: componentStyles }} />
        {/* Header section skeleton */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <button className="btn btn-secondary btn-sm" onClick={() => router.push("/evidence")} style={{ marginBottom: "6px" }}>
              <ChevronLeftIcon size={12} /> BACK
            </button>
            <h1 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px" }}>{result.job.name}</h1>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginTop: "2px" }}>
              <span className="mono">{result.job.id}</span> · {result.job.source_type} · Processing...
            </p>
          </div>
        </div>

        {/* Dynamic ML Pipeline processing card */}
        <div className="card" style={{
          backgroundColor: "var(--bg-tertiary)",
          border: "1px solid var(--border-accent)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          transform: "none"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: "700", color: "var(--text-accent)", display: "flex", alignItems: "center", gap: "8px" }}>
              <div className="spinner" style={{ width: "14px", height: "14px", borderWidth: "2px", margin: "0" }}></div>
              RUNNING REAL ML INFERENCE PIPELINE
            </span>
            <span className="mono" style={{ fontWeight: "700" }}>{result.job.progress}% COMPLETE</span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
            Running object detection (YOLOv8), OCR extraction (EasyOCR/PaddleOCR), and Garuda traffic violation rules engine checks...
            {result.rendering_eta !== undefined && result.rendering_eta !== null && result.rendering_eta > 0 && (
              <span style={{ fontWeight: "700", marginLeft: "6px", color: "var(--warning)" }}>
                Estimated time remaining: {Math.ceil(result.rendering_eta)}s
              </span>
            )}
          </div>
          <div className="progress-bar-outer" style={{ height: "6px", backgroundColor: "#e2e8f0" }}>
            <div className="progress-bar-inner" style={{ width: `${result.job.progress}%`, backgroundColor: "var(--border-accent-dark)" }} />
          </div>
        </div>

        {/* Metrics breakdown skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="metric-card skeleton-pulse" style={{ height: "60px", backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)", padding: "10px" }}>
              <div style={{ width: "60px", height: "8px", backgroundColor: "var(--border-color)", marginBottom: "8px", borderRadius: "4px" }} />
              <div style={{ width: "30px", height: "16px", backgroundColor: "var(--border-color)", borderRadius: "4px" }} />
            </div>
          ))}
        </div>

        {/* Columns skeleton */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px", alignItems: "start" }}>
          {/* Left Column Skeletons */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="card skeleton-pulse" style={{ height: "110px", backgroundColor: "var(--bg-secondary)", transform: "none", padding: "12px" }}>
                <div style={{ width: "100px", height: "10px", backgroundColor: "var(--border-color)", marginBottom: "12px", borderRadius: "4px" }} />
                <div style={{ width: "180px", height: "8px", backgroundColor: "var(--border-color)", marginBottom: "8px", borderRadius: "4px" }} />
                <div style={{ width: "140px", height: "8px", backgroundColor: "var(--border-color)", borderRadius: "4px" }} />
              </div>
            ))}
          </div>

          {/* Right Column Skeletons */}
          <div className="card skeleton-pulse" style={{ height: "400px", backgroundColor: "var(--bg-secondary)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "12px", transform: "none" }}>
            <div className="spinner" style={{ width: "32px", height: "32px", borderWidth: "3px" }} />
            <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", letterSpacing: "0.2px" }}>
              WAITING FOR PIPELINE RESULTS JSON...
            </span>
          </div>
        </div>
      </div>
    );
  }

  const agg = aggregateRecords(result.records);
  const totalViolations = agg.violationsByType.reduce((sum, v) => sum + v.count, 0);

  const sourceType = (result.job.source_type || "").toLowerCase();
  const isTranscodingVideo = (result.job.status === "Processing" || result.job.status === "Queued") && !result.video_url;

  // Group all violations by vehicle trackId (for Video layout)
  interface ViolatingVehicle {
    trackId: string | number;
    licensePlate: string;
    vehicleClass: string;
    violations: Array<{
      type: string;
      confidence: number;
      severity: string;
      recordIndex: number;
      violation: any;
    }>;
  }

  const violatingVehicles: ViolatingVehicle[] = [];
  const violatingVehiclesMap: Record<string, ViolatingVehicle> = {};

  result.records.forEach((record, recordIndex) => {
    (record.violations || []).forEach((v) => {
      const trackId = v.track_id !== undefined && v.track_id !== null ? v.track_id : record.vehicle?.track_id;
      if (trackId === undefined || trackId === null) return;
      
      const plate = v.plate_text || record.vehicle?.license_plate || "UNCLEAR";
      const vehicleClass = record.vehicle?.vehicle_class || "unknown";
      
      const key = String(trackId);
      if (!violatingVehiclesMap[key]) {
        violatingVehiclesMap[key] = {
          trackId,
          licensePlate: plate,
          vehicleClass,
          violations: [],
        };
        violatingVehicles.push(violatingVehiclesMap[key]);
      }
      
      const isDup = violatingVehiclesMap[key].violations.some(
        (existing) => existing.recordIndex === recordIndex && existing.type === v.type
      );
      if (!isDup) {
        violatingVehiclesMap[key].violations.push({
          type: v.type,
          confidence: v.confidence,
          severity: v.severity,
          recordIndex,
          violation: v,
        });
      }
    });
  });

  // Default active vehicle selection
  const activeTrackId = selectedTrackId !== null ? selectedTrackId : (violatingVehicles[0]?.trackId || null);
  const selectedVehicle = violatingVehicles.find(v => String(v.trackId) === String(activeTrackId));
  const activeIncident = selectedVehicle?.violations[selectedIncidentIdx];

  // Selected frame calculation
  const incidentFrameIdx = activeIncident ? activeIncident.recordIndex : 0;
  const framePrevIdx = Math.max(0, incidentFrameIdx - 6);
  const frameCurrIdx = incidentFrameIdx;
  const frameNextIdx = Math.min(result.records.length - 1, incidentFrameIdx + 6);

  const recordPrev = result.records[framePrevIdx] || null;
  const recordCurr = result.records[frameCurrIdx] || null;
  const recordNext = result.records[frameNextIdx] || null;

  const focusedFrameIdx = focusedTimelineOffset === -6 ? framePrevIdx : focusedTimelineOffset === 6 ? frameNextIdx : frameCurrIdx;
  const focusedRecord = result.records[focusedFrameIdx] || null;

  // Custom styling block injected at the module level

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <style dangerouslySetInnerHTML={{ __html: componentStyles }} />

      {/* Header section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <button className="btn btn-secondary btn-sm" onClick={() => router.push("/evidence")} style={{ marginBottom: "6px" }}>
            <ChevronLeftIcon size={12} /> BACK
          </button>
          <h1 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px" }}>{result.job.name}</h1>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginTop: "2px" }}>
            <span className="mono">{result.job.id}</span> · {result.job.source_type} · Clubbed Result
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleDownload}>
          <DownloadIcon size={12} /> DOWNLOAD FULL RESULT
        </button>
      </div>

      {/* Rendering Status Bar (when transcoding is in progress) */}
      {(result.job.status === "Processing" || result.job.status === "Queued") && (
        <div className="card" style={{
          backgroundColor: "var(--bg-tertiary)",
          border: "1px solid var(--border-accent)",
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          transform: "none"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: "700", color: "var(--text-accent)", display: "flex", alignItems: "center", gap: "6px" }}>
              <div className="spinner" style={{ width: "12px", height: "12px", borderWidth: "2px", margin: "0" }}></div>
              RENDERING VIDEOS IN BACKGROUND
            </span>
            <span className="mono" style={{ fontWeight: "700" }}>{result.job.progress}% COMPLETE</span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
            Violation DB records have been successfully generated and can be analyzed below. The final annotated and demo videos are currently rendering and transcoding for browser playback.
            {result.rendering_eta !== undefined && result.rendering_eta !== null && result.rendering_eta > 0 && (
              <span style={{ fontWeight: "700", marginLeft: "6px", color: "var(--warning)" }}>
                Estimated time remaining: {Math.ceil(result.rendering_eta)}s
              </span>
            )}
          </div>
          <div className="progress-bar-outer" style={{ height: "4px", backgroundColor: "#e2e8f0" }}>
            <div className="progress-bar-inner" style={{ width: `${result.job.progress}%`, backgroundColor: "var(--border-accent-dark)" }} />
          </div>
        </div>
      )}

      {/* Metrics breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
        <div className="metric-card">
          <div className="metric-title">Items Processed</div>
          <div className="metric-value">{agg.itemCount}</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">Total Violations</div>
          <div className="metric-value">{totalViolations}</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">Auto-Challan (T1)</div>
          <div className="metric-value">{agg.tierCounts.tier1}</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">Human Review (T2)</div>
          <div className="metric-value">{agg.tierCounts.tier2}</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">Total Inference Time</div>
          <div className="metric-value">{agg.totalInferenceMs}ms</div>
        </div>
      </div>

      {/* Split Layout: PipelineBreakdown sidebar + main content panel */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px", alignItems: "start" }}>
        <div>
          <PipelineBreakdown agg={agg} job={result.job} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          
          {/* A. IMAGE LAYOUT */}
          {sourceType === "image" && (
            result.records.length === 0 ? (
              <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px" }}>
                No records in this job's result summary.
              </div>
            ) : (
              <RecordCard record={result.records[0]} index={0} />
            )
          )}

          {/* B. BATCH IMAGES LAYOUT */}
          {sourceType === "batch" && (
            result.records.length === 0 ? (
              <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px" }}>
                No records in this job's result summary.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px", alignItems: "start" }}>
                {/* Batch list sidebar menu */}
                <div className="card" style={{
                  padding: "8px",
                  maxHeight: "560px",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  transform: "none"
                }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-muted)", padding: "6px 8px", borderBottom: "1px solid var(--border-color)", textTransform: "uppercase" }}>
                    Batch Images ({result.records.length})
                  </div>
                  {result.records.map((r, idx) => {
                    const isSelected = selectedBatchIdx === idx;
                    const vCount = (r.violations || []).length;
                    const filename = r.camera?.location || `Image ${idx + 1}`;

                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedBatchIdx(idx)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          border: isSelected ? "1px solid var(--border-accent-dark)" : "1px solid var(--border-color)",
                          backgroundColor: isSelected ? "var(--bg-tertiary)" : "var(--bg-secondary)",
                          color: isSelected ? "var(--text-accent)" : "var(--text-primary)",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px"
                        }}
                        className={isSelected ? "" : "custom-dropdown-item"}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                          <span style={{ fontWeight: "600", fontSize: "11px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "150px" }}>
                            {filename}
                          </span>
                          <span className={`badge ${vCount === 0 ? "approved" : r.tier === 1 ? "approved" : "review"}`} style={{ fontSize: "9px", padding: "1px 4px" }}>
                            {vCount === 0 ? "PASS" : `T${r.tier}`}
                          </span>
                        </div>
                        <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>
                          {vCount === 0 ? "Compliant" : `${vCount} violation${vCount > 1 ? "s" : ""}`}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected batch image display */}
                <RecordCard record={result.records[selectedBatchIdx]} index={selectedBatchIdx} />
              </div>
            )
          )}

          {/* C. VIDEO LAYOUT */}
          {sourceType === "video" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
              
              {/* Video Player Section */}
              <div className="card" style={{ padding: "12px", transform: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }}>
                  <span style={{ fontWeight: "700", fontSize: "12px" }}>VIDEO PLAYBACK STREAMS</span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      className={`btn btn-sm ${videoTab === "demo" ? "btn-secondary" : ""}`}
                      style={{
                        fontSize: "10px",
                        padding: "4px 8px",
                        backgroundColor: videoTab === "demo" ? "var(--bg-tertiary)" : "transparent",
                        borderColor: videoTab === "demo" ? "var(--border-accent-dark)" : "var(--border-color)",
                        color: videoTab === "demo" ? "var(--text-accent)" : "var(--text-secondary)"
                      }}
                      onClick={() => setVideoTab("demo")}
                    >
                      DEMO STREAM
                    </button>
                    <button
                      className={`btn btn-sm ${videoTab === "annotated" ? "btn-secondary" : ""}`}
                      style={{
                        fontSize: "10px",
                        padding: "4px 8px",
                        backgroundColor: videoTab === "annotated" ? "var(--bg-tertiary)" : "transparent",
                        borderColor: videoTab === "annotated" ? "var(--border-accent-dark)" : "var(--border-color)",
                        color: videoTab === "annotated" ? "var(--text-accent)" : "var(--text-secondary)"
                      }}
                      onClick={() => setVideoTab("annotated")}
                    >
                      ANNOTATED EVIDENCE
                    </button>
                    <button
                      className={`btn btn-sm ${videoTab === "side-by-side" ? "btn-secondary" : ""}`}
                      style={{
                        fontSize: "10px",
                        padding: "4px 8px",
                        backgroundColor: videoTab === "side-by-side" ? "var(--bg-tertiary)" : "transparent",
                        borderColor: videoTab === "side-by-side" ? "var(--border-accent-dark)" : "var(--border-color)",
                        color: videoTab === "side-by-side" ? "var(--text-accent)" : "var(--text-secondary)"
                      }}
                      onClick={() => setVideoTab("side-by-side")}
                    >
                      SIDE-BY-SIDE
                    </button>
                  </div>
                </div>

                {isTranscodingVideo ? (
                  /* Video Loading Skeleton */
                  <div className="skeleton-pulse" style={{
                    height: "380px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#f8fafc",
                    border: "1px dashed var(--border-accent-dark)",
                    borderRadius: "6px",
                    gap: "8px",
                    color: "var(--text-secondary)"
                  }}>
                    <div className="spinner" />
                    <span style={{ fontWeight: "700", fontSize: "12px", marginTop: "6px", color: "var(--text-accent)" }}>TRANSCODING COMPATIBLE VIDEO STREAMS...</span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>This usually takes 20-40 seconds. All frame-by-frame evidence details are accessible below now.</span>
                  </div>
                ) : (
                  /* Live Video Viewports */
                  videoTab === "side-by-side" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "10px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase" }}>Demo Debug Video</span>
                        <video
                          src={result.demo_video_url ? evidenceFileUrl(result.demo_video_url) : ""}
                          controls
                          autoPlay
                          loop
                          muted
                          playsInline
                          style={{ width: "100%", maxHeight: "380px", background: "#000", borderRadius: "6px", border: "1px solid var(--border-color)" }}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase" }}>Annotated Evidence Video</span>
                        <video
                          src={result.video_url ? evidenceFileUrl(result.video_url) : ""}
                          controls
                          autoPlay
                          loop
                          muted
                          playsInline
                          style={{ width: "100%", maxHeight: "380px", background: "#000", borderRadius: "6px", border: "1px solid var(--border-color)" }}
                        />
                      </div>
                    </div>
                  ) : (
                    <video
                      src={videoTab === "demo" ? (result.demo_video_url ? evidenceFileUrl(result.demo_video_url) : "") : (result.video_url ? evidenceFileUrl(result.video_url) : "")}
                      controls
                      autoPlay
                      loop
                      muted
                      playsInline
                      key={videoTab}
                      style={{ width: "100%", maxHeight: "400px", background: "#000", borderRadius: "6px", border: "1px solid var(--border-color)" }}
                    />
                  )
                )}
              </div>

              {/* Violations Timeline Section */}
              {result.records.length === 0 ? (
                <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px" }}>
                  No violation incidents generated.
                </div>
              ) : violatingVehicles.length === 0 ? (
                <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px" }}>
                  No violating vehicles tracked in this video run.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  
                  {/* Dropdown of violating vehicles */}
                  <div style={{ position: "relative" }}>
                    <div style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>
                      Select Violating Vehicle
                    </div>
                    <button
                      onClick={() => setVehicleDropdownOpen(!vehicleDropdownOpen)}
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-accent-dark)",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontWeight: "600",
                        color: "var(--text-accent)",
                        fontSize: "12px",
                        textAlign: "left"
                      }}
                    >
                      {selectedVehicle ? (
                        <span>
                          Track #{selectedVehicle.trackId} — Plate: <strong className="mono" style={{ letterSpacing: "0.2px" }}>{selectedVehicle.licensePlate}</strong> · Class: {selectedVehicle.vehicleClass.toUpperCase()} · Violations: {Array.from(new Set(selectedVehicle.violations.map(v => v.type))).join(" + ")}
                        </span>
                      ) : (
                        <span>Select a vehicle...</span>
                      )}
                      <ChevronDownIcon size={16} style={{ transition: "transform 0.2s", transform: vehicleDropdownOpen ? "rotate(180deg)" : "none" }} />
                    </button>

                    {vehicleDropdownOpen && (
                      <div style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        zIndex: 50,
                        marginTop: "4px",
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "6px",
                        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                        maxHeight: "260px",
                        overflowY: "auto"
                      }}>
                        {violatingVehicles.map((veh) => (
                          <div
                            key={veh.trackId}
                            className="custom-dropdown-item"
                            onClick={() => {
                              setSelectedTrackId(veh.trackId);
                              setSelectedIncidentIdx(0);
                              setFocusedTimelineOffset(0);
                              setVehicleDropdownOpen(false);
                            }}
                            style={{
                              padding: "10px 14px",
                              borderBottom: "1px solid var(--border-color)",
                              cursor: "pointer",
                              fontSize: "11px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              backgroundColor: String(veh.trackId) === String(activeTrackId) ? "var(--bg-tertiary)" : "transparent"
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: "700", color: "var(--text-accent)" }}>Track #{veh.trackId}</span>
                              <span style={{ margin: "0 8px", color: "var(--text-muted)" }}>·</span>
                              <span className="mono" style={{ fontWeight: "700" }}>{veh.licensePlate}</span>
                              <span style={{ margin: "0 8px", color: "var(--text-muted)" }}>·</span>
                              <span style={{ textTransform: "uppercase" }}>{veh.vehicleClass}</span>
                            </div>
                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <span className="badge review" style={{ fontSize: "9px" }}>
                                {veh.violations.length} occurrence{veh.violations.length > 1 ? "s" : ""}
                              </span>
                              <span style={{ fontSize: "10px", fontWeight: "600", color: "var(--danger)" }}>
                                {Array.from(new Set(veh.violations.map(v => v.type))).join(" + ")}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Incident occurrence tabs if the vehicle has multiple violations */}
                  {selectedVehicle && selectedVehicle.violations.length > 1 && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                      <span style={{ fontSize: "10px", alignSelf: "center", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase", marginRight: "6px" }}>
                        Select Violation Incident
                      </span>
                      {selectedVehicle.violations.map((v, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setSelectedIncidentIdx(index);
                            setFocusedTimelineOffset(0);
                          }}
                          style={{
                            padding: "4px 8px",
                            fontSize: "10px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            border: selectedIncidentIdx === index ? "1px solid var(--border-accent-dark)" : "1px solid var(--border-color)",
                            backgroundColor: selectedIncidentIdx === index ? "var(--bg-tertiary)" : "var(--bg-secondary)",
                            color: selectedIncidentIdx === index ? "var(--text-accent)" : "var(--text-secondary)",
                            fontWeight: selectedIncidentIdx === index ? "700" : "500"
                          }}
                        >
                          {v.type} (Frame #{v.recordIndex})
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 3-Frame Timeline Slider */}
                  {selectedVehicle && activeIncident && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                      
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase" }}>
                          Violation Timeline Sequence (-1.0s, Incident, +1.0s)
                        </div>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "10px" }}>
                          {/* -1.0 Second Frame Card */}
                          <div
                            onClick={() => setFocusedTimelineOffset(-6)}
                            style={{
                              border: focusedTimelineOffset === -6 ? "2px solid var(--border-accent-dark)" : "1px solid var(--border-color)",
                              backgroundColor: focusedTimelineOffset === -6 ? "var(--bg-tertiary)" : "var(--bg-secondary)",
                              borderRadius: "6px",
                              padding: "8px",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              textAlign: "center"
                            }}
                          >
                            <div style={{ fontSize: "9px", fontWeight: "700", color: focusedTimelineOffset === -6 ? "var(--text-accent)" : "var(--text-muted)", marginBottom: "4px" }}>
                              BEFORE (-1.0s)
                            </div>
                            <div style={{ height: "90px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                              {recordPrev?.evidence?.annotated_image ? (
                                <img src={evidenceFileUrl(recordPrev.evidence.annotated_image)} alt="Before" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                <div className="skeleton-pulse" style={{ width: "100%", height: "100%", backgroundColor: "var(--border-color)" }} />
                              )}
                            </div>
                            <div style={{ fontSize: "8px", marginTop: "4px", color: "var(--text-muted)" }} className="mono">
                              Frame #{framePrevIdx}
                            </div>
                          </div>

                          {/* Incident Frame Card */}
                          <div
                            onClick={() => setFocusedTimelineOffset(0)}
                            style={{
                              border: focusedTimelineOffset === 0 ? "2px solid var(--danger)" : "1px solid var(--border-color)",
                              backgroundColor: focusedTimelineOffset === 0 ? "var(--danger-bg)" : "var(--bg-secondary)",
                              borderRadius: "6px",
                              padding: "8px",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              textAlign: "center"
                            }}
                          >
                            <div style={{ fontSize: "9px", fontWeight: "700", color: focusedTimelineOffset === 0 ? "var(--danger)" : "var(--text-muted)", marginBottom: "4px" }}>
                              INCIDENT (0.0s)
                            </div>
                            <div style={{ height: "90px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                              {recordCurr?.evidence?.annotated_image ? (
                                <img src={evidenceFileUrl(recordCurr.evidence.annotated_image)} alt="Incident" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                <div className="skeleton-pulse" style={{ width: "100%", height: "100%", backgroundColor: "var(--border-color)" }} />
                              )}
                            </div>
                            <div style={{ fontSize: "8px", marginTop: "4px", color: "var(--text-muted)" }} className="mono">
                              Frame #{frameCurrIdx}
                            </div>
                          </div>

                          {/* +1.0 Second Frame Card */}
                          <div
                            onClick={() => setFocusedTimelineOffset(6)}
                            style={{
                              border: focusedTimelineOffset === 6 ? "2px solid var(--border-accent-dark)" : "1px solid var(--border-color)",
                              backgroundColor: focusedTimelineOffset === 6 ? "var(--bg-tertiary)" : "var(--bg-secondary)",
                              borderRadius: "6px",
                              padding: "8px",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              textAlign: "center"
                            }}
                          >
                            <div style={{ fontSize: "9px", fontWeight: "700", color: focusedTimelineOffset === 6 ? "var(--text-accent)" : "var(--text-muted)", marginBottom: "4px" }}>
                              AFTER (+1.0s)
                            </div>
                            <div style={{ height: "90px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                              {recordNext?.evidence?.annotated_image ? (
                                <img src={evidenceFileUrl(recordNext.evidence.annotated_image)} alt="After" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                <div className="skeleton-pulse" style={{ width: "100%", height: "100%", backgroundColor: "var(--border-color)" }} />
                              )}
                            </div>
                            <div style={{ fontSize: "8px", marginTop: "4px", color: "var(--text-muted)" }} className="mono">
                              Frame #{frameNextIdx}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Focused Frame Viewer */}
                      {focusedRecord ? (
                        <TimelineFrameDetail
                          record={focusedRecord}
                          incidentFrameIdx={incidentFrameIdx}
                          focusedTimelineOffset={focusedTimelineOffset}
                          activeIncident={activeIncident}
                          activeFrameTab={activeFrameTab}
                          setActiveFrameTab={setActiveFrameTab}
                        />
                      ) : (
                        <div className="card" style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                          No frame data available.
                        </div>
                      )}

                    </div>
                  )}

                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
