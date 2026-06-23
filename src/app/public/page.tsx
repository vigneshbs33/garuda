"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePlatform } from "@/context/PlatformContext";
import { uploadSingle, uploadBatch } from "@/lib/evidence";

export default function PublicPage() {
  const router = useRouter();
  const { token } = usePlatform();

  // State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedFiles, setCapturedFiles] = useState<File[]>([]);
  const [captureMode, setCaptureMode] = useState<"photo" | "video">("photo");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [cameraError, setCameraError] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Initialize back camera
  const initCamera = async () => {
    setCameraError(false);
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: captureMode === "video",
      });
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (err) {
      console.warn("Webcam access failed:", err);
      setCameraError(true);
      setStream(null);
    }
  };

  useEffect(() => {
    initCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [captureMode]);

  // Capture Photo snapshot
  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !stream) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const file = new File(
              [blob],
              `capture_${Date.now()}.jpg`,
              { type: "image/jpeg" }
            );
            setCapturedFiles((prev) => [...prev, file]);
          }
        },
        "image/jpeg",
        0.92
      );
    }
  };

  // Video recording controls
  const startRecording = () => {
    if (!stream) return;
    chunksRef.current = [];
    let options = { mimeType: "video/webm;codecs=vp9" };
    let mediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      try {
        mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      } catch (e2) {
        mediaRecorder = new MediaRecorder(stream);
      }
    }
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const file = new File(
        [blob],
        `capture_${Date.now()}.webm`,
        { type: "video/webm" }
      );
      setCapturedFiles((prev) => [...prev, file]);
      setRecordingSeconds(0);
    };
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  useEffect(() => {
    let timer: any;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setCapturedFiles((prev) => [...prev, ...files]);
    }
  };

  const removeFile = (idx: number) => {
    setCapturedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Upload captured items & redirect to Evidence page
  const handleAnalyse = async () => {
    if (capturedFiles.length === 0) return;
    setIsUploading(true);
    try {
      if (capturedFiles.length === 1) {
        const file = capturedFiles[0];
        const isVideo =
          file.type.startsWith("video") ||
          file.name.endsWith(".webm") ||
          file.name.endsWith(".mp4");
        await uploadSingle({
          name: file.name,
          sourceType: isVideo ? "Video" : "Image",
          file,
          token,
        });
      } else {
        await uploadBatch({
          name: `Public Capture Batch (${capturedFiles.length} files)`,
          files: capturedFiles,
          token,
        });
      }
      router.push("/evidence");
    } catch (err) {
      alert("Submission failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#F1F5F9",
        fontFamily: "var(--font-sans)",
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .phone-wrapper {
          width: 100%;
          height: 100vh;
          background-color: var(--bg-primary);
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          background: #FCFCF9;
        }
        @media (min-width: 768px) {
          .phone-wrapper {
            width: 390px !important;
            height: 820px !important;
            border: 10px solid #1E293B;
            border-radius: 36px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          }
        }
        .mode-btn {
          border: none;
          background: none;
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .mode-btn.active {
          background-color: #EAB308;
          color: #0F172A;
        }
        .mode-btn.inactive {
          color: #64748B;
        }
        .shutter-btn {
          width: 68px;
          height: 68px;
          border-radius: 50%;
          border: 4px solid #FFFFFF;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          outline: none;
          transition: all 0.2s;
        }
        .shutter-btn:active {
          transform: scale(0.92);
        }
        .pulse-dot {
          width: 10px;
          height: 10px;
          background-color: #EF4444;
          border-radius: 50%;
          animation: recPulse 1s infinite;
        }
        @keyframes recPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.4; }
        }
      `,
        }}
      />

      <div className="phone-wrapper">
        {/* Header Section */}
        <div
          style={{
            padding: "16px",
            borderBottom: "2px solid var(--border-accent-dark)",
            backgroundColor: "var(--bg-tertiary)",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: "700",
              color: "var(--text-accent)",
              letterSpacing: "0.5px",
            }}
          >
            ⚡ GARUDA REPORTER
          </div>
          <div style={{ fontSize: "9px", color: "var(--text-secondary)", textTransform: "uppercase" }}>
            Karnataka State Police · Incident Upload
          </div>
        </div>

        {/* Main Camera / Fallback workspace */}
        <div style={{ flex: 1, position: "relative", backgroundColor: "#000", display: "flex", flexDirection: "column" }}>
          {stream ? (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />

              {/* Timer indicator overlay */}
              {isRecording && (
                <div
                  style={{
                    position: "absolute",
                    top: "16px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    backgroundColor: "rgba(0, 0, 0, 0.6)",
                    padding: "4px 12px",
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "#FFFFFF",
                    fontSize: "12px",
                    fontWeight: "bold",
                  }}
                >
                  <span className="pulse-dot" />
                  <span>
                    {Math.floor(recordingSeconds / 60)}:
                    {String(recordingSeconds % 60).padStart(2, "0")}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
                color: "var(--text-muted)",
                backgroundColor: "var(--bg-primary)",
              }}
            >
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>📷</div>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-primary)", textAlign: "center" }}>
                Camera Stream Blocked or Offline
              </div>
              <div style={{ fontSize: "11px", textAlign: "center", marginTop: "4px", marginBottom: "20px" }}>
                Use the file browser below to snap photos directly using your mobile back camera or upload media.
              </div>

              <label
                style={{
                  display: "inline-block",
                  backgroundColor: "#EAB308",
                  color: "#0F172A",
                  padding: "10px 20px",
                  borderRadius: "6px",
                  fontWeight: "700",
                  fontSize: "12px",
                  cursor: "pointer",
                  border: "1px solid #CA8A04",
                }}
              >
                📁 BROWSE &amp; CAPTURE MEDIA
                <input
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  multiple
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
              </label>
            </div>
          )}
        </div>

        {/* Control Desk */}
        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderTop: "1px solid var(--border-color)",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {stream && (
            <>
              {/* Photo / Video Switcher */}
              <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
                <button
                  className={`mode-btn ${captureMode === "photo" ? "active" : "inactive"}`}
                  onClick={() => {
                    if (isRecording) stopRecording();
                    setCaptureMode("photo");
                  }}
                >
                  PHOTO
                </button>
                <button
                  className={`mode-btn ${captureMode === "video" ? "active" : "inactive"}`}
                  onClick={() => setCaptureMode("video")}
                >
                  VIDEO
                </button>
              </div>

              {/* Shutter row */}
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                {captureMode === "photo" ? (
                  <button
                    className="shutter-btn"
                    onClick={capturePhoto}
                    style={{ backgroundColor: "#EAB308" }}
                    title="Take Photo"
                  />
                ) : (
                  <button
                    className="shutter-btn"
                    onClick={isRecording ? stopRecording : startRecording}
                    style={{ backgroundColor: isRecording ? "#EF4444" : "#DC2626" }}
                    title={isRecording ? "Stop Recording" : "Start Recording"}
                  >
                    {isRecording && (
                      <div style={{ width: "20px", height: "20px", backgroundColor: "#FFFFFF", borderRadius: "4px" }} />
                    )}
                  </button>
                )}
              </div>
            </>
          )}

          {/* Captured Gallery Row */}
          {capturedFiles.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                Captured Assets ({capturedFiles.length})
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  overflowX: "auto",
                  padding: "4px 0",
                  scrollbarWidth: "none",
                }}
              >
                {capturedFiles.map((file, idx) => {
                  const isVideo = file.type.startsWith("video");
                  return (
                    <div
                      key={idx}
                      style={{
                        position: "relative",
                        width: "60px",
                        height: "60px",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color)",
                        overflow: "hidden",
                        backgroundColor: "#F1F5F9",
                        flexShrink: 0,
                      }}
                    >
                      {isVideo ? (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "20px",
                          }}
                        >
                          🎥
                        </div>
                      ) : (
                        <img
                          src={URL.createObjectURL(file)}
                          alt="Thumbnail"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      )}

                      <button
                        onClick={() => removeFile(idx)}
                        style={{
                          position: "absolute",
                          top: "2px",
                          right: "2px",
                          width: "14px",
                          height: "14px",
                          borderRadius: "50%",
                          backgroundColor: "#EF4444",
                          color: "#FFFFFF",
                          border: "none",
                          fontSize: "8px",
                          fontWeight: "bold",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action trigger button */}
          <button
            onClick={handleAnalyse}
            disabled={capturedFiles.length === 0 || isUploading}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: capturedFiles.length > 0 ? "#EAB308" : "#E2E8F0",
              color: capturedFiles.length > 0 ? "#0F172A" : "#94A3B8",
              border: "none",
              borderRadius: "8px",
              fontWeight: "700",
              fontSize: "13px",
              cursor: capturedFiles.length > 0 ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            {isUploading ? (
              <>⌛ UPLOADING &amp; ANALYSING...</>
            ) : (
              <>🚀 ANALYSE MEDIA ({capturedFiles.length})</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
