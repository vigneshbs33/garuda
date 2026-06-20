"use client";

import React, { useState } from "react";
import { usePlatform } from "@/context/PlatformContext";

export default function AuthModule() {
  const { login, register } = usePlatform();
  const [isLogin, setIsLogin] = useState(true);
  
  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Operator");

  // Notifications
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const success = await login(email, password);
        if (!success) {
          setError("Failed to sign in. Verify email is active and credentials are correct.");
        }
      } else {
        const msg = await register(name, email, password, role);
        if (msg.includes("simulate") || msg.toLowerCase().includes("success")) {
          setMessage(msg);
          setIsLogin(true); // Switch to login to enter verified account
        } else {
          setError(msg);
        }
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "80vh",
      padding: "20px",
      backgroundColor: "var(--bg-primary)"
    }}>
      <div style={{
        width: "100%",
        maxWidth: "400px",
        backgroundColor: "var(--card-bg)",
        border: "1px solid var(--border-color)",
        borderRadius: "8px",
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)",
        overflow: "hidden"
      }}>
        {/* Header decoration */}
        <div style={{
          height: "4px",
          backgroundColor: "var(--border-accent-dark)"
        }}></div>

        <div style={{ padding: "28px" }}>
          {/* Logo Title */}
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "var(--border-accent-dark)",
              fontWeight: "bold",
              color: "var(--text-accent)",
              fontSize: "18px",
              marginBottom: "8px"
            }}>
              G
            </div>
            <h2 style={{ fontSize: "18px", fontWeight: "700", letterSpacing: "-0.5px", margin: 0 }}>
              {isLogin ? "GARUDA CONTROL PORTAL" : "CREATE ENFORCEMENT ACCOUNT"}
            </h2>
            <p style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", marginTop: "2px" }}>
              {isLogin ? "Enter security credentials to log in" : "Register a new platform officer identity"}
            </p>
          </div>

          {/* Success / Error Alerts */}
          {message && (
            <div style={{
              backgroundColor: "#fef9c3",
              border: "1px solid #fef08a",
              color: "#854d0e",
              padding: "10px 12px",
              borderRadius: "4px",
              fontSize: "11px",
              marginBottom: "16px",
              lineHeight: "1.4"
            }}>
              <b>Registration Successful:</b> {message}
            </div>
          )}

          {error && (
            <div style={{
              backgroundColor: "#fee2e2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              padding: "10px 12px",
              borderRadius: "4px",
              fontSize: "11px",
              marginBottom: "16px",
              lineHeight: "1.4"
            }}>
              <b>Error:</b> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {!isLogin && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "10px", fontWeight: "600", color: "var(--text-secondary)" }}>FULL NAME</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  required 
                  placeholder="e.g. Officer Keshav"
                  style={{
                    padding: "8px 12px",
                    border: "1px solid var(--border-color)",
                    borderRadius: "4px",
                    fontSize: "12px",
                    outline: "none"
                  }}
                />
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "10px", fontWeight: "600", color: "var(--text-secondary)" }}>EMAIL ADDRESS</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                placeholder="e.g. keshav@enforcement.gov"
                style={{
                  padding: "8px 12px",
                  border: "1px solid var(--border-color)",
                  borderRadius: "4px",
                  fontSize: "12px",
                  outline: "none"
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "10px", fontWeight: "600", color: "var(--text-secondary)" }}>PASSWORD</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                placeholder="••••••••"
                style={{
                  padding: "8px 12px",
                  border: "1px solid var(--border-color)",
                  borderRadius: "4px",
                  fontSize: "12px",
                  outline: "none"
                }}
              />
            </div>

            {!isLogin && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "10px", fontWeight: "600", color: "var(--text-secondary)" }}>PLATFORM ROLE</label>
                <select 
                  value={role} 
                  onChange={(e) => setRole(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid var(--border-color)",
                    borderRadius: "4px",
                    fontSize: "12px",
                    outline: "none",
                    backgroundColor: "#FFFFFF"
                  }}
                >
                  <option value="Operator">Operator (Control Room)</option>
                  <option value="Reviewer">Reviewer (Enforcement Officer)</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Admin">System Administrator</option>
                </select>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="btn"
              style={{
                marginTop: "8px",
                padding: "10px",
                backgroundColor: "var(--border-accent-dark)",
                color: "var(--text-accent)",
                border: "none",
                borderRadius: "4px",
                fontWeight: "bold",
                fontSize: "12px",
                cursor: loading ? "not-allowed" : "pointer"
              }}
            >
              {loading ? "PROCESSING AUTH SECURELY..." : (isLogin ? "SIGN IN" : "REGISTER OFFICER")}
            </button>
          </form>

          {/* Switch links */}
          <div style={{ textAlign: "center", marginTop: "18px" }}>
            <button 
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
                setMessage(null);
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-accent)",
                fontSize: "11px",
                fontWeight: "600",
                cursor: "pointer",
                textDecoration: "underline"
              }}
            >
              {isLogin ? "Create an enforcement officer account instead" : "Have an active account? Sign In"}
            </button>
          </div>

          {/* Email Verification Config Notice */}
          <div style={{
            marginTop: "24px",
            padding: "10px",
            backgroundColor: "var(--bg-secondary)",
            borderRadius: "4px",
            border: "1px dashed var(--border-color)",
            fontSize: "9px",
            color: "var(--text-muted)",
            lineHeight: "1.4"
          }}>
            <b style={{ color: "var(--text-secondary)" }}>EMAIL SERVICE NOTICE:</b> Real-time email verification is active. Make sure SMTP keys are configured in your <code style={{ fontFamily: "monospace" }}>.env</code> file. Check your inbox (including spam) for the activation link. Seed accounts are pre-registered with password suffix <b>"123"</b> (e.g. <b>keshav@enforcement.gov</b> / <b>admin123</b>).
          </div>

        </div>
      </div>
    </div>
  );
}
