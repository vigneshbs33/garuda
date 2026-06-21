# 🚦 GARUDA: Gridlock Guardian
### Autonomous Traffic Violation Intelligence & Enforcement Platform

GARUDA is an edge-native, AI-driven traffic enforcement and violation detection ecosystem. It is designed to run locally on low-cost edge nodes (such as Nvidia Jetson and Raspberry Pi) to preprocess feeds, track vehicles, classify multi-category traffic violations in real-time, resolve damaged or obscured license plates, and dispatch automated SMS/WhatsApp challans.

---

## 📌 1. Problem Statement

Modern urban traffic management systems face severe bottlenecks that hinder effective enforcement:

*   **High Latency and Cloud Dependency:** Traditional ANPR (Automatic Number Plate Recognition) systems rely on uploading high-resolution video streams to centralized cloud servers. This incurs massive bandwidth costs, creates high latency, and fails in network dead zones.
*   **Fragile Detection of Damaged or Obscured Plates:** Standard OCR algorithms fail completely when license plates are blurry (due to high speed), dirty, bent, partially hidden, or damaged.
*   **Excessive False Positives:** Hard-coded rule engines flag non-violations, leading to legal disputes and overwhelming traffic departments with manual verifications.
*   **Post-Accident Reaction rather than Prevention:** Most traffic monitoring platforms only register violations after an event or an accident has occurred. They lack proactive checks for driver drowsiness or immediate phone use.
*   **Data Privacy Concerns:** Continuously streaming raw footage of citizens to central cloud servers violates data privacy regulations like India's Digital Personal Data Protection (DPDP) Act.

---

## 💡 2. The Solution

GARUDA resolves these challenges through a distributed, edge-first, and confidence-gated AI enforcement network:

### A. Edge-Native Performance (Local Execution)
GARUDA does not require continuous cloud streaming. The entire detection, tracking, and violation classification pipeline can run locally on cost-effective edge nodes:
*   **Local Hardware Support:** Optimized to run locally on a **Raspberry Pi 5 + Coral TPU** (using quantized TFLite INT8 models) or an **Nvidia Jetson Orin NX** (using TensorRT FP16).
*   **Bandwidth Efficiency:** Edge nodes process feeds locally and only upload lightweight evidence packages (a JSON metadata payload and cropped annotated JPEGs) when a violation is detected.

### B. Intelligent Alphanumeric Plate Reconstruction & Matching
To handle blurry, hidden, or damaged plates, GARUDA employs a multi-faceted heuristic matching algorithm:
1.  **Partial Character OCR:** The pipeline extracts whatever characters are visible on the plate.
2.  **Visual Asset Extraction:** Simultaneously, the object detection model classifies the **vehicle type** (e.g., SUV, Sedan, Hatchback, Motorcycle) and extracts the **vehicle color** using color space heuristics.
3.  **National DB Query-Matching:** The system queries the national vehicle database (e.g., Vahan) using the partial alphanumeric string, filtering results by the detected vehicle type and color. 
4.  **Identity Resolution:** By combining these visual identifiers, the system resolves the vehicle's identity even when more than 30% of the license plate is illegible.

### C. Automated Challan SMS Dispatch
*   Once the plate is resolved and the violation is confirmed, GARUDA fetches the registered owner's contact details from the national database.
*   The system dispatches an automated SMS/WhatsApp challan containing the violation ID, fine amount, location, timestamp, and a link to the annotated image evidence.

### D. Confidence-Gated Routing (Human-in-the-Loop)
To eliminate false accusations, violations are routed based on visual confidence:
*   **Tier 1 (Confidence ≥ 90%):** Automatically issues the SMS challan without human intervention.
*   **Tier 2 (Confidence 60%–80%):** Routes the violation to a central **Human Review Queue** on the Next.js Dashboard. An officer can confirm or reject it with a single click.
*   **Tier 3 (Confidence < 60%):** Logged locally or discarded to avoid false positives.

---

## 📊 3. Feature Comparison

| Feature / Metric | Traditional Systems (CCTV / Speed Cams) | GARUDA Platform |
| :--- | :--- | :--- |
| **Compute Location** | Centralized Cloud / High-end Servers | **Edge-Native** (Local Raspberry Pi / Jetson) |
| **Network Reliance** | Constant high-bandwidth internet required | **Offline-first** (Stores locally, syncs on connect) |
| **Damaged/Blurry Plate Resolution** | Fails; marked as unreadable | **Reconstructed** via visual cues + DB matching |
| **Driver State Monitoring** | None | **Drowsiness & Phone Use** alerts in real-time |
| **False Positive Mitigation** | None (All flagged or manual filter) | **Confidence Routing (Tiers 1/2/3)** |
| **Privacy Compliance** | Transmits raw personal video feeds | **DPDP Compliant** (Sends only violation crops) |
| **Self-Improvement Capability** | Manual software updates | **Federated Learning** (Adapts locally over time) |

---

## 🌟 4. Unique Selling Propositions (USPs)

