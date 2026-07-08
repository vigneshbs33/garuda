<div align="center">
  
# 🚦 GARUDA: Civic Safety & Road Hazard Intelligence
**Comprehensive Project Description & Problem-Solution Matrix**  
*BOSCH-BMU Innovation Challenge 2026*

</div>

---

## 📌 1. The Core Problem Statement
*   **💸 High Bandwidth & Cloud Costs:** 24/7 cloud streaming of raw video is costly and faces network dropouts in developing infrastructure.
*   **🚨 Missed Complex Hazards & Violations:** Standard cameras miss critical infrastructure decay (like potholes) and nuanced behaviors like driver fatigue or wrong-side driving.
*   **⚠️ Reactive Safety:** Authorities rely on post-accident data to fix roads or deploy emergency services, rather than predicting when and where failures will occur.

---

## 💡 2. The GARUDA Solution
GARUDA shifts computation to low-power edge nodes (e.g., **Raspberry Pi 5 + Google Coral TPU** or **NVIDIA Jetson Orin NX**), executing all detection, classification, and OCR locally. Detections are uploaded via tiny JSON payloads (~2KB) to a central FastAPI database and live Next.js dashboard.

*   **🛣️ Proactive Hazard Intelligence:** Uses advanced YOLOv12 models to detect road damage in real-time. Computes a dynamic Road Health Score (RHS) and tracks deterioration velocity to predict exact failure dates.
*   **📲 Automated Alerts & Challans:** Instantly triggers WebSocket alerts for critical road hazards and dispatches SMS/WhatsApp notifications for traffic violations.

---

## 📊 3. Feature Comparison Matrix

| Feature / Metric | Traditional Systems (CCTV) | 🦅 GARUDA Platform |
| :--- | :--- | :--- |
| **Execution Location** | Centralized Cloud (Raw stream) | **Edge-Native** (Local Pi/Jetson) |
| **Network Reliance** | Constant high-speed internet needed | **Offline-First** (SQLite local cache) |
| **Road Hazards** | Unmonitored until accidents occur | **Predicted** via temporal deterioration tracking |
| **Driver Alerting** | None (Post-event reactive) | **Proactive** drowsiness & phone checks |
| **Privacy Compliance** | Streams public transit feeds | **DPDP Compliant** (Video stays local) |

---

## 🌟 4. Unique Selling Propositions (USPs)

1.  **⚡ Edge-First Autonomy:** Runs locally on INT8 TFLite/TensorRT models. Stores data locally during network outages and syncs when online.
2.  **🔮 Predictive Risk Engine:** Tracks Road Health Score (RHS) over time using linear regression to predict exactly when a road will become critical.
3.  **😴 Proactive Drowsiness Detection:** Eye Aspect Ratio (EAR) and Mouth Aspect Ratio (MAR) checks via MediaPipe FaceMesh alert distracted or fatigued drivers.
4.  **🤖 Local AI Copilot:** A conversational dashboard assistant powered by a local **`gemma3:1b`** LLM via Ollama to query database violations safely using natural language.
5.  **🚦 Cost-Effective Retrofitting:** Requires zero new hardware installations; plugs directly into existing RTSP streams or dashcams.

---

## 📐 5. Heuristic Optimizations (Indian Traffic Tuned)
*   **📍 Context-Aware Stop Lines:** Requires vehicle movement vector verification, preventing false triggers for pre-parked cars.
*   **🚌 Wrong-Side Bus Bay Exemptions:** Exempts buses (`WRONG_SIDE_EXEMPT_CLASSES`) to prevent false wrong-way alerts during merges.
*   **🚦 Advanced Signal Confidence Floors:** Debounces signal states using multi-frame verification.

---

## 🔮 6. Future Scope & Roadmap (Under Development)
1.  **Auto GPS Extraction:** Extract EXIF GPS data from uploaded images automatically for the Hazard Heatmap.
2.  **Batch Video Processing:** Analyze dashcam footage frame-by-frame for comprehensive road auditing.
3.  **Mobile Edge Inference:** Run the 19MB YOLO road hazard model directly on a smartphone app for crowdsourced road auditing.
4.  **Vahan National Register API Linkage:** Swapping local mock registries for live government database API integrations.

---

<div align="center">
  <b>Developed and Optimized for the BOSCH-BMU Innovation Challenge</b>
</div>
