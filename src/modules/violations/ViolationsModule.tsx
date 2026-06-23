"use client";

import React, { useState, useMemo, useEffect } from "react";
import { usePlatform } from "@/context/PlatformContext";
import { VIOLATION_TYPES, STATUS_LABELS, STATUS_BADGE_CLASS, SEVERITY_COLOR, ViolationStatus } from "@/lib/violations";
import Link from "next/link";

// Custom SVG Icons for safety and compilation completeness
const VideoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-accent)" }}>
    <path d="M23 7l-7 5 7 5V7z" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const FolderIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-accent)" }}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const CameraSensorIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-accent)" }}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

export default function ViolationsModule() {
  const { violations, cameras, role, reviewViolation, deleteViolation, batchDeleteViolations, sendChallanSms, jobs } = usePlatform();

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCamera, setFilterCamera] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [minConfidence, setMinConfidence] = useState(0);
  const [filterDate, setFilterDate] = useState("");

  // Reorganization states
  const [groupBy, setGroupBy] = useState<"source" | "flat">("source");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);

  // Pagination State (flat view only)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Selected state for batch actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Filter locations
  const locations = useMemo(() => {
    return Array.from(new Set(cameras.map(c => c.location)));
  }, [cameras]);

  // Filtered List
  const filteredViolations = useMemo(() => {
    return violations.filter(v => {
      const plateMatch = v.plateNumber.toLowerCase().includes(searchTerm.toLowerCase());
      const idMatch = v.id.toLowerCase().includes(searchTerm.toLowerCase());
      if (searchTerm && !plateMatch && !idMatch) return false;
      if (filterCamera !== "all" && v.cameraId !== filterCamera) return false;
      if (filterLocation !== "all" && v.location !== filterLocation) return false;
      if (filterType !== "all" && v.type !== filterType) return false;
      if (filterStatus !== "all" && v.status !== filterStatus) return false;
      if (v.confidenceScore < minConfidence) return false;
      if (filterDate && new Date(filterDate).toDateString() !== new Date(v.timestamp).toDateString()) return false;
      return true;
    });
  }, [violations, searchTerm, filterCamera, filterLocation, filterType, filterStatus, minConfidence, filterDate]);

  // Grouped list calculations
  const groupedViolations = useMemo(() => {
    const groups: Record<string, { id: string; name: string; type: string; violations: typeof violations; totalFine: number; pendingCount: number }> = {};

    filteredViolations.forEach(v => {
      let groupId = v.cameraId;
      let name = v.location || v.cameraId;
      let type = "Camera Sensor";

      if (v.cameraId.startsWith("JOB-")) {
        const job = jobs.find(j => j.id === v.cameraId);
        if (job) {
          name = job.name;
          type = job.sourceType === "Video" ? "Video Job" : job.sourceType === "Batch" ? "Batch Job" : "Job";
        } else {
          name = `Job ${v.cameraId.substring(4, 12)}...`;
          type = "Processing Job";
        }
      }

      const key = `${type}:${groupId}`;
      if (!groups[key]) {
        groups[key] = {
          id: groupId,
          name,
          type,
          violations: [],
          totalFine: 0,
          pendingCount: 0
        };
      }
      groups[key].violations.push(v);
      groups[key].totalFine += v.fineAmountInr;
      if (v.status === "pending") {
        groups[key].pendingCount++;
      }
    });

    return Object.values(groups).sort((a, b) => {
      if (a.type.includes("Job") && !b.type.includes("Job")) return -1;
      if (!a.type.includes("Job") && b.type.includes("Job")) return 1;
      return b.violations.length - a.violations.length;
    });
  }, [filteredViolations, jobs]);

  // Auto-expand the first group if expandedGroups is empty
  useEffect(() => {
    if (groupBy === "source" && expandedGroups.size === 0 && groupedViolations.length > 0) {
      setExpandedGroups(new Set([`${groupedViolations[0].type}:${groupedViolations[0].id}`]));
    }
  }, [groupedViolations, groupBy, expandedGroups.size]);

  // Flat view pagination
  const totalPages = Math.max(1, Math.ceil(filteredViolations.length / itemsPerPage));
  const paginatedViolations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredViolations.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredViolations, currentPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    const keys = groupedViolations.map(g => `${g.type}:${g.id}`);
    setExpandedGroups(new Set(keys));
  };

  const handleCollapseAll = () => {
    setExpandedGroups(new Set());
  };

  const canQuickReview = role !== "Operator";

  const handleQuickAction = async (id: string, action: "Approved" | "Rejected") => {
    try {
      await reviewViolation(id, action, `Officer ${role}`, "Quick action from Violation Center");
    } catch (err) {
      alert("Action failed: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDeleteSingle = async (id: string) => {
    if (!window.confirm(`Delete violation event ${id}? This action is permanent.`)) return;
    setDeletingId(id);
    try {
      await deleteViolation(id);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      alert("Delete failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectGroup = (groupVios: typeof violations, select: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      groupVios.forEach(v => {
        if (select) next.add(v.id);
        else next.delete(v.id);
      });
      return next;
    });
  };

  const handleApproveGroupPending = async (groupVios: typeof violations, e: React.MouseEvent) => {
    e.stopPropagation();
    const pendingIds = groupVios.filter(v => v.status === "pending").map(v => v.id);
    if (pendingIds.length === 0) return;
    if (!window.confirm(`Approve all ${pendingIds.length} pending violations in this batch?`)) return;

    setSubmitting(true);
    try {
      for (const id of pendingIds) {
        await reviewViolation(id, "Approved", `Officer ${role}`, "Bulk approval from Violation Center");
      }
    } catch (err) {
      alert("Bulk approval failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGroupEvents = async (groupVios: typeof violations, e: React.MouseEvent) => {
    e.stopPropagation();
    if (groupVios.length === 0) return;
    if (!window.confirm(`Delete all ${groupVios.length} violations in this batch? This action is permanent.`)) return;

    setSubmitting(true);
    try {
      await batchDeleteViolations(groupVios.map(v => v.id));
    } catch (err) {
      alert("Bulk delete failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClearAllViolations = async () => {
    if (violations.length === 0) return;
    if (!window.confirm(`Clear ALL ${violations.length} violation events from registry? This action is permanent.`)) return;
    setSubmitting(true);
    try {
      await batchDeleteViolations(violations.map(v => v.id));
      setSelectedIds(new Set());
    } catch (err) {
      alert("Clear all failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected violation event(s)? This action is permanent.`)) return;
    setSubmitting(true);
    try {
      await batchDeleteViolations(Array.from(selectedIds));
      setSelectedIds(new Set());
    } catch (err) {
      alert("Batch delete failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  // Render a violation item in table or mobile list card
  const renderViolationRow = (v: typeof violations[0], showLocation = false) => {
    const isSelected = selectedIds.has(v.id);
    return (
      <tr key={v.id}>
        <td style={{ textAlign: "center", width: "40px" }}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => handleToggleSelect(v.id)}
            style={{ cursor: "pointer" }}
          />
        </td>
        <td style={{ width: "65px", padding: "6px" }}>
          <div style={{ position: "relative", width: "48px", height: "36px", overflow: "hidden", borderRadius: "4px", border: "1px solid var(--border-color)", cursor: "pointer" }}>
            <img 
              src={v.annotatedImg || v.rawImg} 
              alt="crop" 
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onClick={() => window.open(v.annotatedImg || v.rawImg, "_blank")}
              title="Click to view full image"
            />
          </div>
        </td>
        <td className="mono" style={{ fontWeight: "700", fontSize: "11px" }}>{v.id}</td>
        <td>
          <span style={{ color: "var(--text-accent)", fontWeight: "600" }}>
            {v.type}
          </span>
        </td>
        <td>
          <span style={{
            fontSize: "10px",
            fontWeight: "700",
            textTransform: "uppercase",
            color: SEVERITY_COLOR[v.severity] || "var(--text-muted)"
          }}>
            {v.severity}
          </span>
        </td>
        <td className="mono" style={{ fontSize: "11px" }}>
          {new Date(v.timestamp).toLocaleDateString()} {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </td>
        {showLocation && <td>{v.location}</td>}
        <td>
          <span className="mono" style={{
            fontWeight: "bold",
            background: "#FEF9C3",
            border: "1px solid var(--border-accent-dark)",
            padding: "2px 6px",
            borderRadius: "4px",
            color: "var(--text-accent)",
            fontSize: "11px",
            letterSpacing: "0.5px"
          }}>
            {v.plateNumber}
          </span>
        </td>
        <td className="mono" style={{ fontWeight: "700" }}>{v.confidenceScore}%</td>
        <td className="mono" style={{ fontSize: "11px", fontWeight: "700" }}>₹{v.fineAmountInr}</td>
        <td>
          <span className={`badge ${STATUS_BADGE_CLASS[v.status]}`}>
            {STATUS_LABELS[v.status]}
          </span>
        </td>
        <td style={{ textAlign: "right" }}>
          <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
            <Link href={`/review?id=${v.id}`} className="btn btn-secondary btn-sm" style={{ padding: "4px 8px" }}>
              INSPECT
            </Link>
            <button
              className="btn btn-secondary btn-sm"
              title="Send SMS alert"
              style={{ padding: "4px 8px" }}
              onClick={() => sendChallanSms(v.id)}
            >
              ✉ SMS
            </button>
            {canQuickReview && v.status === "pending" && (
              <>
                <button
                  className="btn btn-success btn-sm"
                  title="Approve Citation"
                  style={{ padding: "4px 8px" }}
                  onClick={() => handleQuickAction(v.id, "Approved")}
                >
                  ✓
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  title="Reject Citation"
                  style={{ padding: "4px 8px" }}
                  onClick={() => handleQuickAction(v.id, "Rejected")}
                >
                  ✕
                </button>
              </>
            )}
            <button
              className="btn btn-danger btn-sm"
              title="Delete Citation"
              style={{ padding: "4px 8px" }}
              onClick={() => handleDeleteSingle(v.id)}
              disabled={deletingId === v.id}
            >
              ✕
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderViolationCardMobile = (v: typeof violations[0], showLocation = false) => {
    const isSelected = selectedIds.has(v.id);
    return (
      <div key={v.id} style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderRadius: "8px",
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }}>
        <div style={{ display: "flex", justifyItems: "center", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleToggleSelect(v.id)}
              style={{ cursor: "pointer" }}
            />
            <span className="mono" style={{ fontWeight: "700", fontSize: "11px" }}>{v.id}</span>
          </div>
          <span className={`badge ${STATUS_BADGE_CLASS[v.status]}`}>
            {STATUS_LABELS[v.status]}
          </span>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "start" }}>
          <img 
            src={v.annotatedImg || v.rawImg} 
            alt="crop" 
            style={{ width: "80px", height: "60px", objectFit: "cover", borderRadius: "4px", border: "1px solid var(--border-color)" }}
            onClick={() => window.open(v.annotatedImg || v.rawImg, "_blank")}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
            <span style={{ color: "var(--text-accent)", fontWeight: "700", fontSize: "13px" }}>{v.type}</span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "2px" }}>
              <span className="mono" style={{
                fontWeight: "bold",
                background: "#FEF9C3",
                border: "1px solid var(--border-accent-dark)",
                padding: "1px 4px",
                borderRadius: "3px",
                color: "var(--text-accent)",
                fontSize: "10px"
              }}>
                {v.plateNumber}
              </span>
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Conf: {v.confidenceScore}%</span>
            </div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
              {new Date(v.timestamp).toLocaleString()}
            </div>
            {showLocation && <div style={{ fontSize: "10px", fontWeight: "600" }}>{v.location}</div>}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px", borderTop: "1px solid #F1F5F9" }}>
          <span className="mono" style={{ fontWeight: "700", color: "var(--text-primary)" }}>Fine: ₹{v.fineAmountInr}</span>
          <div style={{ display: "flex", gap: "4px" }}>
            <Link href={`/review?id=${v.id}`} className="btn btn-secondary btn-sm" style={{ padding: "4px 8px", fontSize: "10px" }}>
              INSPECT
            </Link>
            <button
              className="btn btn-secondary btn-sm"
              style={{ padding: "4px 8px", fontSize: "10px" }}
              onClick={() => sendChallanSms(v.id)}
            >
              SMS
            </button>
            {canQuickReview && v.status === "pending" && (
              <button
                className="btn btn-success btn-sm"
                style={{ padding: "4px 8px", fontSize: "10px" }}
                onClick={() => handleQuickAction(v.id, "Approved")}
              >
                Approve
              </button>
            )}
            <button
              className="btn btn-danger btn-sm"
              style={{ padding: "4px 6px", fontSize: "10px" }}
              onClick={() => handleDeleteSingle(v.id)}
              disabled={deletingId === v.id}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Header section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px" }}>VIOLATION CENTER & EVENT REGISTRY</h1>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginTop: "2px" }}>
            Query database for all recorded traffic citation events and process validation queues
          </p>
        </div>

        {/* Global actions */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {selectedIds.size > 0 && (
            <button
              className="btn btn-danger btn-sm"
              onClick={handleDeleteSelected}
              disabled={submitting}
            >
              DELETE SELECTED ({selectedIds.size})
            </button>
          )}
          <button
            className="btn btn-danger btn-sm"
            onClick={handleClearAllViolations}
            disabled={submitting || violations.length === 0}
          >
            CLEAR ALL
          </button>
          <span className="brand-badge" style={{ fontSize: "9px" }}>LIVE SYNC</span>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      <div className="filter-bar" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px", padding: "12px" }}>
        <div style={{ minWidth: "150px" }}>
          <label className="form-label" style={{ fontSize: "9px" }}>Search Plate / ID</label>
          <input
            type="text"
            className="form-input"
            style={{ padding: "6px" }}
            placeholder="e.g. KA01AB1234"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <div>
          <label className="form-label" style={{ fontSize: "9px" }}>Sensor / Camera</label>
          <select
            className="form-input"
            style={{ padding: "6px" }}
            value={filterCamera}
            onChange={(e) => { setFilterCamera(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Cameras</option>
            {cameras.map(c => (
              <option key={c.id} value={c.id}>{c.id}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label" style={{ fontSize: "9px" }}>Location / Source</label>
          <select
            className="form-input"
            style={{ padding: "6px" }}
            value={filterLocation}
            onChange={(e) => { setFilterLocation(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Locations</option>
            {locations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label" style={{ fontSize: "9px" }}>Violation Category</label>
          <select
            className="form-input"
            style={{ padding: "6px" }}
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Types</option>
            {VIOLATION_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label" style={{ fontSize: "9px" }}>Date</label>
          <input
            type="date"
            className="form-input"
            style={{ padding: "6px" }}
            value={filterDate}
            onChange={(e) => { setFilterDate(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <div>
          <label className="form-label" style={{ fontSize: "9px" }}>Review Status</label>
          <select
            className="form-input"
            style={{ padding: "6px" }}
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All States</option>
            {(Object.keys(STATUS_LABELS) as ViolationStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div style={{ minWidth: "140px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <label className="form-label" style={{ fontSize: "9px" }}>Min Confidence</label>
            <span className="mono" style={{ fontSize: "9px", fontWeight: "bold" }}>{minConfidence}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="95"
            step="5"
            value={minConfidence}
            onChange={(e) => { setMinConfidence(parseInt(e.target.value)); setCurrentPage(1); }}
            style={{ width: "100%", accentColor: "var(--border-accent-dark)", cursor: "pointer", height: "4px", marginTop: "8px" }}
          />
        </div>
      </div>

      {/* Organizer Controls / Tabs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "8px 12px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", gap: "4px", border: "1px solid var(--border-color)", borderRadius: "4px", overflow: "hidden", backgroundColor: "var(--bg-primary)" }}>
          <button
            onClick={() => setGroupBy("source")}
            style={{
              padding: "4px 10px",
              border: "none",
              fontSize: "11px",
              fontWeight: "600",
              cursor: "pointer",
              backgroundColor: groupBy === "source" ? "var(--border-accent)" : "transparent",
              color: groupBy === "source" ? "var(--text-accent)" : "var(--text-secondary)",
            }}
          >
            BATCH / VIDEO GROUPS
          </button>
          <button
            onClick={() => setGroupBy("flat")}
            style={{
              padding: "4px 10px",
              border: "none",
              fontSize: "11px",
              fontWeight: "600",
              cursor: "pointer",
              backgroundColor: groupBy === "flat" ? "var(--border-accent)" : "transparent",
              color: groupBy === "flat" ? "var(--text-accent)" : "var(--text-secondary)",
            }}
          >
            FLAT LIST
          </button>
        </div>

        {groupBy === "source" ? (
          <div style={{ display: "flex", gap: "6px" }}>
            <button className="btn btn-secondary btn-sm" onClick={handleExpandAll} style={{ fontSize: "10px", padding: "4px 8px" }}>
              EXPAND ALL
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleCollapseAll} style={{ fontSize: "10px", padding: "4px 8px" }}>
              COLLAPSE ALL
            </button>
          </div>
        ) : (
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Found {filteredViolations.length} total events
          </span>
        )}
      </div>

      {/* Main Events Display */}
      {filteredViolations.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "60px 10px", color: "var(--text-muted)" }}>
          No violation events found matching the specified parameters.
        </div>
      ) : groupBy === "flat" ? (
        /* FLAT LIST VIEW */
        <div className="card" style={{ padding: "0" }}>
          {isMobile ? (
            /* Flat view - Mobile Cards */
            <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
              {paginatedViolations.map(v => renderViolationCardMobile(v, true))}
            </div>
          ) : (
            /* Flat view - Desktop Table */
            <div className="table-container">
              <table className="dense-table">
                <thead>
                  <tr>
                    <th style={{ width: "30px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={paginatedViolations.length > 0 && paginatedViolations.every(v => selectedIds.has(v.id))}
                        onChange={() => {
                          const allSelected = paginatedViolations.every(v => selectedIds.has(v.id));
                          handleToggleSelectGroup(paginatedViolations, !allSelected);
                        }}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                    <th>Evidence</th>
                    <th>Event ID</th>
                    <th>Category</th>
                    <th>Severity</th>
                    <th>Date / Time</th>
                    <th>Source / Location</th>
                    <th>Plate Number</th>
                    <th>Conf.</th>
                    <th>Fine</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedViolations.map(v => renderViolationRow(v, true))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px",
            borderTop: "1px solid var(--border-color)"
          }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Showing page <strong style={{ color: "var(--text-primary)" }}>{currentPage}</strong> of <strong style={{ color: "var(--text-primary)" }}>{totalPages}</strong> ({filteredViolations.length} total)
            </span>

            <div style={{ display: "flex", gap: "6px" }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                PREV
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                NEXT
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* GROUPED ACCORDION VIEW */
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {groupedViolations.map((group) => {
            const groupKey = `${group.type}:${group.id}`;
            const isExpanded = expandedGroups.has(groupKey);
            const allSelected = group.violations.every(v => selectedIds.has(v.id));
            const hasPending = group.pendingCount > 0;

            let sourceIcon = <CameraSensorIcon />;
            if (group.type.includes("Video")) sourceIcon = <VideoIcon />;
            else if (group.type.includes("Batch")) sourceIcon = <FolderIcon />;

            return (
              <div 
                key={groupKey} 
                className="card" 
                style={{ 
                  padding: "0", 
                  overflow: "hidden", 
                  borderLeft: `4px solid ${group.type.includes("Job") ? "var(--border-accent-dark)" : "#94A3B8"}`,
                  transform: "none",
                  transition: "none"
                }}
              >
                {/* Group Header Row */}
                <div 
                  onClick={() => toggleGroup(groupKey)}
                  style={{
                    padding: "12px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    backgroundColor: isExpanded ? "var(--bg-tertiary)" : "var(--bg-secondary)",
                    userSelect: "none",
                    flexWrap: "wrap",
                    gap: "10px",
                    borderBottom: isExpanded ? "1px solid var(--border-color)" : "none"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "200px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px", borderRadius: "4px", backgroundColor: "#FEFCE8", border: "1px solid var(--border-accent)" }}>
                      {sourceIcon}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontWeight: "700", fontSize: "13px", color: "var(--text-primary)" }}>{group.name}</span>
                        <span className="brand-badge" style={{ fontSize: "8px", padding: "1px 4px", backgroundColor: "#F1F5F9", color: "var(--text-secondary)", border: "none" }}>
                          {group.type.toUpperCase()}
                        </span>
                      </div>
                      <div className="mono" style={{ fontSize: "9px", color: "var(--text-muted)" }}>ID: {group.id}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
                    {/* Stats summary */}
                    <div style={{ display: "flex", gap: "16px", fontSize: "11px", fontWeight: "600" }}>
                      <span style={{ color: "var(--text-secondary)" }}>
                        Citations: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{group.violations.length}</strong>
                      </span>
                      {hasPending && (
                        <span style={{ color: "var(--warning)" }}>
                          Pending: <strong style={{ fontFamily: "var(--font-mono)" }}>{group.pendingCount}</strong>
                        </span>
                      )}
                      <span style={{ color: "var(--text-accent)" }}>
                        Total Fine: <strong style={{ fontFamily: "var(--font-mono)" }}>₹{group.totalFine}</strong>
                      </span>
                    </div>

                    {/* Quick batch controls inside header */}
                    <div style={{ display: "flex", gap: "6px" }} onClick={e => e.stopPropagation()}>
                      {hasPending && canQuickReview && (
                        <button 
                          className="btn btn-success btn-sm" 
                          style={{ fontSize: "10px", padding: "2px 6px" }}
                          onClick={(e) => handleApproveGroupPending(group.violations, e)}
                        >
                          Approve Pending
                        </button>
                      )}
                      <button 
                        className="btn btn-danger btn-sm" 
                        style={{ fontSize: "10px", padding: "2px 6px" }}
                        onClick={(e) => handleDeleteGroupEvents(group.violations, e)}
                      >
                        Delete Group
                      </button>
                    </div>

                    <div style={{ color: "var(--text-secondary)" }}>
                      {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    </div>
                  </div>
                </div>

                {/* Sub-menu and Table of violations when expanded */}
                {isExpanded && (
                  <div style={{ padding: "12px", backgroundColor: "#FCFCFC" }}>
                    {/* Batch operations within expanded card */}
                    <div style={{ display: "flex", gap: "10px", marginBottom: "10px", alignItems: "center", flexWrap: "wrap", fontSize: "11px" }}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button 
                          type="button" 
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: "10px", padding: "3px 8px" }}
                          onClick={() => handleToggleSelectGroup(group.violations, !allSelected)}
                        >
                          {allSelected ? "DESELECT ALL" : "SELECT ALL IN BATCH"}
                        </button>
                      </div>
                      <span style={{ color: "var(--text-muted)" }}>
                        Selected: {group.violations.filter(v => selectedIds.has(v.id)).length} of {group.violations.length}
                      </span>
                    </div>

                    {isMobile ? (
                      /* Mobile layout for group items */
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {group.violations.map(v => renderViolationCardMobile(v, false))}
                      </div>
                    ) : (
                      /* Desktop layout - Table */
                      <div className="table-container" style={{ border: "1px solid var(--border-color)", borderRadius: "4px" }}>
                        <table className="dense-table" style={{ backgroundColor: "#FFFFFF" }}>
                          <thead>
                            <tr>
                              <th style={{ width: "30px", textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={allSelected}
                                  onChange={() => handleToggleSelectGroup(group.violations, !allSelected)}
                                  style={{ cursor: "pointer" }}
                                />
                              </th>
                              <th>Evidence</th>
                              <th>Event ID</th>
                              <th>Category</th>
                              <th>Severity</th>
                              <th>Date / Time</th>
                              <th>Plate Number</th>
                              <th>Conf.</th>
                              <th>Fine</th>
                              <th>Status</th>
                              <th style={{ textAlign: "right" }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.violations.map(v => renderViolationRow(v, false))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
