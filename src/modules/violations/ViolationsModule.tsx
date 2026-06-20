"use client";

import React, { useState, useMemo } from "react";
import { usePlatform, Violation, ViolationStatus } from "@/context/PlatformContext";
import { AlertIcon, SearchIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/Icons";
import Link from "next/link";

export default function ViolationsModule() {
  const { violations, cameras, role, updateViolationStatus } = usePlatform();

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCamera, setFilterCamera] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [minConfidence, setMinConfidence] = useState(50);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Filter logic
  const filteredViolations = useMemo(() => {
    return violations.filter(v => {
      // Plate search
      if (searchTerm && !v.plateNumber.toLowerCase().includes(searchTerm.toLowerCase()) && !v.id.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      // Camera filter
      if (filterCamera !== "all" && v.cameraId !== filterCamera) return false;
      // Type filter
      if (filterType !== "all" && v.type !== filterType) return false;
      // Status filter
      if (filterStatus !== "all" && v.status !== filterStatus) return false;
      // Confidence threshold
      if (v.confidenceScore < minConfidence) return false;
      return true;
    });
  }, [violations, searchTerm, filterCamera, filterType, filterStatus, minConfidence]);

  // Pagination calculation
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

  // Quick inline actions (Available for Admin/Supervisor/Reviewer)
  const canQuickReview = role !== "Operator";

  const handleQuickStatusChange = (id: string, status: ViolationStatus) => {
    updateViolationStatus(id, status, `Officer ${role} (Quick Action)`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px" }}>VIOLATION CENTER & EVENT REGISTRY</h1>
        <p style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginTop: "2px" }}>
          Real-time query database for all AI edge-generated traffic citation events
        </p>
      </div>

      {/* Advanced Filter Panel */}
      <div className="filter-bar">
        <div className="filter-item" style={{ flex: 1.5 }}>
          <label className="form-label">Search Plate / ID</label>
          <div style={{ position: "relative" }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. 3AB-289 or VIO-..." 
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
        </div>

        <div className="filter-item">
          <label className="form-label">Sensor / Camera</label>
          <select 
            className="form-input" 
            value={filterCamera} 
            onChange={(e) => { setFilterCamera(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Cameras</option>
            {cameras.map(c => (
              <option key={c.id} value={c.id}>{c.id}</option>
            ))}
          </select>
        </div>

        <div className="filter-item">
          <label className="form-label">Violation Category</label>
          <select 
            className="form-input" 
            value={filterType} 
            onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All Types</option>
            <option value="Red Light">Red Light</option>
            <option value="Speeding">Speeding</option>
            <option value="Wrong Way">Wrong Way</option>
            <option value="Seatbelt">Seatbelt</option>
            <option value="No Helmet">No Helmet</option>
          </select>
        </div>

        <div className="filter-item">
          <label className="form-label">Review Status</label>
          <select 
            className="form-input" 
            value={filterStatus} 
            onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
          >
            <option value="all">All States</option>
            <option value="Detected">Detected</option>
            <option value="Under Review">Under Review</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>

        <div className="filter-item" style={{ minWidth: "180px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <label className="form-label">Min Confidence</label>
            <span className="mono" style={{ fontSize: "10px", fontWeight: "bold" }}>{minConfidence}%</span>
          </div>
          <input 
            type="range" 
            min="50" 
            max="95" 
            step="5"
            value={minConfidence} 
            onChange={(e) => { setMinConfidence(parseInt(e.target.value)); setCurrentPage(1); }}
            style={{ width: "100%", accentColor: "var(--border-accent-dark)", cursor: "pointer" }}
          />
        </div>
      </div>

      {/* Database Event Table */}
      <div className="card">
        <div className="card-title">
          <span>VIOLATION EVENT LOGS ({filteredViolations.length} RECORDS FOUND)</span>
          <span className="brand-badge">PAGINATION ACTIVE</span>
        </div>

        {filteredViolations.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 10px", color: "var(--text-muted)" }}>
            No violation events found matching the specified parameters.
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="dense-table">
                <thead>
                  <tr>
                    <th>Event ID</th>
                    <th>Violation Category</th>
                    <th>Date / Time</th>
                    <th>Location</th>
                    <th>Camera</th>
                    <th>Vehicle Details</th>
                    <th>OCR Plate</th>
                    <th>Confidence</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Workflow Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedViolations.map((v) => (
                    <tr key={v.id}>
                      <td className="mono" style={{ fontWeight: "700" }}>{v.id}</td>
                      <td>
                        <span style={{ 
                          color: v.type === "Red Light" ? "var(--danger)" : "var(--text-accent)",
                          fontWeight: "600"
                        }}>
                          {v.type}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: "11px" }}>
                        {new Date(v.timestamp).toLocaleDateString()} {new Date(v.timestamp).toLocaleTimeString()}
                      </td>
                      <td>{v.location}</td>
                      <td className="mono" style={{ color: "var(--text-muted)" }}>{v.cameraId}</td>
                      <td>{v.vehicleType}</td>
                      <td>
                        <span className="mono" style={{ 
                          fontWeight: "bold", 
                          background: "#FEF9C3", 
                          border: "1px solid var(--border-accent-dark)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          color: "var(--text-accent)"
                        }}>
                          {v.plateNumber}
                        </span>
                      </td>
                      <td className="mono" style={{ fontWeight: "700" }}>{v.confidenceScore}%</td>
                      <td>
                        <span className={`badge ${v.status.toLowerCase().replace(" ", "")}`}>
                          {v.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                          
                          {/* Inspect button links directly to Review screen workflow with active violation state */}
                          <Link href={`/review?id=${v.id}`} className="btn btn-secondary btn-sm">
                            INSPECT
                          </Link>

                          {/* Quick validation if role supports it */}
                          {canQuickReview && (v.status === "Detected" || v.status === "Under Review") && (
                            <>
                              <button 
                                className="btn btn-success btn-sm"
                                title="Approve Citation"
                                onClick={() => handleQuickStatusChange(v.id, "Approved")}
                              >
                                ✓
                              </button>
                              <button 
                                className="btn btn-danger btn-sm"
                                title="Reject Citation"
                                onClick={() => handleQuickStatusChange(v.id, "Rejected")}
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center", 
              marginTop: "12px", 
              paddingTop: "12px", 
              borderTop: "1px solid var(--border-color)" 
            }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                Showing page <strong style={{ color: "var(--text-primary)" }}>{currentPage}</strong> of <strong style={{ color: "var(--text-primary)" }}>{totalPages}</strong> ({filteredViolations.length} total events)
              </span>

              <div style={{ display: "flex", gap: "6px" }}>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{ display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <ChevronLeftIcon size={12} /> PREV
                </button>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{ display: "flex", alignItems: "center", gap: "4px" }}
                >
                  NEXT <ChevronRightIcon size={12} />
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