1.  **Edge-First Autonomy (Raspberry Pi & Jetson Support):** Operates on low power (~10-15W) with high throughput. Perfect for remote intersections and regions with intermittent connectivity.
2.  **Partial Plate Reconstruction Heuristic:** Fills the gap in traditional OCR by combining partial character strings, vehicle type, and color to query databases, achieving identification where competitors fail.
3.  **Pre-Violation Drowsiness Detection:** Actively measures Eye Aspect Ratio (EAR) and Mouth Aspect Ratio (MAR) using MediaPipe FaceMesh to warn fatigued drivers before accidents occur.
4.  **Privacy-First Federated Learning:** Edge clients collaboratively train a global model on local corrections without ever sharing raw video streams.
5.  **Smart Repeat-Offender Escalation:** The platform tracks offender history; if a plate with 3+ prior violations is detected, it escalates to Tier 2 for immediate physical patrol interception, regardless of visual confidence.

---

## 🔌 5. Integration Architecture

GARUDA's components are divided into modular layers for easy deployment and integration:

```
                  +----------------------------------------------+
                  |         Camera Feed / RTSP Stream            |
                  +----------------------+-----------------------+
                                         |
                                         v
                  +----------------------------------------------+
                  |  Edge Node Pipeline (Raspberry Pi / Jetson)  |
                  |  - Preprocessing & ByteTrack Tracking        |
                  |  - YOLOv8 Violation Classifiers & OCR        |
                  +----------------------+-----------------------+
                                         |
                       (JSON Metadata & Annotated Crop)
                                         v
                  +----------------------------------------------+
                  |             FastAPI Backend API              |
                  |  - Handles WebSocket Live Feed Streams       |
                  |  - Manages SQLite/PostgreSQL Database        |
                  +-------+------------------------------+-------+
                          |                              |
                          v                              v
+-----------------------------------+          +-----------------------------------+
|     Next.js Web Dashboard         |          |      External Integrations        |
| - Live Map Heatmaps & Charts      |          | - National Vehicle DB (Vahan)     |
| - Officer Manual Review Queue     |          | - SMS/WhatsApp Gateway (Twilio)   |
| - Camera stop-line calibration    |          | - Federated Learning Server (flwr)|
+-----------------------------------+          +-----------------------------------+
```

---

## 📈 6. Scalability Strategy

*   **Horizontal Scaling of Edge Nodes:** Adding a new camera intersection is as simple as flashing a new Raspberry Pi image, connecting it to the camera feed, and registering its ID with the backend.
*   **Asynchronous Database Writing:** The FastAPI backend utilizes async SQLAlchemy sessions to handle heavy ingestion loads from hundreds of edge nodes without database locking.
*   **Centralized Model Distribution:** The central server aggregates updates using Federated Averaging (FedAvg) and distributes updated weights back to the edge nodes, keeping the network synchronized without cloud training costs.

---

## 🛡️ 7. Socio-Economic & Safety Impact

*   **Safer Roadways:** Reduces hazardous driving habits (no-helmet, triple riding, red-light running, phone use) through instantaneous automated fines.
*   **Reduced Traffic Congestion:** Detects stop-line and illegal parking violations, helping keep lanes clear.
*   **Officer Protection & Efficiency:** Replaces physical documentation with digital challans and automates verification, freeing officers for critical tasks.
*   **Auditability:** Every challan includes annotated image evidence watermarked with location, time, and camera coordinates, ensuring transparency.

---

## 🛠️ 8. Development Status (Built vs. Under Development)

To maintain transparency, the following table details what is currently fully functional and what is actively being developed:

| Component | Feature | Status | Tech Stack / Details |
| :--- | :--- | :--- | :--- |
| **ML Inference** | Vehicle & Person Detection | **Completed** | YOLOv8m / YOLO11n |
| | Vehicle Tracking & Speeds | **Completed** | ByteTrack |
| | Violation Classification | **Completed** | Custom CNNs (Helmet, Phone) + HSV fallback (Traffic Light) |
| | Drowsiness Detection | **Completed** | MediaPipe FaceMesh |
| | Primary License Plate OCR | **Completed** | PaddleOCR & EasyOCR |
| | **Edge Hardware Deployment** | ⚠️ **Under Development** | Jetson TensorRT & Raspberry Pi TFLite exports written; physical bench validation in progress. |
| | **Blurred/Damaged Plate Resolution**| ⚠️ **Under Development** | Alphanumeric regex parsing is complete. The color/type query logic matching against Vahan is being integrated. |
| **Backend** | REST API & WS Ingestion | **Completed** | FastAPI, WebSocket, Pydantic v2 |
| | Database Engine | **Completed** | SQLite (dev) / PostgreSQL (prod) via async SQLAlchemy |
| | **SMS/WhatsApp Alerts** | ⚠️ **Under Development** | Alert Service is written. Runs in **Mock Mode** (logs to terminal) by default; real Twilio API integration is ready for key provisioning. |
| | **National DB Sync** | ⚠️ **Under Development** | Local `vehicles` registry mock database is live; official external Vahan database API client integration is planned. |
| **Frontend** | Live Dashboard | **Completed** | Next.js 16 App Router, TypeScript, React 19 |
| | Analytics & Charts | **Completed** | Heatmaps, trends, and real-time statistics |
| | Review Queue | **Completed** | Tier 2 human validation panel with confirm/reject actions |
| **Federated Learning**| Node Communication | **Completed** | Flower (flwr) client/server architecture |
| | Local Retraining Loop | ⚠️ **Under Development** | Local model training on officer corrections (`_local_train` method) is currently stubbed. |

---

*Developed by Team CodeKrafters | Flipkart Gridlock 3.0*
