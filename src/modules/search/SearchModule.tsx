"use client";

import React, { useState, useMemo } from "react";
import { usePlatform, Violation } from "@/context/PlatformContext";
import { SearchIcon, ChevronRightIcon, AlertIcon } from "@/components/Icons";
import Link from "next/link";

export default function SearchModule() {
  const { violations, cameras } = usePlatform();
  
  // Search parameters state
  const [query, setQuery] = useState("");
  const [filterCamera, setFilterCamera] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [searchDate, setSearchDate] = useState("");

  // Derive unique locations
  const locations = useMemo(() => {
    return Array.from(new Set(cameras.map(c => c.location)));
  }, [cameras]);

  // Fast indexing retrieval simulator
  const searchResults = useMemo(() => {
    if (!query && filterCamera === "all" && filterLocation === "all" && filterType === "all" && !searchDate) {
      return [];
    }

    return violations.filter(v => {
      // Global text query matches plate number, violation ID, camera ID or location
      if (query) {
        const lowerQuery = query.toLowerCase();
        const matchesPlate = v.plateNumber.toLowerCase().includes(lowerQuery);
        const matchesId = v.id.toLowerCase().includes(lowerQuery);
        const matchesCam = v.cameraId.toLowerCase().includes(lowerQuery);
        const matchesLoc = v.location.toLowerCase().includes(lowerQuery);
        if (!matchesPlate && !matchesId && !matchesCam && !matchesLoc) return false;
      }

      // Exact filters
      if (filterCamera !== "all" && v.cameraId !== filterCamera) return false;
      if (filterLocation !== "all" && v.location !== filterLocation) return false;
      if (filterType !== "all" && v.type !== filterType) return false;
      
      // Date filter matching
      if (searchDate) {
        const inputDateStr = new Date(searchDate).toDateString();
        const vioDateStr = new Date(v.timestamp).toDateString();
        if (inputDateStr !== vioDateStr) return false;
      }

      return true;
    });
  }, [violations, query, filterCamera, filterLocation, filterType, searchDate]);

  // Detected query syntax helper (Plate vs Cam vs Vio)
  const detectedSyntax = useMemo(() => {
    if (!query) return null;
    const clean = query.trim().toUpperCase();
    if (/^[0-9]/.test(clean) && clean.length > 2) {
      return "REGISTRATION PLATE DETECTED";
    }
    if (clean.startsWith("CAM")) {
      return "CAMERA ID PATTERN DETECTED";
    }
    if (clean.startsWith("VIO")) {
      return "CITATION EVENT ID DETECTED";
    }
    return "GENERIC FREE TEXT SEARCH";
  }, [query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px" }}>GLOBAL SEARCH CENTER</h1>
        <p style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginTop: "2px" }}>
          Query license plates, camera streams, locations, and citation event IDs with index-accelerated retrieval
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px" }}>
        
        {/* Search Input Card */}
        <div className="card" style={{ marginBottom: "0" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label className="form-label" style={{ fontWeight: "700" }}>Global Query Parser</label>
              <div style={{ display: "flex", gap: "6px" }}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Enter Plate Number (e.g. 3AB-289), Event ID (e.g. VIO-2026...), Camera, or Location..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ padding: "8px 12px", fontSize: "14px" }}
                />
              </div>
            </div>
          </div>

          {detectedSyntax && (
            <div style={{ 
              marginTop: "6px", 
              fontSize: "10px", 
              fontWeight: "700", 
              color: "var(--text-accent)", 
              fontFamily: "var(--font-mono)" 
            }}>
              [PARSER]: {detectedSyntax}
            </div>
          )}
        </div>

        {/* Filters and Results split */}
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "12px" }}>
          
          {/* Filters card column */}
          <aside className="card" style={{ height: "fit-content" }}>
            <div className="card-title" style={{ fontSize: "11px" }}>
              <span>REFINE DATABASE SEARCH</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div className="form-group">
                <label className="form-label">Active Camera ID</label>
                <select className="form-input" value={filterCamera} onChange={(e) => setFilterCamera(e.target.value)}>
                  <option value="all">All Cameras</option>
                  {cameras.map(c => (
                    <option key={c.id} value={c.id}>{c.id}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Location Sector</label>
                <select className="form-input" value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)}>
                  <option value="all">All Locations</option>
                  {locations.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Infraction Category</label>
                <select className="form-input" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="all">All Types</option>
                  <option value="Red Light">Red Light</option>
                  <option value="Speeding">Speeding</option>
                  <option value="Wrong Way">Wrong Way</option>
                  <option value="Seatbelt">Seatbelt</option>
                  <option value="No Helmet">No Helmet</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Exact Date Target</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={searchDate}
                  onChange={(e) => setSearchDate(e.target.value)}
                />
              </div>

              <button 
                type="button" 
                className="btn btn-secondary btn-sm"
                style={{ width: "100%" }}
                onClick={() => {
                  setQuery("");
                  setFilterCamera("all");
                  setFilterLocation("all");
                  setFilterType("all");
                  setSearchDate("");
                }}
              >
                RESET QUERY OPTIONS
              </button>
            </div>
          </aside>

          {/* Results column */}
          <div className="card">
            <div className="card-title">
              <span>DATABASE RETRIEVAL OUTPUTS ({searchResults.length} RECORDS MATCHED)</span>
              {searchResults.length > 0 && (
                <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  LATENCY: 1.84ms | INDEX: PLATE_ANPR_IDX
                </span>
              )}
            </div>

            {searchResults.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 10px", color: "var(--text-muted)" }}>
                {query || filterCamera !== "all" || filterLocation !== "all" || filterType !== "all" || searchDate
                  ? "No matching database entries discovered."
                  : "Enter a query or select a refinement index filter to pull records."
                }
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {searchResults.map(res => (
                  <div 
                    key={res.id}
                    style={{
                      border: "1px solid var(--border-color)",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      backgroundColor: "#FCFCFC",
                      transition: "background 0.2s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-tertiary)"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#FCFCFC"}
                  >
                    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                      <div className="mono" style={{ fontWeight: "700", color: "var(--text-accent)" }}>{res.id}</div>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ color: res.type === "Red Light" ? "var(--danger)" : "var(--text-primary)" }}>{res.type}</span>
                          <span className={`badge ${res.status.toLowerCase().replace(" ", "")}`} style={{ fontSize: "8px", padding: "1px 4px" }}>
                            {res.status}
                          </span>
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                          Cam: <strong>{res.cameraId}</strong> ({res.location}) | Ingest Time: <span className="mono">{new Date(res.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <div className="mono" style={{ 
                        fontWeight: "bold", 
                        background: "#FFF", 
                        border: "1px solid var(--border-accent-dark)", 
                        padding: "3px 8px", 
                        borderRadius: "4px",
                        letterSpacing: "0.5px"
                      }}>
                        {res.plateNumber}
                      </div>

                      <div className="mono" style={{ fontSize: "11px", fontWeight: "600" }}>{res.confidenceScore}%</div>

                      <Link href={`/review?id=${res.id}`} className="btn btn-secondary btn-sm" style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                        INSPECT <ChevronRightIcon size={12} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
