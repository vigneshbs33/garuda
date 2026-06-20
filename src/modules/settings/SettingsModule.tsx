"use client";

import React, { useState } from "react";
import { usePlatform, UserRole } from "@/context/PlatformContext";
import { SettingsIcon, UserIcon, ShieldIcon, CheckIcon, CloseIcon } from "@/components/Icons";

export default function SettingsModule() {
  const {
    role: activeUserRole,
    setRole,
    user: currentUser,
    usersList,
    auditLogs,
    updateUserRole
  } = usePlatform();

  const users = usersList;

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
          Configure security roles, audit user decisions, and view compliance system logs
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
                          disabled={!isAdmin || u.id === currentUser?.id}
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
