"use client";

import React, { useState } from "react";
import { usePlatform, UserRole } from "@/context/PlatformContext";
import { SettingsIcon, UserIcon, ShieldIcon, CheckIcon, CloseIcon } from "@/components/Icons";

interface UserRecord {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  status: "Active" | "Inactive";
  lastLogin: string;
}

export default function SettingsModule() {
  const { 
    role: activeUserRole, 
    setRole, 
    isSimulating, 
    setIsSimulating, 
    simulationInterval, 
    setSimulationInterval,
    usersList,
    auditLogs: backendAuditLogs,
    updateUserRole
  } = usePlatform();

  // Fallbacks in case API is offline
  const initialUsers: UserRecord[] = [
    { id: "USR-001", name: "Officer Keshav", role: "Admin", email: "keshav@enforcement.gov", status: "Active", lastLogin: "Today, 09:44 AM" },
    { id: "USR-002", name: "Analyst Priya", role: "Reviewer", email: "priya@enforcement.gov", status: "Active", lastLogin: "Today, 08:30 AM" },
    { id: "USR-003", name: "Supervisor Sanjay", role: "Supervisor", email: "sanjay@enforcement.gov", status: "Active", lastLogin: "Yesterday, 04:12 PM" },
    { id: "USR-004", name: "Operator Amit", role: "Operator", email: "amit@controlroom.gov", status: "Active", lastLogin: "Today, 06:15 AM" }
  ];

  const initialLogs = [
    { time: "2026-06-20T09:50:22Z", actor: "Officer Keshav", action: "CAMERA_REGISTERED", target: "CAM-101", details: "RTSP connection endpoint registered successfully" },
    { time: "2026-06-20T09:42:15Z", actor: "Supervisor Sanjay", action: "CITATION_APPROVED", target: "VIO-20260620-002", details: "Speed limit citation validated. License plate 9KX-452" },
    { time: "2026-06-20T09:30:10Z", actor: "Officer Keshav", action: "ROLE_PERMISSION_MODIFIED", target: "Operator", details: "Write access granted for batch uploads list" },
    { time: "2026-06-20T08:12:04Z", actor: "System Agent", action: "INFERENCE_FAILURE_RESOLVED", target: "YOLO Pipeline", details: "Memory leak cleared on GPU core #2" }
  ];

  const users = usersList && usersList.length > 0 ? usersList : initialUsers;
  const auditLogs = backendAuditLogs && backendAuditLogs.length > 0 ? backendAuditLogs : initialLogs;

  // Role permissions checklist structure
  const [permissionsMatrix, setPermissionsMatrix] = useState({
    Operator: { ingest: true, review: false, cameras: false, settings: false },
    Reviewer: { ingest: true, review: true, cameras: false, settings: false },
    Supervisor: { ingest: true, review: true, cameras: true, settings: false },
    Admin: { ingest: true, review: true, cameras: true, settings: true }
  });

  const handleRoleToggle = async (userId: string, newRole: UserRole) => {
    await updateUserRole(userId, newRole);
  };

  const toggleMatrixPermission = (roleKey: UserRole, permKey: "ingest" | "review" | "cameras" | "settings") => {
    // Only Admin can modify the matrix
    if (activeUserRole !== "Admin") {
      alert("Insufficient permissions: Only users in the Admin role can alter the System Privileges Matrix.");
      return;
    }

    setPermissionsMatrix(prev => {
      const updatedRole = { ...prev[roleKey] };
      updatedRole[permKey] = !updatedRole[permKey];
      return {
        ...prev,
        [roleKey]: updatedRole
      };
    });
  };

  // Check roles permissions
  const isAdmin = activeUserRole === "Admin";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px" }}>SYSTEM ADMINISTRATION & PRIVILEGES</h1>
        <p style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginTop: "2px" }}>
          Configure security roles, audit user decisions, view compliance system logs and toggle edge simulators
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        
        {/* Left Column Section: User roster & Simulator Toggles */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          
          {/* User list */}
          <div className="card">
            <div className="card-title">
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <UserIcon size={14} style={{ color: "var(--text-accent)" }} />
                <span>USER DIRECTORY ROSTER</span>
              </div>
            </div>

            <div className="table-container">
              <table className="dense-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Name</th>
                    <th>Security Role</th>
                    <th>Email Address</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td className="mono" style={{ fontSize: "11px" }}>{u.id}</td>
                      <td style={{ fontWeight: "600" }}>{u.name}</td>
                      <td>
                        <span className={`badge ${u.role === "Admin" ? "approved" : (u.role === "Supervisor" ? "escalated" : (u.role === "Reviewer" ? "review" : "detected"))}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: "11px" }}>{u.email}</td>
                      <td>
                        <select 
                          value={u.role}
                          onChange={(e) => handleRoleToggle(u.id, e.target.value as UserRole)}
                          disabled={!isAdmin || u.id === "USR-001"}
                          style={{
                            padding: "2px 4px",
                            fontSize: "10px",
                            border: "1px solid var(--border-color)",
                            borderRadius: "3px",
                            backgroundColor: "#FFF"
                          }}
                        >
                          <option value="Operator">Operator</option>
                          <option value="Reviewer">Reviewer</option>
                          <option value="Supervisor">Supervisor</option>
                          <option value="Admin">Admin</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Simulator configurations */}
          <div className="card" style={{ borderLeft: "3px solid var(--border-accent-dark)" }}>
            <div className="card-title">
              <span>REAL-TIME SIMULATION SPEED CONTROLLER</span>
              <span className="pulse-green"></span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontWeight: "600", fontSize: "12px" }}>Background Generator</span>
                  <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                    Simulates cars passing cameras and triggers traffic violation events.
                  </p>
                </div>
                <div>
                  <button 
                    onClick={() => setIsSimulating(!isSimulating)}
                    className={`btn btn-sm ${isSimulating ? "btn-success" : "btn-danger"}`}
                    style={{ fontWeight: "bold" }}
                  >
                    {isSimulating ? "SIMULATION RUNNING" : "SIMULATION PAUSED"}
                  </button>
                </div>
              </div>

              {isSimulating && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <span>Violation Spawning Frequency:</span>
                    <strong className="mono">{simulationInterval / 1000} seconds</strong>
                  </div>
                  <input 
                    type="range"
                    min="3000"
                    max="30000"
                    step="1000"
                    value={simulationInterval}
                    onChange={(e) => setSimulationInterval(parseInt(e.target.value))}
                    style={{ cursor: "pointer", accentColor: "var(--border-accent-dark)" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--text-muted)" }}>
                    <span>FAST (3s)</span>
                    <span>SLOW (30s)</span>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column Section: Permissions Matrix & Audit Log */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          
          {/* Permission grid matrix */}
          <div className="card">
            <div className="card-title">
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <ShieldIcon size={14} style={{ color: "var(--text-accent)" }} />
                <span>SYSTEM PRIVILEGES MATRIX (ROLE-BASED)</span>
              </div>
            </div>

            <table className="permission-matrix" style={{ fontSize: "11px" }}>
              <thead>
                <tr>
                  <th>Privilege / Permission</th>
                  <th>Operator</th>
                  <th>Reviewer</th>
                  <th>Supervisor</th>
                  <th>Admin</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Ingest Evidence Media</td>
                  <td onClick={() => toggleMatrixPermission("Operator", "ingest")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Operator.ingest ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                  <td onClick={() => toggleMatrixPermission("Reviewer", "ingest")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Reviewer.ingest ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                  <td onClick={() => toggleMatrixPermission("Supervisor", "ingest")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Supervisor.ingest ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                  <td onClick={() => toggleMatrixPermission("Admin", "ingest")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Admin.ingest ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                </tr>
                <tr>
                  <td>Review Citation (Confirm/Reject)</td>
                  <td onClick={() => toggleMatrixPermission("Operator", "review")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Operator.review ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                  <td onClick={() => toggleMatrixPermission("Reviewer", "review")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Reviewer.review ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                  <td onClick={() => toggleMatrixPermission("Supervisor", "review")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Supervisor.review ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                  <td onClick={() => toggleMatrixPermission("Admin", "review")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Admin.review ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                </tr>
                <tr>
                  <td>Configure RTSP Streams</td>
                  <td onClick={() => toggleMatrixPermission("Operator", "cameras")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Operator.cameras ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                  <td onClick={() => toggleMatrixPermission("Reviewer", "cameras")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Reviewer.cameras ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                  <td onClick={() => toggleMatrixPermission("Supervisor", "cameras")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Supervisor.cameras ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                  <td onClick={() => toggleMatrixPermission("Admin", "cameras")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Admin.cameras ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                </tr>
                <tr>
                  <td>Modify Global Registry Matrix</td>
                  <td onClick={() => toggleMatrixPermission("Operator", "settings")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Operator.settings ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                  <td onClick={() => toggleMatrixPermission("Reviewer", "settings")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Reviewer.settings ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                  <td onClick={() => toggleMatrixPermission("Supervisor", "settings")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Supervisor.settings ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                  <td onClick={() => toggleMatrixPermission("Admin", "settings")} style={{ cursor: isAdmin ? "pointer" : "default" }}>
                    {permissionsMatrix.Admin.settings ? <CheckIcon size={14} style={{ color: "var(--success)" }} /> : <CloseIcon size={14} style={{ color: "var(--danger)" }} />}
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "8px", fontStyle: "italic", textAlign: "right" }}>
              * Operator toggling matrix permissions requires Admin role access overrides.
            </div>
          </div>

          {/* Compliance Audit log ticker */}
          <div className="card">
            <div className="card-title">
              <span>COMPLIANCE AUDIT AUDIT-READY RECORDINGS</span>
            </div>

            <div className="table-container" style={{ maxHeight: "150px", overflowY: "auto" }}>
              <table className="dense-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Actor</th>
                    <th>Action Code</th>
                    <th>Target Entity</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log, idx) => (
                    <tr key={idx}>
                      <td className="mono" style={{ fontSize: "9px" }}>
                        {new Date(log.time).toLocaleTimeString()}
                      </td>
                      <td style={{ fontWeight: "600" }}>{log.actor}</td>
                      <td>
                        <span className="mono" style={{ 
                          fontSize: "9px", 
                          padding: "1px 4px", 
                          backgroundColor: "#f1f5f9", 
                          border: "1px solid var(--border-color)", 
                          borderRadius: "3px",
                          fontWeight: "bold"
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }} title={log.details}>
                        {log.target}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
