"use client";

import React, { useEffect, useRef, useState } from "react";

interface SubmissionLog {
  violation_id: string;
  violation_type: string;
  plate_text: string;
  location: string;
  timestamp: string;
  status: string;
}

export default function PublicPage() {
  const [activeTab, setActiveTab] = useState<"report" | "submissions">("report");
  const [submissions, setSubmissions] = useState<SubmissionLog[]>([]);
  
  // Camera & Stream states - ACTIVE BY DEFAULT (No resistance)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  
  const [active, setActive] = useState(true);
  const [cameraLabel, setCameraLabel] = useState<string>("Initializing Camera...");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [annotatedFrame, setAnnotatedFrame] = useState<string | null>(null);
  
  // Simulated Feed states
  const [isSimulatedCamera, setIsSimulatedCamera] = useState(false);
  const simIntervalRef = useRef<any>(null);
  
  // Snapshot/Edit form state
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    violation_id: "",
    violation_type: "No Helmet",
    plate_text: "",
    location: "Public Edge Capture",
    severity: "medium"
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Auto-alert state from WS
  const [violationAlertActive, setViolationAlertActive] = useState(false);

  // Initialize camera list and auto-select BACK camera
  useEffect(() => {
    const listDevices = async () => {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devs.filter(d => d.kind === "videoinput");
        setDevices(videoDevs);
        
        // Auto-select BACK camera (environment facing) if present
        const backCam = videoDevs.find(d => 
          d.label.toLowerCase().includes("back") || 
          d.label.toLowerCase().includes("rear") || 
          d.label.toLowerCase().includes("environment") || 
          d.label.toLowerCase().includes("outward")
        );
        
        if (backCam) {
          setSelectedDeviceId(backCam.deviceId);
          console.log("Auto-selected BACK camera:", backCam.label);
        } else if (videoDevs.length > 0) {
          setSelectedDeviceId(videoDevs[0].deviceId);
          console.log("No explicit back camera found. Defaulting to first device.");
        }
      } catch (e) {
        console.error("Error listing camera devices:", e);
      }
    };
    listDevices();
    loadSubmissions();
  }, []);

  // Load submissions from localStorage and refresh statuses
  const loadSubmissions = async () => {
    try {
      const stored = localStorage.getItem("garuda_public_submissions");
      if (stored) {
        const list: SubmissionLog[] = JSON.parse(stored);
        setSubmissions(list);
        
        // Refresh statuses in background
        const updatedList = await Promise.all(
          list.map(async (item) => {
            try {
              const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
              const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "https" : "http";
              const res = await fetch(`${protocol}://${host}:8000/api/v1/violations/${item.violation_id}`);
              if (res.ok) {
                const data = await res.json();
                return { ...item, status: data.status };
              }
            } catch (e) {
              console.error(`Error checking status for ${item.violation_id}:`, e);
            }
            return item;
          })
        );
        setSubmissions(updatedList);
        localStorage.setItem("garuda_public_submissions", JSON.stringify(updatedList));
      }
    } catch (err) {
      console.error("Error reading submissions from local storage:", err);
    }
  };

  // Manage streams & socket
  useEffect(() => {
    if (!active) {
      stopFeeds();
      return;
    }

    setStreamError(null);
    setSubmitSuccess(null);
    setSubmitError(null);

    // Connect to backend WebSocket for real-time annotations
    const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
    const wsProtocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${wsProtocol}://${host}:8000/ws/patrol`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.frame) {
          setAnnotatedFrame(data.frame);
        }
        if (data.violation) {
          setViolationAlertActive(true);
          playBeep();
          
          // Prefill editing form with auto-detected violation
          const generatedId = `VIO-PUB-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
          setEditForm({
            violation_id: generatedId,
            violation_type: mapViolationType(data.violation.type),
            plate_text: data.violation.plate || "",
            location: editForm.location,
            severity: "medium"
          });
          setCapturedFrame(data.frame);
          setIsEditing(true);
          
          setTimeout(() => {
            setViolationAlertActive(false);
          }, 3500);
        }
      } catch (e) {
        console.error("Error parsing patrol WS returned frames:", e);
      }
    };

    if (isSimulatedCamera) {
      startSimulatedInference();
    } else {
      startWebcamStream();
    }

    return () => {
      stopFeeds();
    };
  }, [active, selectedDeviceId, isSimulatedCamera]);

  const mapViolationType = (rawType: string): string => {
    const list = ["No Helmet", "Speeding", "Seatbelt", "Red Light", "Wrong Way", "Illegal Parking"];
    const found = list.find(l => l.toLowerCase() === rawType.toLowerCase() || rawType.toLowerCase().includes(l.toLowerCase()));
    return found || "No Helmet";
  };

  const startWebcamStream = async () => {
    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId 
          ? { deviceId: { exact: selectedDeviceId }, width: 1280, height: 720 } 
          : { facingMode: { ideal: "environment" }, width: 1280, height: 720 }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        const activeTrack = stream.getVideoTracks()[0];
        setCameraLabel(activeTrack.label || "Device Rear Camera");
      }

      startCaptureLoop();
    } catch (err: any) {
      console.error("getUserMedia error:", err);
      // Fallback constraint if exact device fails (common on some mobiles)
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "environment" } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.play();
          setCameraLabel("Device Camera (Auto-Fallback)");
        }
        startCaptureLoop();
      } catch (fbErr) {
        setStreamError("Webcam access blocked or device unavailable. Switching to Simulated Radar Fallback.");
        setIsSimulatedCamera(true);
      }
    }
  };

  const startCaptureLoop = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    const interval = setInterval(() => {
      if (video.paused || video.ended || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      
      socketRef.current.send(JSON.stringify({
        frame: dataUrl,
        camera_id: "PUBLIC-PORTAL",
        location: editForm.location
      }));
    }, 200);

    simIntervalRef.current = interval;
  };

  const startSimulatedInference = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    setCameraLabel("Virtual Simulated Radar Scope");

    let degrees = 0;
    const interval = setInterval(() => {
      if (!ctx || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

      ctx.fillStyle = "#090D1A";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "rgba(234, 179, 8, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 160, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 80, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.strokeStyle = "rgba(234, 179, 8, 0.75)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -160);
      ctx.stroke();
      ctx.restore();

      degrees = (degrees + 6) % 360;

      ctx.fillStyle = "#E2E8F0";
      const carOffset = (degrees * 1.5) % (canvas.width + 100) - 50;
      ctx.fillRect(carOffset, canvas.height / 2 - 10, 45, 20);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      socketRef.current.send(JSON.stringify({
        frame: dataUrl,
        camera_id: "PUBLIC-SIM-01",
        location: editForm.location
      }));
    }, 200);

    simIntervalRef.current = interval;
  };

  const stopFeeds = () => {
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setAnnotatedFrame(null);
  };

  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      console.log("AudioContext blocked:", e);
    }
  };

  // Manual snapshot capture
  const handleManualCapture = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    let frameData: string | null = null;
    if (isSimulatedCamera && canvas) {
      frameData = canvas.toDataURL("image/jpeg", 0.8);
    } else if (video && canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      frameData = canvas.toDataURL("image/jpeg", 0.8);
    }

    if (frameData) {
      const generatedId = `VIO-PUB-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      setEditForm(prev => ({
        ...prev,
        violation_id: generatedId,
        plate_text: prev.plate_text || ""
      }));
      setCapturedFrame(frameData);
      setIsEditing(true);
      setSubmitSuccess(null);
      setSubmitError(null);
    }
  };

  // Submit report to backend
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.plate_text.trim()) {
      setSubmitError("Please enter a valid License Plate number.");
      return;
    }

    setIsSubmitting(true);
    setSubmitSuccess(null);
    setSubmitError(null);

    try {
      const payload = {
        violation_id: editForm.violation_id,
        violation_type: editForm.violation_type,
        plate_text: editForm.plate_text.toUpperCase().trim(),
        location: editForm.location,
        severity: editForm.severity,
        frame_b64: capturedFrame
      };

      const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "https" : "http";
      const res = await fetch(`${protocol}://${host}:8000/api/v1/violations/public-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setSubmitSuccess(`Report ${editForm.violation_id} submitted!`);
        
        const newLog: SubmissionLog = {
          violation_id: editForm.violation_id,
          violation_type: editForm.violation_type,
          plate_text: editForm.plate_text.toUpperCase().trim(),
          location: editForm.location,
          timestamp: new Date().toLocaleString(),
          status: "pending"
        };
        
        const updated = [newLog, ...submissions];
        setSubmissions(updated);
        localStorage.setItem("garuda_public_submissions", JSON.stringify(updated));
        
        // Auto-close form on successful submit
        setIsEditing(false);
        setCapturedFrame(null);
      } else {
        const errorData = await res.json();
        setSubmitError(errorData.detail || "Failed to submit public report to central systems.");
      }
    } catch (err) {
      setSubmitError("Connection to backend server failed. Make sure the API service is online.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      position: "relative",
      backgroundColor: "#000000",
      fontFamily: "var(--font-sans)",
      color: "#FFFFFF",
      overflow: "hidden"
    }}>
      
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 600px) {
          .public-bottom-bar {
            flex-direction: column !important;
            gap: 16px !important;
            align-items: center !important;
            padding-bottom: 30px !important;
            background: linear-gradient(to top, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.8) 70%, rgba(0,0,0,0) 100%) !important;
          }
          .public-right-controls {
            align-items: center !important;
            width: 100% !important;
            flex-direction: row !important;
            justify-content: center !important;
            gap: 12px !important;
          }
          .public-right-controls select {
            width: 50% !important;
          }
          .public-right-controls button {
            width: 50% !important;
          }
          .public-form-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
        }
      `}} />
      
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} width={640} height={480} style={{ display: "none" }} />

      {activeTab === "report" ? (
        /* ==================== IMMERSIVE FULL SCREEN VIEWPORT ==================== */
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
          
          {/* Warning strobe pulse overlay */}
          {violationAlertActive && (
            <div style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "rgba(239, 68, 68, 0.3)",
              animation: "pulse 0.4s infinite alternate",
              zIndex: 8,
              pointerEvents: "none"
            }} />
          )}

          {/* Native HTML5 Video Element */}
          <video 
            ref={videoRef}
            playsInline
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              position: "absolute",
              inset: 0,
              zIndex: 1,
              display: annotatedFrame ? "none" : "block"
            }}
          />

          {/* AI Annotated Return Stream Frame */}
          {annotatedFrame && (
            <img 
              src={annotatedFrame} 
              alt="AI Camera View" 
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                position: "absolute",
                inset: 0,
                zIndex: 2,
                display: "block"
              }}
            />
          )}

          {/* HUD OVERLAY - TOP PANEL */}
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.0) 100%)",
            padding: "20px 16px",
            zIndex: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <div>
              <h2 style={{ fontSize: "14px", fontWeight: "800", letterSpacing: "1px", margin: 0, color: "var(--border-accent-dark)" }}>
                GARUDA EDGE REPORTER
              </h2>
              <p style={{ fontSize: "9px", opacity: 0.8, margin: 0, textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>
                Active: {cameraLabel}
              </p>
            </div>
            
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{
                fontSize: "9px",
                backgroundColor: "rgba(22, 163, 74, 0.25)",
                color: "#4ADE80",
                border: "1px solid #22C55E",
                padding: "3px 8px",
                borderRadius: "12px",
                fontWeight: "700",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}>
                <span className="pulse-green" style={{ width: "6px", height: "6px", backgroundColor: "#22C55E", borderRadius: "50%" }}></span>
                REAL-TIME AI
              </span>
            </div>
          </div>

          {/* FLOATING ACTION CONTROL BAR - BOTTOM */}
          <div className="public-bottom-bar" style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.0) 100%)",
            padding: "24px 16px 40px 16px",
            zIndex: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            
            {/* Left: View Log Button */}
            <button 
              onClick={() => {
                setActiveTab("submissions");
                loadSubmissions();
              }}
              style={{
                background: "rgba(15, 23, 42, 0.85)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "50%",
                width: "48px",
                height: "48px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: "2px",
                transition: "transform 0.1s"
              }}
            >
              <span style={{ fontSize: "16px" }}>📋</span>
              <span style={{ fontSize: "7px", fontWeight: "700" }}>LOGS ({submissions.length})</span>
            </button>

            {/* Center: BIG Floating Capture Button */}
            <button 
              onClick={handleManualCapture}
              style={{
                width: "76px",
                height: "76px",
                borderRadius: "50%",
                backgroundColor: "#FFFFFF",
                border: "6px solid var(--border-accent-dark)",
                cursor: "pointer",
                boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
                outline: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: "scale(1)",
                transition: "transform 0.1s, background-color 0.1s"
              }}
              onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.92)"}
              onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
            >
              <div style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                backgroundColor: "var(--border-accent-dark)"
              }} />
            </button>

            {/* Right: Camera Hardware Selector & Simulation Options */}
            <div className="public-right-controls" style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
              
              {devices.length > 1 && (
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    setIsSimulatedCamera(false);
                    setSelectedDeviceId(e.target.value);
                  }}
                  disabled={isSimulatedCamera}
                  style={{
                    background: "rgba(15, 23, 42, 0.85)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "4px",
                    padding: "4px 8px",
                    fontSize: "10px",
                    color: "#FFF",
                    outline: "none"
                  }}
                >
                  {devices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId} style={{ color: "#000" }}>
                      {d.label ? `Cam: ${d.label.slice(0, 12)}...` : `Camera ${i+1}`}
                    </option>
                  ))}
                </select>
              )}

              <button 
                onClick={() => setIsSimulatedCamera(!isSimulatedCamera)}
                style={{
                  background: isSimulatedCamera ? "var(--border-accent-dark)" : "rgba(15, 23, 42, 0.85)",
                  color: isSimulatedCamera ? "#000000" : "#FFFFFF",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
              >
                {isSimulatedCamera ? "USING RADAR EMULATION" : "USE RADAR SIM FALLBACK"}
              </button>

            </div>
          </div>

          {/* Quick Success Toast */}
          {submitSuccess && (
            <div style={{
              position: "absolute",
              top: "90px",
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "rgba(22, 163, 74, 0.95)",
              color: "#FFF",
              padding: "8px 16px",
              borderRadius: "20px",
              fontSize: "11px",
              fontWeight: "bold",
              zIndex: 100,
              boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
              animation: "fadeIn 0.3s ease-out"
            }}>
              ✓ {submitSuccess}
            </div>
          )}

          {/* ==================== SLIDE-UP BOTTOM SHEET EDIT PANEL ==================== */}
          {isEditing && capturedFrame && (
            <div style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "rgba(15, 23, 42, 0.96)",
              backdropFilter: "blur(8px)",
              color: "#FFFFFF",
              borderTop: "3px solid var(--border-accent-dark)",
              borderTopLeftRadius: "16px",
              borderTopRightRadius: "16px",
              padding: "20px 16px 32px 16px",
              zIndex: 50,
              boxShadow: "0 -8px 30px rgba(0,0,0,0.5)",
              maxHeight: "82vh",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "14px"
            }}>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ fontSize: "13px", fontWeight: "800", color: "var(--border-accent-dark)", margin: 0 }}>
                    VERIFY EVIDENCE CITATION
                  </h3>
                  <p style={{ fontSize: "9px", color: "#94A3B8", margin: "2px 0 0 0" }}>
                    Confirm the license plate text and category matching the captured frame.
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setIsEditing(false);
                    setCapturedFrame(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#94A3B8",
                    fontSize: "16px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    padding: "4px"
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Form Grid */}
              <form onSubmit={handleSubmitReport} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                
                {/* Snapshot display crop */}
                <div style={{
                  width: "100%",
                  height: "130px",
                  borderRadius: "6px",
                  overflow: "hidden",
                  backgroundColor: "#000",
                  border: "1px solid rgba(255,255,255,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <img src={capturedFrame} alt="Snapshot crop" style={{ height: "100%", objectFit: "contain" }} />
                </div>

                <div className="public-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                    <label style={{ fontSize: "8px", fontWeight: "bold", color: "#94A3B8" }}>
                      DETECTED LICENSE PLATE *
                    </label>
                    <input 
                      type="text"
                      value={editForm.plate_text}
                      onChange={(e) => setEditForm({ ...editForm, plate_text: e.target.value.toUpperCase() })}
                      required
                      placeholder="ENTER REG NUMBER"
                      style={{
                        padding: "8px",
                        border: "2px solid var(--border-accent-dark)",
                        borderRadius: "4px",
                        fontSize: "12px",
                        color: "#FFFFFF",
                        backgroundColor: "#1E293B",
                        fontFamily: "var(--font-mono)",
                        fontWeight: "bold",
                        outline: "none"
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                    <label style={{ fontSize: "8px", fontWeight: "bold", color: "#94A3B8" }}>
                      VIOLATION CATEGORY
                    </label>
                    <select
                      value={editForm.violation_type}
                      onChange={(e) => setEditForm({ ...editForm, violation_type: e.target.value })}
                      style={{
                        padding: "8px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: "4px",
                        fontSize: "12px",
                        color: "#FFFFFF",
                        backgroundColor: "#1E293B",
                        outline: "none"
                      }}
                    >
                      <option value="No Helmet">No Helmet (Rider)</option>
                      <option value="Speeding">Speeding Violation</option>
                      <option value="Seatbelt">Seatbelt Non-Compliance</option>
                      <option value="Red Light">Red Light Run-through</option>
                      <option value="Wrong Way">Wrong Way Driving</option>
                      <option value="Illegal Parking">Illegal Parking / Obstruction</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                    <label style={{ fontSize: "8px", fontWeight: "bold", color: "#94A3B8" }}>
                      SEVERITY LEVEL
                    </label>
                    <select
                      value={editForm.severity}
                      onChange={(e) => setEditForm({ ...editForm, severity: e.target.value })}
                      style={{
                        padding: "8px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: "4px",
                        fontSize: "12px",
                        color: "#FFFFFF",
                        backgroundColor: "#1E293B",
                        outline: "none"
                      }}
                    >
                      <option value="low">Low Severity</option>
                      <option value="medium">Medium Severity</option>
                      <option value="high">High Severity</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                    <label style={{ fontSize: "8px", fontWeight: "bold", color: "#94A3B8" }}>
                      CAMERA LOCATION
                    </label>
                    <input 
                      type="text"
                      value={editForm.location}
                      onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                      style={{
                        padding: "8px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: "4px",
                        fontSize: "12px",
                        color: "#FFFFFF",
                        backgroundColor: "#1E293B",
                        outline: "none"
                      }}
                    />
                  </div>

                </div>

                {submitError && (
                  <div style={{
                    backgroundColor: "rgba(239, 68, 68, 0.2)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#FCA5A5",
                    padding: "8px",
                    borderRadius: "4px",
                    fontSize: "10px"
                  }}>
                    {submitError}
                  </div>
                )}

                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    style={{
                      flex: 1,
                      padding: "10px",
                      backgroundColor: "var(--border-accent-dark)",
                      color: "#000000",
                      border: "none",
                      borderRadius: "4px",
                      fontWeight: "800",
                      fontSize: "11px",
                      cursor: isSubmitting ? "not-allowed" : "pointer"
                    }}
                  >
                    {isSubmitting ? "TRANSMITTING CITATION..." : "DISPATCH CITATION EVIDENCE"}
                  </button>
                </div>

              </form>

            </div>
          )}

        </div>
      ) : (
        /* ==================== SLEEK DARK SUBMISSIONS VIEW ==================== */
        <div style={{
          width: "100%",
          height: "100%",
          backgroundColor: "#090D16",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          overflowY: "auto"
        }}>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ fontSize: "14px", fontWeight: "800", color: "var(--border-accent-dark)", margin: 0 }}>
                SUBMITTED CITATION INDEX
              </h2>
              <p style={{ fontSize: "9px", color: "#94A3B8", margin: "2px 0 0 0" }}>
                Roster of public captures logged in local browser memory.
              </p>
            </div>
            
            <button 
              onClick={() => setActiveTab("report")}
              style={{
                padding: "6px 12px",
                backgroundColor: "rgba(255,255,255,0.1)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "4px",
                fontWeight: "bold",
                fontSize: "10px",
                cursor: "pointer"
              }}
            >
              📹 CAMERA STREAM
            </button>
          </div>

          {submissions.length === 0 ? (
            <div style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "60px 10px",
              color: "#64748B",
              border: "1px dashed rgba(255,255,255,0.1)",
              borderRadius: "8px",
              marginTop: "20px"
            }}>
              <span style={{ fontSize: "32px", marginBottom: "8px" }}>📋</span>
              <div style={{ fontWeight: "700", fontSize: "11px", color: "#94A3B8" }}>NO DISPATCHED SUBMISSIONS</div>
              <p style={{ fontSize: "9px", margin: "2px 0 0 0", textAlign: "center" }}>
                Navigate back to the camera stream to snap and send violations.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {submissions.map((item, index) => (
                <div key={index} style={{
                  backgroundColor: "#111827",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: "6px",
                  padding: "12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: "bold", fontSize: "12px", color: "#F3F4F6" }}>
                        {item.plate_text}
                      </span>
                      <span style={{
                        fontSize: "8px",
                        backgroundColor: "rgba(234,179,8,0.15)",
                        color: "var(--border-accent-dark)",
                        padding: "1px 5px",
                        borderRadius: "3px",
                        fontWeight: "600",
                        textTransform: "uppercase"
                      }}>
                        {item.violation_type}
                      </span>
                    </div>
                    <div style={{ fontSize: "9px", color: "#64748B", marginTop: "4px" }}>
                      ID: {item.violation_id} • Ingested: {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>

                  <div>
                    <span className={`badge ${
                      item.status === "confirmed" || item.status === "auto_challan"
                        ? "approved"
                        : item.status === "rejected"
                        ? "rejected"
                        : "review"
                    }`} style={{ fontSize: "9px", padding: "3px 8px" }}>
                      {item.status === "confirmed" || item.status === "auto_challan"
                        ? "Verified"
                        : item.status === "rejected"
                        ? "Rejected"
                        : "Review Queue"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

    </div>
  );
}
