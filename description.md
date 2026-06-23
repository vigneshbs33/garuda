# 🚦 GARUDA — Gridlock Guardian
### Automated Traffic Violation Intelligence & Enforcement Platform
*Target Deployments: Flipkart Gridlock 3.0 & Public Safety Datathons*

---

## 📑 Table of Contents
1. [Project Overview & Problem Statement](#-1-project-overview--problem-statement)
2. [Code Traceability Matrix](#-2-code-traceability-matrix)
3. [System Architecture & Ingestion Flow](#-3-system-architecture--ingestion-flow)
4. [ML Model Inventory](#-4-ml-model-inventory)
5. [Heuristic Optimizations (Indian Traffic Tuned)](#-5-heuristic-optimizations-indian-traffic-tuned)
6. [Dubai-Style Automated Fast Challan & Dispute System](#-6-dubai-style-automated-fast-challan--dispute-system)
7. [Next.js Dashboard & Local Gemma-3 AI Copilot](#-7-nextjs-dashboard--local-gemma-3-ai-copilot)
8. [Future Scope & Roadmap (Under Development)](#-8-future-scope--roadmap-under-development)
9. [Key Environment Variables (.env)](#-9-key-environment-variables-env)

---

## 📌 1. Project Overview & Problem Statement

Modern traffic monitoring setups suffer from significant structural bottlenecks that GARUDA systematically solves:
* **High Cloud Cost & Privacy Overhead:** Streaming raw CCTV footage to cloud instances is expensive and exposes citizen transit data. GARUDA resolves this by executing all ML workloads locally on low-cost edge nodes.
* **OCR Vulnerability (Dirty/Damaged Plates):** Dirt, damage, and high-speed motion blur prevent standard OCR engines from reading license plates. GARUDA reconstructs plates by combining visible alphanumeric sub-segments with vehicle class and color, then query-matching this tuple against database registries.
* **Gated Human Enforcement:** Auto-billing every computer vision detection introduces false positives. GARUDA gates enforcement with a 3-tier routing engine: automatic ticketing for high-confidence events and a manual officer review queue for borderline cases.
* **Proactive Accident Mitigation:** Standard traffic cameras only register violations post-event. GARUDA implements real-time driver state analysis (measuring drowsiness and phone use) to warn drivers before incidents occur.

---

## 📋 2. Code Traceability Matrix

The table below maps the structural requirements from the Flipkart Gridlock problem statement (`ps.txt`) directly to their corresponding implementations in the codebase:

| ps.txt Requirement | Status | Feature & Implementation Details | Codebase Reference |
| :--- | :---: | :--- | :--- |
| **Image Preprocessing** | ✅ | Adjusts contrast (CLAHE), applies bilateral filtering for denoising (rain, shadow, blur), and applies gamma/exposure correction. | [preprocessor.py](file:///Users/keshav/garuda/GARUDA/ml/pipeline/preprocessor.py) |
| **Vehicle & User Detection** | ✅ | Runs fine-tuned YOLOv8m models to localize vehicles (cars, bikes, trucks, buses) and road users (pedestrians, riders). | [detector.py](file:///Users/keshav/garuda/GARUDA/ml/pipeline/detector.py) |
| **Helmet Non-compliance** | ✅ | Identifies bare heads vs. helmets using full-frame detector `helmet_best.pt` with fallback to binary head-crop CNN. | [violation_classifier.py#L797](file:///Users/keshav/garuda/GARUDA/ml/pipeline/violation_classifier.py#L797) |
| **Seatbelt Non-compliance** | ✅ | Windshield-ROI detection using YOLOv11s classifier model (`seatbelt_classifier.pt`). | [violation_classifier.py#L933](file:///Users/keshav/garuda/GARUDA/ml/pipeline/violation_classifier.py#L933) |
| **Triple Riding** | ✅ | Measures spatial clustering overlaps between riders (person boxes) and two-wheeler bboxes. | [violation_classifier.py#L1017](file:///Users/keshav/garuda/GARUDA/ml/pipeline/violation_classifier.py#L1017) |
| **Wrong-side Driving** | ✅ | Multi-frame velocity vector direction checking against calibrated zones with heading thresholds. | [violation_classifier.py#L1047](file:///Users/keshav/garuda/GARUDA/ml/pipeline/violation_classifier.py#L1047) |
| **Stop-line Violation** | ✅ | Crosses vehicle bboxes against stop-line coordinates while gating for active red-signal state. | [violation_classifier.py#L1110](file:///Users/keshav/garuda/GARUDA/ml/pipeline/violation_classifier.py#L1110) |
| **Red-light Violation** | ✅ | Debounced transition check confirming a vehicle crossed from a legal zone to illegal zone during a red light. | [violation_classifier.py#L1143](file:///Users/keshav/garuda/GARUDA/ml/pipeline/violation_classifier.py#L1143) |
| **Illegal Parking** | ✅ | Monitors track IDs remaining stationary inside calibrated parking zones for more than 30s (anchored to video FPS). | [violation_classifier.py#L1176](file:///Users/keshav/garuda/GARUDA/ml/pipeline/violation_classifier.py#L1176) |
| **Confidence Scoring** | ✅ | Assigns confidence values and routes via `ConfidenceRouter` (Auto-Challan vs. Review Queue vs. Log/Discard). | [confidence_router.py](file:///Users/keshav/garuda/GARUDA/ml/pipeline/confidence_router.py) |
| **License Plate Recognition** | ✅ | Stage-1 plate detection (`plate_koushi.pt`) + Stage-2 refinement (`plate_yasir.pt`) + fast-plate-ocr fallback chain. | [ocr.py](file:///Users/keshav/garuda/GARUDA/ml/pipeline/ocr.py) |
| **Evidence Generation** | ✅ | Packages annotated visual layouts (highlighting violation region and zoomed-in plate) with full JSON metadata. | [evidence.py](file:///Users/keshav/garuda/GARUDA/ml/utils/evidence.py) & [visualizer.py](file:///Users/keshav/garuda/GARUDA/ml/utils/visualizer.py) |
| **Analytics & Reporting** | ✅ | Centralized SQLite/PostgreSQL database stores logs, camera configs, audit logs, and repeat offenders. Exposes endpoints for stats. | [analytics.py](file:///Users/keshav/garuda/GARUDA/backend/api/analytics.py) |
| **Performance Evaluation** | ✅ | Local scripts validate model files against external datasets and generate precision/recall reports. | [eval_helmet_best.py](file:///Users/keshav/garuda/GARUDA/scratch/eval_helmet_best.py) |

---

## 🏗️ 3. System Architecture & Ingestion Flow

The local edge pipeline runs inference on frames, creates evidence crops, watermarks timestamps, and uploads JSON metadata payloads via secure HTTPS to the backend.

```
Image / Video / Camera Feed
    ↓
[Preprocessor]       ml/pipeline/preprocessor.py  (CLAHE, noise reduction, motion deblur)
    ↓
[Detector]           ml/pipeline/detector.py      (YOLOv8m vehicle/person/phone detector)
    ↓
[Tracker]            ml/pipeline/tracker.py       (ByteTrack multi-object tracking)
    ↓
[Violation Checks]   ml/pipeline/violation_classifier.py (Helmet, Signal, seatbelt, wrong-way)
    ↓
[Driver State]       ml/pipeline/driver_state.py  (MediaPipe FaceMesh drowsiness check)
    ↓
[OCR Chain]          ml/pipeline/ocr.py           (Koushi + YasirFaiz + OCR engines)
    ↓
[Confidence Router]  ml/pipeline/confidence_router.py (Routing Tiers 1/2/3)
    ↓
[Evidence Packager]  ml/utils/evidence.py         (Watermarked JPEGs + metadata JSON)
    ↓
[FastAPI Backend]    backend/main.py              (Uvicorn server, HTTP routes, WebSockets)
    ↓
[Dashboard WebUI]    src/app/                     (Real-time reactive Next.js dashboard)
```

There are two primary entry points that run this pipeline:
1. **`backend/api/jobs.py`** — Executes the shared `MLRegistry` singleton (loaded via `backend/services/ml_registry.py`) in the background. It is triggered by dashboard video uploads via `POST /api/v1/jobs/upload`.
2. **`ml/demo_pipeline.py`** — A standalone CLI script for local testing and debugging, capable of processing webcams, video clips, and static images, then pushing them to the backend via `--backend-url`.

---

## 🗃️ 4. ML Model Inventory

GARUDA hosts 7 highly optimized model checkpoints:

### A. Primary Detection weights (`ml/models/weights/detection/`)
* **`yolov8m.pt` (52MB):** Performs the primary detection task. Bounding boxes are filtered for vehicles (cars, motorcycles, buses, trucks) and road participants (persons, cell phones).

### B. Violation Classification weights (`ml/models/weights/violations/`)
* **`helmet_best.pt` (6.5MB):** A custom 9-class YOLOv8n classifier trained specifically on Indian traffic. Detects riders wearing helmets, bare heads, and full silhouettes.
  * *Benchmark (Indian Traffic - 12,632 images):* **`mAP@0.5 ≈ 0.842`** 🏆
  * *Benchmark (Foreign OOD Dataset - 764 images):* **`mAP@0.5 ≈ 0.543`** (Lower due to lack of traditional Indian head coverings, overhead angles, and helmet shapes).
* **`helmet_cnn.pt` (1.1MB):** A fallback binary head-crop classifier utilizing a MobileNetV3-Small backbone.
  * *Metrics:* **Accuracy: 87.44%**, **F1-Score: 84.21%** (n=215).
* **`seatbelt_classifier.pt` (1.1MB):** Windshield-ROI seatbelt classifier (YOLOv11s-cls).
* **`traffic_lights_yolov8x.pt` (49.6MB):** Decodes signals across 8 distinct states (`RedCircular`, `GreenCircular`, etc.) inside the upper 40% of camera frames.

### C. License Plate OCR weights (`ml/models/weights/ocr/`)
* **`plate_koushi.pt` (6.2MB):** Stage-1 plate locator (YOLOv8n). Isolates license plate coordinates from vehicle crops.
  * *Metrics:* **mAP@0.5: 88.16%**, **mAP@0.5:0.95: 51.02%**.
* **`plate_yasir.pt` (6.2MB):** Stage-2 crop validator. Confirms coordinates to eliminate bumper stickers, vehicle brand emblems, and road signs.
* **`plate_yolov8_moin.pt` (52MB):** High-recall legacy plate localization fallback.
* **OCR Character Engine Chain:** If characters are found, the text is extracted using a priority chain: `fast-plate-ocr` ➔ `PaddleOCR` ➔ `EasyOCR` ➔ `Tesseract`.

---

## 📐 5. Heuristic Optimizations (Indian Traffic Tuned)

To deploy successfully in chaotic Indian traffic conditions, GARUDA utilizes custom heuristics:

1. **Context-Aware Stop Lines:** Requires tracking evidence showing a vehicle moving from a legal zone across the line, preventing false alarms for pre-parked vehicles at intersection boundaries.
2. **Wrong-Side Zone Exemptions for Buses:** Buses merging out of designated bus bays point backward relative to through-traffic for several frames. The algorithm dynamically exempts buses (`WRONG_SIDE_EXEMPT_CLASSES`) to eliminate these false positives.
3. **Dynamic Parking Timers:** Idle parking durations are anchored to the frame rate (FPS) of the video feed rather than CPU speed, preventing processing hiccups from triggering false citations.
4. **Vector-Based Wrong-Side Checks:** Utilizes heading angles (100°+) and multi-frame tracking history to ignore standard, legitimate lane changes.
5. **HSV Color Blob Signal Fallback:** If the YOLO signal classifier is physically obstructed by tree branches or banners, the system uses HSV pixel analysis to monitor traffic signal changes.

---

## ⚖️ 6. Dubai-Style Automated Fast Challan & Citizen Dispute System

GARUDA implements a fast, automated enforcement flow inspired by modern smart cities like Dubai, while maintaining a clear and accessible grievance redressal mechanism for citizens to appeal incorrect tickets.

```
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

### A. The Fast Ingestion & Alert Flow
1. **Edge Detection:** The camera edge node detects a traffic violation and reads the license plate characters.
2. **Instant Ingestion:** Detections with high visual confidence (`≥ 90%` - Tier 1) bypass manual screening and are POSTed to the backend endpoint `/api/v1/violations/ingest` with `status` set to `auto_challan`.
3. **SMS Blast:** The backend immediately triggers the Alert Service (`backend/core/alert_service.py`), dispatching an automated SMS/WhatsApp challan to the registered offender's phone within seconds of the offense. The message includes the violation details, fine amount, and a unique URL pointing to their evidence package.

### B. Citizen Appeal & Dispute Resolution
To protect citizens from false accusations (such as occlusions, emergency maneuver, or OCR plate mismatches), the platform features a transparent appeal workflow:
1. **Accessing Proof:** The offender clicks the unique link in their SMS, opening a secure web portal (served by Next.js) showing the **Annotated Image Evidence** with bounding boxes, timestamps, and severity flags.
2. **Filing a Grievance:** If the driver believes they were not in violation (e.g. emergency avoidance, license plate misread), they can click **"Dispute Challan"** on the portal and upload their explanation (or dashboard camera video).
3. **Status Promotion:** Filing a dispute updates the ticket's database status to `pending` and places it in the **Officer Manual Review Queue** on the Next.js console.
4. **Officer Override (Human-in-the-Loop):** A reviewing officer analyzes the citizen's appeal alongside the high-resolution evidence. 
   * **Approved (`POST /violations/{id}/confirm`):** If the violation is correct, the officer confirms it, locking the ticket status to `confirmed`.
   * **Rejected (`POST /violations/{id}/reject`):** If the AI made a mistake, the officer rejects it, transitioning the ticket status to `rejected`. This immediately cancels the e-Challan, deletes the fine, and adds the incorrect sample to the local federated learning cache to train the system against similar future errors.

---

## 🖥️ 7. Next.js Dashboard & Local Gemma-3 AI Copilot

* **Next.js 16 Web Dashboard (`src/app/`):** A modern, responsive dashboard written in TypeScript. Features:
  * **Real-time Map:** Leverages Leaflet.js to draw active hot-spots and track patrol routes.
  * **Interactive Review Queue:** Displays pending Tier 2 reviews with side-by-side cropped annotated and raw frames.
  * **Camera Setup:** Allows admins to calibrate coordinates dynamically.
* **Gemma-3 AI Copilot (`backend/core/agent_executor.py`):** Integrates local LLM execution. It exposes a chat interface on the dashboard where officers can submit natural language prompts (e.g., *"Find all wrong-side violations on camera CAM-3 from yesterday"*). The copilot uses a local **`gemma3:1b`** instance via Ollama, maps the schema metadata, safely compiles the matching SQLAlchemy statement, executes the query, and displays structured lists and summaries.

---

## 🔮 8. Future Scope & Roadmap (Under Development)

1. **Physical Edge Device Porting:** Porting and compiling INT8 quantized TFLite weights to run directly on physical **Raspberry Pi 5 + Google Coral TPU** hardware.
2. **National Database Integration:** Replacing the local mock vehicle registry with live REST integrations connecting to the **Vahan National Register API** to fetch owner contact details.
3. **Live Twilio Gateway Integration:** Moving the notification system from mock mode (printing to log console) to a live Twilio account for SMS and WhatsApp deliveries.
4. **Active Federated Learning Retraining Loop:** Completing the local training logic (`_local_train` method) in the Flower client so edge nodes can execute backpropagation using confirmed officer corrections.
5. **Cross-Camera Vehicle Re-Identification (Re-ID):** Integrating **OSNet** (Omni-Scale Network) to track and identify vehicles across multiple street cameras without relying on license plates.

---

## ⚙️ 9. Key Environment Variables (`.env`)

| Variable Name | Default / Example Value | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | `sqlite+aiosqlite:///./garuda.db` | Async database connection string. Switch to `postgresql+asyncpg://...` for production. |
| `DEVICE` | `cpu` | Target inference hardware (`cpu` or `cuda:0` for GPU). |
| `ALERTS_ENABLED` | `false` | Enables Twilio messaging notifications. |
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxxxxxx` | Twilio account identifier. |
| `TWILIO_AUTH_TOKEN` | `xxxxxxxxxxxx` | Twilio authorization credentials. |
| `FL_ENABLED` | `false` | Toggles Flower Federated Learning client. |
| `SMTP_HOST` / `SMTP_PORT` | `smtp.gmail.com` / `587` | Server settings for real officer account verification emails. |

---

*Team CodeKrafters | Flipkart Gridlock 3.0*
