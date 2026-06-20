"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { usePlatform, Violation, ViolationStatus, EvidenceFrame } from "@/context/PlatformContext";
import { ShieldIcon, CheckIcon, CloseIcon, DownloadIcon, AlertIcon } from "@/components/Icons";

export default function ReviewModule() {
  const { violations, role, updateViolationStatus } = usePlatform();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Selected violation ID state
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeFrameTab, setActiveFrameTab] = useState<"before" | "violation" | "after">("violation");
  
  // OCR Correction input
  const [correctedPlate, setCorrectedPlate] = useState("");
  
  // Rejection Dialog states
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  // Sync selectedId with URL parameter if present
  useEffect(() => {
    const urlId = searchParams?.get("id");
    if (urlId && violations.some(v => v.id === urlId)) {
      setSelectedId(urlId);
    } else if (violations.length > 0 && !selectedId) {
      // Default to first pending or first violation overall
      const pending = violations.find(v => v.status === "Detected" || v.status === "Under Review");
      setSelectedId(pending ? pending.id : violations[0].id);
    }
  }, [searchParams, violations, selectedId]);

  // Retrieve current active violation details
  const selectedViolation = useMemo(() => {
    return violations.find(v => v.id === selectedId) || violations[0];
  }, [violations, selectedId]);

  // Sync OCR input field with selected violation
  useEffect(() => {
    if (selectedViolation) {
      setCorrectedPlate(selectedViolation.plateNumber);
    }
  }, [selectedViolation]);

  // Filter list of pending review items
  const pendingQueue = useMemo(() => {
    return violations.filter(v => v.status === "Detected" || v.status === "Under Review");
  }, [violations]);

  // Actions
  const handleApprove = () => {
    if (!selectedViolation) return;
    updateViolationStatus(
      selectedViolation.id, 
      "Approved", 
      `Officer ${role}`, 
      correctedPlate !== selectedViolation.plateNumber ? `Plate OCR corrected to ${correctedPlate}` : undefined
    );
    
    // Auto-select next item in queue
    const nextPending = pendingQueue.find(v => v.id !== selectedViolation.id);
    if (nextPending) {
      setSelectedId(nextPending.id);
    }
  };

  const handleEscalate = () => {
    if (!selectedViolation) return;
    updateViolationStatus(
      selectedViolation.id,
      "Under Review",
      `Officer ${role} (Escalated to Supervisor)`,
      "Flagged for supervisor audit: verification required"
    );
  };

  const handleRejectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionReason) return;
    
    updateViolationStatus(
      selectedViolation.id,
      "Rejected",
      `Officer ${role}`,
      `Rejected reason: ${rejectionReason}`
    );
    
    setShowRejectModal(false);
    setRejectionReason("");

    // Auto-select next item in queue
    const nextPending = pendingQueue.find(v => v.id !== selectedViolation.id);
    if (nextPending) {
      setSelectedId(nextPending.id);
    }
  };

  // Mock download evidence package (ZIP pack metadata)
  const handleDownloadPack = () => {
    if (!selectedViolation) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(selectedViolation, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `GARUDA_EVIDENCE_${selectedViolation.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Render SVG Vehicle Icon
  const renderVehicleIcon = (type: string, color: string) => {
    if (type === "motorcycle") {
      return (
        <svg viewBox="0 0 100 100" width="80" height="80">
          <circle cx="25" cy="70" r="18" fill="none" stroke="#FFF" strokeWidth="6" />
          <circle cx="75" cy="70" r="18" fill="none" stroke="#FFF" strokeWidth="6" />
          <line x1="25" x2="50" y1="70" y2="45" stroke="#FFF" strokeWidth="6" />
          <line x1="50" x2="75" y1="45" y2="70" stroke="#FFF" strokeWidth="6" />
          <line x1="50" x2="35" y1="45" y2="30" stroke={color} strokeWidth="8" />
          <line x1="35" x2="15" y1="30" y2="30" stroke="#FFF" strokeWidth="4" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 100 100" width="90" height="60">
        <rect x="10" y="40" width="80" height="30" rx="6" fill={color} />
        <rect x="25" y="20" width="45" height="25" rx="4" fill="#E2E8F0" />
        <circle cx="30" cy="70" r="10" fill="#000" stroke="#FFF" strokeWidth="2" />
        <circle cx="70" cy="70" r="10" fill="#000" stroke="#FFF" strokeWidth="2" />
      </svg>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", height: "100%" }}>
      
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px" }}>HUMAN VERIFICATION DESK</h1>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginTop: "2px" }}>
            Audit high-confidence violations, override plate OCR readings, and validate citation packages
          </p>
        </div>
        <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-accent)" }}>
          Pending In Queue: <span className="mono" style={{ padding: "1px 6px", background: "var(--border-accent)", borderRadius: "4px" }}>{pendingQueue.length}</span>
        </div>
      </div>

      {/* Main Review Grid split-screen */}
      <div className="review-desk">
        
        {/* Left Column: Evidence Viewer & Sequence Frame Grid */}
        <section className="evidence-pane">
          {selectedViolation ? (
            <>
              {/* Evidence Panel Header */}
              <div className="evidence-header">
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>ACTIVE AUDIT:</span>
                  <span className="mono" style={{ fontWeight: "700", marginLeft: "4px" }}>{selectedViolation.id}</span>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={handleDownloadPack}
                    title="Export Ingest Pack"
                  >
                    <DownloadIcon size={12} /> DOWNLOAD EVIDENCE PACK
                  </button>
                </div>
              </div>

              {/* Multi-Frame Toggles */}
              <div className="evidence-stages">
                <div 
                  className={`stage-tab ${activeFrameTab === "before" ? "active" : ""}`}
                  onClick={() => setActiveFrameTab("before")}
                >
                  BEFORE (-1.0s)
                </div>
                <div 
                  className={`stage-tab ${activeFrameTab === "violation" ? "active" : ""}`}
                  onClick={() => setActiveFrameTab("violation")}
                >
                  VIOLATION FRAME (0.0s)
                </div>
                <div 
                  className={`stage-tab ${activeFrameTab === "after" ? "active" : ""}`}
                  onClick={() => setActiveFrameTab("after")}
                >
                  AFTER (+1.0s)
                </div>
              </div>

              {/* Interactive Frame Canvas Viewer */}
              <div className="stage-viewer">
                {/* Simulated SVG image stream frame */}
                <svg width="100%" height="100%" viewBox="0 0 500 300" style={{ display: "block" }}>
                  {/* Road Canvas */}
                  <rect width="500" height="300" fill="#0f172a" />
                  
                  {/* Highway road lanes details */}
                  <rect x="0" y="100" width="500" height="120" fill="#1e293b" />
                  <line x1="0" y1="160" x2="500" y2="160" stroke="#64748b" strokeWidth="3" strokeDasharray="12,12" />
                  <line x1="0" y1="100" x2="500" y2="100" stroke="#cbd5e1" strokeWidth="2" />
                  <line x1="0" y1="220" x2="500" y2="220" stroke="#cbd5e1" strokeWidth="2" />

                  {/* Stop Line indicator for Red Light */}
                  {selectedViolation.type === "Red Light" && (
                    <line x1="380" y1="100" x2="380" y2="220" stroke="#f1f5f9" strokeWidth="4" />
                  )}

                  {/* SVG Vehicle Placement according to active frame */}
                  {(() => {
                    const frame: EvidenceFrame = 
                      activeFrameTab === "before" ? selectedViolation.beforeFrame :
                      activeFrameTab === "after" ? selectedViolation.afterFrame :
                      selectedViolation.violationFrame;

                    const vBox = frame.vehicleBox;
                    const pBox = frame.plateBox;

                    // Convert vehicle box coordinates (scaled)
                    const x = vBox.x * 1.2;
                    const y = vBox.y + 10;
                    const w = vBox.w * 1.4;
                    const h = vBox.h * 1.2;

                    return (
                      <g>
                        {/* Vehicle SVG render */}
                        <g transform={`translate(${x}, ${y})`}>
                          {renderVehicleIcon(frame.vehicleSvgType, frame.color)}
                        </g>

                        {/* Bounding box outline */}
                        <rect 
                          x={x} 
                          y={y} 
                          width={w} 
                          height={h} 
                          fill="none" 
                          stroke="var(--border-accent-dark)" 
                          strokeWidth="2" 
                        />
                        <rect x={x} y={y - 18} width="90" height="18" fill="var(--border-accent-dark)" />
                        <text x={x + 4} y={y - 6} fill="#000" fontSize="10" fontFamily="monospace" fontWeight="bold">
                          {selectedViolation.vehicleType.toUpperCase()} {selectedViolation.confidenceScore}%
                        </text>

                        {/* License Plate Localization zoom tag */}
                        <rect 
                          x={x + (pBox.x - vBox.x) * 1.2} 
                          y={y + (pBox.y - vBox.y) * 1.1} 
                          width="24" 
                          height="12" 
                          fill="none" 
                          stroke="#10B981" 
                          strokeWidth="1.5" 
                        />
                      </g>
                    );
                  })()}

                  {/* Red Light Indicator overlay */}
                  {selectedViolation.type === "Red Light" && (
                    <g transform="translate(420, 30)">
                      <rect width="18" height="40" rx="3" fill="#334155" />
                      <circle cx="9" cy="10" r="5" fill={
                        activeFrameTab === "before" ? "#ef4444" : "#ef4444"
                      } style={{ opacity: activeFrameTab === "before" ? 0.3 : 1 }} />
                      <circle cx="9" cy="20" r="5" fill="#e2e8f0" style={{ opacity: 0.1 }} />
                      <circle cx="9" cy="30" r="5" fill="#e2e8f0" style={{ opacity: 0.1 }} />
                    </g>
                  )}

                  {/* Speed Camera speed tag overlay */}
                  {selectedViolation.type === "Speeding" && (
                    <text x="350" y="40" fill="#F43F5E" fontSize="13" fontFamily="monospace" fontWeight="bold">
                      SPEED RECORDED: {
                        activeFrameTab === "before" ? selectedViolation.beforeFrame.speed :
                        activeFrameTab === "after" ? selectedViolation.afterFrame.speed :
                        selectedViolation.violationFrame.speed
                      } MPH
                    </text>
                  )}

                  {/* OSD telemetry data text block */}
                  <text x="15" y="25" fill="#E2E8F0" fontSize="10" fontFamily="monospace">
                    FRAME TIMESTAMP: {new Date(selectedViolation.beforeFrame.timestamp).toISOString()}
                  </text>
                  <text x="15" y="285" fill="#A7F3D0" fontSize="9" fontFamily="monospace">
                    CAMERA: {selectedViolation.cameraId} | MODE: {selectedViolation.type.toUpperCase()} DETECTION
                  </text>
                </svg>
              </div>

              {/* Thumbnail row displaying all 3 states at once */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", padding: "10px", borderTop: "1px solid var(--border-color)", backgroundColor: "#FCFCFC" }}>
                <div 
                  onClick={() => setActiveFrameTab("before")}
                  style={{ 
                    border: `2px solid ${activeFrameTab === "before" ? "var(--border-accent-dark)" : "var(--border-color)"}`,
                    borderRadius: "4px",
                    overflow: "hidden",
                    cursor: "pointer",
                    textAlign: "center",
                    backgroundColor: "#000",
                    height: "60px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FFF",
                    fontSize: "9px"
                  }}
                >
                  BEFORE (-1.0s)
                </div>
                <div 
                  onClick={() => setActiveFrameTab("violation")}
                  style={{ 
                    border: `2px solid ${activeFrameTab === "violation" ? "var(--border-accent-dark)" : "var(--border-color)"}`,
                    borderRadius: "4px",
                    overflow: "hidden",
                    cursor: "pointer",
                    textAlign: "center",
                    backgroundColor: "#000",
                    height: "60px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FFF",
                    fontSize: "9px"
                  }}
                >
                  VIOLATION FRAME (0.0s)
                </div>
                <div 
                  onClick={() => setActiveFrameTab("after")}
                  style={{ 
                    border: `2px solid ${activeFrameTab === "after" ? "var(--border-accent-dark)" : "var(--border-color)"}`,
                    borderRadius: "4px",
                    overflow: "hidden",
                    cursor: "pointer",
                    textAlign: "center",
                    backgroundColor: "#000",
                    height: "60px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FFF",
                    fontSize: "9px"
                  }}
                >
                  AFTER (+1.0s)
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "80px 10px", color: "var(--text-muted)" }}>
              No violations selected. Choose an incident from the pending database list to populate active workspace.
            </div>
          )}
        </section>

        {/* Right Column: Workflow Action & Metadata Inspector */}
        <section className="inspector-pane">
          {selectedViolation ? (
            <>
              <div className="inspector-section" style={{ backgroundColor: "var(--bg-tertiary)" }}>
                <span className="form-label" style={{ color: "var(--text-accent)" }}>Workflow Status</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                  <span className={`badge ${selectedViolation.status.toLowerCase().replace(" ", "")}`}>
                    {selectedViolation.status}
                  </span>
                  <span className="mono" style={{ fontSize: "11px", fontWeight: "600" }}>
                    Confidence: {selectedViolation.confidenceScore}%
                  </span>
                </div>
              </div>

              {/* Metadata details list */}
              <div className="inspector-section">
                <h4 style={{ fontWeight: "700", fontSize: "11px", marginBottom: "8px", textTransform: "uppercase" }}>Incident Details</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Incident Type:</span>
                    <span style={{ fontWeight: "600", color: "var(--text-accent)" }}>{selectedViolation.type}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Camera Stream:</span>
                    <span className="mono" style={{ fontWeight: "600" }}>{selectedViolation.cameraId}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Location:</span>
                    <span style={{ fontWeight: "600" }}>{selectedViolation.location}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Timestamp:</span>
                    <span className="mono" style={{ fontWeight: "500" }}>
                      {new Date(selectedViolation.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Vehicle Type:</span>
                    <span style={{ fontWeight: "600" }}>{selectedViolation.vehicleType}</span>
                  </div>
                </div>
              </div>

              {/* ANPR / OCR correction block */}
              <div className="inspector-section">
                <h4 style={{ fontWeight: "700", fontSize: "11px", marginBottom: "6px", textTransform: "uppercase" }}>ANPR Plate Override</h4>
                
                {/* Plate Crop visual simulation */}
                <div style={{ 
                  backgroundColor: "#E2E8F0", 
                  border: "2px solid #94a3b8", 
                  borderRadius: "4px", 
                  padding: "10px", 
                  textAlign: "center",
                  margin: "8px 0",
                  fontFamily: "var(--font-mono)",
                  fontWeight: "bold",
                  fontSize: "18px",
                  color: "#1E293B",
                  letterSpacing: "2px",
                  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.06)"
                }}>
                  {selectedViolation.plateNumber}
                </div>

                <div className="form-group" style={{ marginBottom: "0" }}>
                  <label className="form-label">Manually Verified License Plate</label>
                  <input 
                    type="text" 
                    className="form-input mono"
                    style={{ textTransform: "uppercase" }}
                    value={correctedPlate}
                    onChange={(e) => setCorrectedPlate(e.target.value.toUpperCase())}
                  />
                  <span style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px", display: "block" }}>
                    Correct plate characters if edge classifier misread.
                  </span>
                </div>
              </div>

              {/* Model Confidence Breakdown Chart */}
              <div className="inspector-section">
                <h4 style={{ fontWeight: "700", fontSize: "11px", marginBottom: "8px", textTransform: "uppercase" }}>Confidence Analytics</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginBottom: "2px" }}>
                      <span>Vehicle Localization</span>
                      <span className="mono">96.8%</span>
                    </div>
                    <div className="progress-bar-outer"><div className="progress-bar-inner" style={{ width: "96.8%", backgroundColor: "#22c55e" }}></div></div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginBottom: "2px" }}>
                      <span>License Plate Box</span>
                      <span className="mono">91.4%</span>
                    </div>
                    <div className="progress-bar-outer"><div className="progress-bar-inner" style={{ width: "91.4%", backgroundColor: "#22c55e" }}></div></div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginBottom: "2px" }}>
                      <span>OCR Plate Reading</span>
                      <span className="mono">{selectedViolation.confidenceScore}%</span>
                    </div>
                    <div className="progress-bar-outer"><div className="progress-bar-inner" style={{ width: `${selectedViolation.confidenceScore}%`, backgroundColor: selectedViolation.confidenceScore > 85 ? "#22c55e" : "#EAB308" }}></div></div>
                  </div>
                </div>
              </div>

              {/* Decision Action Deck */}
              <div className="inspector-section" style={{ marginTop: "auto", borderTop: "2px solid var(--border-accent)" }}>
                <h4 style={{ fontWeight: "700", fontSize: "11px", marginBottom: "8px", textTransform: "uppercase" }}>ENFORCEMENT DECISION</h4>
                
                {selectedViolation.status === "Detected" || selectedViolation.status === "Under Review" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <button 
                      onClick={handleApprove}
                      className="btn btn-success"
                      style={{ width: "100%", fontWeight: "700" }}
                    >
                      ✓ CONFIRM & APPROVE CITATION
                    </button>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                      <button 
                        onClick={() => setShowRejectModal(true)}
                        className="btn btn-danger"
                      >
                        ✕ REJECT (VOID)
                      </button>
                      <button 
                        onClick={handleEscalate}
                        className="btn btn-secondary"
                        style={{ color: "var(--purple)", borderColor: "#d8b4fe" }}
                        disabled={selectedViolation.status === "Under Review" && role === "Reviewer"}
                      >
                        ⚡ ESCALATE
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ 
                    padding: "8px", 
                    borderRadius: "4px", 
                    fontSize: "11px", 
                    backgroundColor: "#f8fafc", 
                    border: "1px solid var(--border-color)"
                  }}>
                    <div style={{ fontWeight: "700" }}>AUDITED CITATION STATUS</div>
                    <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
                      <div>Reviewer: <strong>{selectedViolation.reviewer}</strong></div>
                      {selectedViolation.reviewedAt && (
                        <div>Audited At: <strong className="mono">{new Date(selectedViolation.reviewedAt).toLocaleString()}</strong></div>
                      )}
                      {selectedViolation.actionReason && (
                        <div style={{ color: "var(--text-muted)", marginTop: "4px", fontStyle: "italic" }}>
                          Notes: "{selectedViolation.actionReason}"
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>

      </div>

      {/* Reject Modal dialog box */}
      {showRejectModal && (
        <div style={{ 
          position: "fixed", 
          top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: "rgba(0, 0, 0, 0.4)", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center",
          zIndex: 1000 
        }}>
          <div className="card" style={{ width: "350px", transform: "none" }}>
            <div className="card-title">
              <span>REJECT CITATION CASE</span>
              <button 
                onClick={() => setShowRejectModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <form onSubmit={handleRejectSubmit}>
              <div className="form-group">
                <label className="form-label">Void Reason / Classification</label>
                <select 
                  className="form-input" 
                  value={rejectionReason} 
                  onChange={(e) => setRejectionReason(e.target.value)} 
                  required
                >
                  <option value="">-- Choose Void Reason --</option>
                  <option value="Model False Positive: Obscured plate reading">Plate Obscured / Shadow</option>
                  <option value="Emergency Vehicle: Authorized sirens operational">Emergency Duty Override</option>
                  <option value="No Infraction: Vehicle stopped before limit line">Lane Line Stop Validation</option>
                  <option value="Image Blurry: Plate text unreadable">Camera Motion Blur / Defocus</option>
                  <option value="Other system classification mismatch">Classification Mismatch</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "12px", justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>
                  CANCEL
                </button>
                <button type="submit" className="btn btn-danger">
                  VOID CITATION RECORD
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
