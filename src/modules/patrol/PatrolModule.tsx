"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePlatform } from "@/context/PlatformContext";

export default function PatrolModule() {
  const { isBackendConnected } = usePlatform();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  
  const [active, setActive] = useState(false);
  const [cameraLabel, setCameraLabel] = useState<string>("Initializing Camera...");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [streamError, setStreamError] = useState<string | null>(null);

  // Annotated Return States
  const [annotatedFrame, setAnnotatedFrame] = useState<string | null>(null);
  const [recentViolation, setRecentViolation] = useState<{
    violation_id: string;
    type: string;
    plate: string;
    confidence: number;
  } | null>(null);
  const [violationAlertActive, setViolationAlertActive] = useState(false);

  // Simulated Feed states (in case webcam permission denied)
  const [isSimulatedCamera, setIsSimulatedCamera] = useState(false);
  const simIntervalRef = useRef<any>(null);

  // Initialize camera list
  useEffect(() => {
    const listDevices = async () => {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devs.filter(d => d.kind === "videoinput");
        setDevices(videoDevs);
        if (videoDevs.length > 0) {
          setSelectedDeviceId(videoDevs[0].deviceId);
        }
      } catch (e) {
        console.error("Error listing camera devices:", e);
      }
    };
    listDevices();
  }, []);

  // Request camera and open WebSocket connection when active
  useEffect(() => {
    if (!active) {
      stopFeeds();
      return;
    }

    setStreamError(null);
    setRecentViolation(null);

    // 1. Establish Patrol WebSocket
    const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
    const wsProtocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${wsProtocol}://${host}:8000/ws/patrol`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log("Patrol WebSocket connection open.");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.frame) {
          setAnnotatedFrame(data.frame);
        }
        if (data.violation) {
          setRecentViolation(data.violation);
          setViolationAlertActive(true);
          // Play a simulated warning sound (beep using browser AudioContext)
          playBeep();
          setTimeout(() => {
            setViolationAlertActive(false);
          }, 3500);
        }
      } catch (e) {
        console.error("Error parsing patrol WS returned frames:", e);
      }
    };

    ws.onerror = (e) => {
      console.error("Patrol WebSocket encountered an error:", e);
    };

    ws.onclose = () => {
      console.log("Patrol WebSocket connection closed.");
    };

    // 2. Start Video Source
    if (isSimulatedCamera) {
      startSimulatedInference();
    } else {
      startWebcamStream();
    }

    return () => {
      stopFeeds();
    };
  }, [active, selectedDeviceId, isSimulatedCamera]);

  const startWebcamStream = async () => {
    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId 
          ? { deviceId: { exact: selectedDeviceId }, width: 640, height: 480 } 
          : { facingMode: "environment", width: 640, height: 480 }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        const activeTrack = stream.getVideoTracks()[0];
        setCameraLabel(activeTrack.label || "Rear/Device Camera");
      }

      // Start frame capture loop at 5 FPS
      startCaptureLoop();
    } catch (err: any) {
      console.error("getUserMedia error:", err);
      setStreamError("Webcam access blocked or device unavailable. Switching to Simulated Radar Fallback.");
      setIsSimulatedCamera(true);
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
        camera_id: "PATROL-EDGE-01",
        location: "Mobile Patrol (Sector 4)"
      }));
    }, 200); // 5 FPS (200ms interval)

    simIntervalRef.current = interval;
  };

  const startSimulatedInference = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    setCameraLabel("Virtual Simulated Cam Feed");

    let degrees = 0;
    const interval = setInterval(() => {
      if (!ctx || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

      // Draw a simulated high-tech radar scanning graphic onto the canvas
      ctx.fillStyle = "#0F172A";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Radar lines
      ctx.strokeStyle = "#FEF08A";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 120, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 60, 0, 2 * Math.PI);
      ctx.stroke();

      // Sweeping radar hand
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.strokeStyle = "rgba(254, 240, 138, 0.4)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -120);
      ctx.stroke();
      ctx.restore();

      degrees = (degrees + 6) % 360;

      // Draw simulated vehicles moving
      ctx.fillStyle = "#E2E8F0";
      const carOffset = (degrees * 1.5) % (canvas.width + 100) - 50;
      ctx.fillRect(carOffset, canvas.height / 2 - 10, 45, 20);

      // Send to WebSocket
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      socketRef.current.send(JSON.stringify({
        frame: dataUrl,
        camera_id: "PATROL-SIM-01",
        location: "Edge Sim Radar (Sector 4)"
      }));
    }, 200);

    simIntervalRef.current = interval;
  };

  const stopFeeds = () => {
    // Stop loops
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }

    // Stop Webcam stream
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }

    // Close socket
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
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch A5
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      console.log("AudioContext blocked or uninitialized:", e);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "600px", margin: "0 auto" }}>
      <div>
        <h1 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px" }}>POLICE MOBILE PATROL CCTV</h1>
        <p style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginTop: "2px" }}>
          Tap and stream live vehicle scans to centralized artificial intelligence models instantly
        </p>
      </div>

      {/* Main Stream Viewfinder */}
      <div className="card" style={{ 
        position: "relative",
        padding: 0,
        backgroundColor: "#000000",
        borderRadius: "8px",
        overflow: "hidden",
        aspectRatio: "4/3",
        border: violationAlertActive ? "3px solid var(--danger)" : "1px solid var(--border-color)",
        transition: "border 0.2s"
      }}>
        {/* Warning Strobe Overlay */}
        {violationAlertActive && (
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(239, 68, 68, 0.25)",
            animation: "pulse 0.4s infinite alternate",
            zIndex: 10,
            pointerEvents: "none"
          }}></div>
        )}

        {/* Viewfinder Video elements */}
        {!active ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "var(--text-muted)",
            gap: "10px",
            padding: "20px",
            textAlign: "center"
          }}>
            <div style={{ fontSize: "36px" }}>📹</div>
            <div style={{ fontWeight: "600", fontSize: "13px" }}>CAMERA FEED OFFLINE</div>
            <p style={{ fontSize: "11px", maxWidth: "300px" }}>
              Tap the security switch below to initialize camera scopes and bind active AI recognition protocols.
            </p>
          </div>
        ) : (
          <>
            {/* Native video preview (hidden when annotated returns exist) */}
            <video 
              ref={videoRef}
              playsInline
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: annotatedFrame ? "none" : "block"
              }}
            />
            
            {/* Canvas for processing frames */}
            <canvas 
              ref={canvasRef} 
              width={640} 
              height={480} 
              style={{ display: "none" }} 
            />

            {/* Live returning AI frame */}
            {annotatedFrame && (
              <img 
                src={annotatedFrame} 
                alt="AI Detection Feed" 
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block"
                }}
              />
            )}

            {/* Viewfinder HUD Overlays */}
            <div style={{
              position: "absolute",
              top: "12px",
              left: "12px",
              backgroundColor: "rgba(15, 23, 42, 0.75)",
              color: "#FFFFFF",
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              pointerEvents: "none",
              zIndex: 5
            }}>
              CAM: {cameraLabel}
            </div>

            <div style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              backgroundColor: "rgba(15, 23, 42, 0.75)",
              color: isBackendConnected ? "#FEF08A" : "#EF4444",
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "10px",
              fontWeight: "bold",
              pointerEvents: "none",
              zIndex: 5,
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}>
              <span className={isBackendConnected ? "pulse-green" : "pulse-red"} style={{ width: "6px", height: "6px" }}></span>
              {isBackendConnected ? "AI PIPELINE: COMPILING" : "OFFLINE FALLBACK"}
            </div>

            {/* Bouncing radar sweep indicator */}
            <div style={{
              position: "absolute",
              bottom: "12px",
              left: "12px",
              color: "rgba(255, 255, 255, 0.5)",
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              zIndex: 5
            }}>
              STREAM: 5.0 FPS | 640x480px
            </div>
          </>
        )}
      </div>

      {/* Interactive Controls Panel */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontWeight: "600", fontSize: "13px" }}>PATROL STREAM ACTIVATION</span>
            <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
              Toggle video feeds and camera sources dynamically.
            </p>
          </div>
          <div>
            <button 
              onClick={() => setActive(!active)}
              className={`btn ${active ? "btn-danger" : "btn-success"}`}
              style={{ fontWeight: "bold", padding: "8px 16px" }}
            >
              {active ? "TERMINATE TRANSMISSION" : "INITIALIZE LIVE CAMERA"}
            </button>
          </div>
        </div>

        {active && (
          <div style={{ marginTop: "12px", borderTop: "1px solid var(--border-color)", paddingTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            
            {/* Stream source selector */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", fontWeight: "600" }}>SELECT CAPTURE HARDWARE:</span>
              <select 
                value={selectedDeviceId}
                onChange={(e) => {
                  setIsSimulatedCamera(false);
                  setSelectedDeviceId(e.target.value);
                }}
                disabled={isSimulatedCamera}
                style={{
                  padding: "4px 8px",
                  fontSize: "11px",
                  border: "1px solid var(--border-color)",
                  borderRadius: "4px"
                }}
              >
                {devices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 4)}`}</option>
                ))}
              </select>
            </div>

            {/* Simulation toggle if camera access fails */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", fontWeight: "600" }}>EMBEDDED RADAR SIMULATOR:</span>
              <button 
                onClick={() => setIsSimulatedCamera(!isSimulatedCamera)}
                className="btn btn-sm"
                style={{ 
                  fontSize: "10px", 
                  fontWeight: "bold",
                  backgroundColor: isSimulatedCamera ? "var(--border-accent-dark)" : "#E2E8F0"
                }}
              >
                {isSimulatedCamera ? "USING SIMULATED RADAR" : "USE VIRTUAL FALLBACK"}
              </button>
            </div>

            {streamError && (
              <div style={{
                backgroundColor: "#fef9c3",
                border: "1px solid #fef08a",
                color: "#854d0e",
                padding: "8px 10px",
                borderRadius: "4px",
                fontSize: "10px"
              }}>
                {streamError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Violation Citation Log Card */}
      {recentViolation && (
        <div className="card" style={{
          borderLeft: "4px solid var(--danger)",
          backgroundColor: "#fef2f2",
          animation: "slideIn 0.3s ease-out"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <span style={{ 
                backgroundColor: "var(--danger)",
                color: "#FFFFFF",
                fontSize: "9px",
                fontWeight: "bold",
                padding: "2px 6px",
                borderRadius: "3px",
                textTransform: "uppercase"
              }}>
                Real-Time Ingestion: Active
              </span>
              <h4 style={{ margin: "4px 0 2px 0", fontSize: "14px", fontWeight: "bold", color: "#991b1b" }}>
                {recentViolation.type.toUpperCase()} VIOLATION
              </h4>
              <p style={{ margin: 0, fontSize: "11px", color: "var(--text-secondary)" }}>
                Vehicle plate flagged: <strong className="mono" style={{ color: "#000000" }}>{recentViolation.plate}</strong>
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>{recentViolation.violation_id}</span>
              <div style={{ fontSize: "12px", fontWeight: "bold", color: "var(--danger)", marginTop: "2px" }}>
                Conf: {recentViolation.confidence}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
