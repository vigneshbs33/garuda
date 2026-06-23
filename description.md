<div align="center">
  
# 🚦 GARUDA: Gridlock Guardian
**Comprehensive Project Description & Problem-Solution Matrix**  
*Flipkart Gridlock 3.0 | Team CodeKrafters*

</div>

---

## 📌 1. The Core Problem Statement
*   **💸 High Bandwidth & Cloud Costs:** 24/7 cloud streaming of raw video is costly and faces network dropouts in developing infrastructure.
*   **🌫️ Illegible License Plates:** Blurry, muddy, or physically damaged plates render standard OCR systems completely useless.
*   **🚨 Missed Complex Violations:** Standard cameras miss nuanced behaviors like driver fatigue, phone use, triple-riding, or wrong-side driving.
*   **⚖️ Dispute Backlog & Privacy Concerns:** Automated ticket triggers lead to false citations, citizen complaints, and severe compliance risks under India's DPDP Act.

---

## 💡 2. The GARUDA Solution
GARUDA completely shifts computation to low-power edge nodes (e.g., **Raspberry Pi 5 + Google Coral TPU** or **NVIDIA Jetson Orin NX**), executing all detection, classification, and OCR locally. Detections are uploaded via tiny JSON payloads (~2KB) to a central FastAPI database and live Next.js dashboard.

*   **🧩 Alphanumeric Plate Reconstruction:** The pipeline repairs obscured plates by combining partial character strings with detected vehicle color (HSV analysis) and type (YOLOv8), query-matching this tuple against local/Vahan databases.
*   **📲 Automated SMS Challans:** Instantly pulls offender contacts from registries and sends SMS/WhatsApp tickets containing fine details and proof links.

---

## 📊 3. Feature Comparison Matrix

| Feature / Metric | Traditional Systems (CCTV) | 🦅 GARUDA Platform |
| :--- | :--- | :--- |
| **Execution Location** | Centralized Cloud (Raw stream) | **Edge-Native** (Local Pi/Jetson) |
| **Network Reliance** | Constant high-speed internet needed | **Offline-First** (SQLite local cache) |
| **Obscured Plates** | Fails; marked unreadable | **Reconstructed** via visual cues + DB lookup |
| **Driver Alerting** | None (Post-event reactive) | **Proactive** drowsiness & phone checks |
| **Privacy Compliance** | Streams public transit feeds | **DPDP Compliant** (Video stays local) |

---

## 🌟 4. Unique Selling Propositions (USPs)

1.  **⚡ Edge-First Autonomy:** Runs locally on INT8 TFLite/TensorRT models. Stores data locally during network outages and syncs when online.
2.  **🕵️ Robust Plate Reconstruction Heuristics:** Matches partial letters, vehicle color, and class to resolve vehicle identities where standard OCR fails.
3.  **😴 Proactive Drowsiness Detection:** Eye Aspect Ratio (EAR) and Mouth Aspect Ratio (MAR) checks via MediaPipe FaceMesh alert distracted or fatigued drivers.
4.  **🤖 Local Gemma-3 AI Copilot:** A conversational dashboard assistant powered by a local **`gemma3:1b`** LLM via Ollama to query database violations safely using natural language.
5.  **🚦 Confidence-Gated Human-in-the-Loop Routing:** Auto-bills Tier 1 (high confidence `≥90%`) violations. Routes Tier 2 (borderline `60-89%`) events to an officer review panel to prevent false tickets.

---

## 📐 5. Heuristic Optimizations (Indian Traffic Tuned)
*   **📍 Context-Aware Stop Lines:** Requires vehicle movement vector verification, preventing false triggers for pre-parked cars.
*   **🚌 Wrong-Side Bus Bay Exemptions:** Exempts buses (`WRONG_SIDE_EXEMPT_CLASSES`) to prevent false wrong-way alerts during merges.
*   **⏱️ Dynamic Parking Timers:** Anchors idle parking duration checks directly to video FPS to handle variable streaming rates.
*   **🚦 Advanced Signal Confidence Floors:** Debounces signal states using multi-frame verification.

---

## ⚖️ 6. Dubai-Style Automated Challans & Dispute Appeal Flow

GARUDA implements a fast, automated enforcement flow inspired by modern smart cities like Dubai, while maintaining a clear and accessible grievance redressal mechanism for citizens to appeal incorrect tickets.

```text
Edge Camera Node logs violation ➔ Ingests to /api/v1/violations/ingest
                                        |
                 +----------------------+----------------------+
                 | (Tier 1: Conf >= 90%)                       | (Tier 2: Conf < 90%)
                 v                                             v
        [auto_challan status]                          [pending status]
                 |                                             |
          (SMS Sent to User)                                   |
                 |                                             |
                 +----------------------+----------------------+
                                        |
                                        v
                 [Citizen opens unique evidence URL in SMS]
                                        |
                                        v
                          Is details/plate incorrect?
                                        |
                    +-------------------+-------------------+
                    | Yes (Disputes)                        | No (Pays)
                    v                                       v
         [Queues to Dashboard]                     [Challan settled]
                    |
           (Officer Reviews)
                    |
      +-------------+-------------+
      | Approved                  | Rejected
      v                           v
[POST /confirm]             [POST /reject]
(Fine locked)               (Fine deleted & FL cache loaded)
```

1.  **Fast Ingestion:** High-confidence detections bypass manual checks, posting immediately to `/api/v1/violations/ingest` with `status: auto_challan`.
2.  **SMS Dispatch:** Instantly sends SMS/WhatsApp alerts with violation descriptions, fine details, and unique proof links.
3.  **Appeals & Officer Override:** The citizen can click the link to view the visual evidence. If they dispute it, the ticket's database status is promoted to `pending`, sending it to the manual review queue where officers can approve (`POST /confirm` ➔ `confirmed`) or void (`POST /reject` ➔ `rejected`) the challan.

---

## 🔮 7. Future Scope & Roadmap (Under Development)
1.  **Physical Edge Benchmarking:** Finalizing INT8 Coral TPU benchmarks on physical Raspberry Pi 5.
2.  **Vahan National Register API Linkage:** Swapping local mock registries for live government database API integrations.
3.  **Real Twilio Alerts:** Activating live Twilio accounts for SMS and WhatsApp delivery (currently in terminal log mock mode).
4.  **Active Federated Learning Loop:** Enabling local backpropagation client retraining (`_local_train`) on officer corrections.
5.  **Cross-Camera Re-ID:** Integrating OSNet model configurations to track vehicles across intersection feeds without license plates.

---

<div align="center">
  <b>Forged through sleepless nights, endless model training, crazy errors, and sheer willpower by Team CodeKrafters for Flipkart Gridlock 3.0</b>
</div>
