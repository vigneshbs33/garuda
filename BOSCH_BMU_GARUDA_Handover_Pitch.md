# 🛣️ GARUDA — Comprehensive Intelligence System
## Pitch & Developer Handover Document (BOSCH-BMU Innovation Challenge)

> **Prepared For**: BOSCH-BMU Innovation Challenge Pitch (July 8, 2026 @ 12:00 PM)  
> **Project path**: `cd /path/to/GARUDA`  
> **Last verified**: 2026-07-08 — All imports pass, all API routes live  

---

## 🦅 What is GARUDA?
GARUDA is an end-to-end **AI-powered civic safety and enforcement platform**. 
While our core entry for the BOSCH-BMU challenge focuses on **Road Hazard Intelligence**, the GARUDA platform actually has a much broader scope. It is designed to plug directly into a city's existing CCTV or dashboard camera infrastructure to provide two critical pillars of road safety:

1. **Traffic Enforcement (Original Core):** Real-time automated detection of traffic violations (missing helmets, seatbelt non-compliance, red light jumping, triple riding, and wrong-side driving) complete with an OCR pipeline for automated challan (ticket) generation.
2. **Road Hazard Intelligence (BOSCH-BMU Focus):** Proactive monitoring of road surface conditions (potholes, cracks) to predict and prevent infrastructure-related accidents before they happen.

By combining both, GARUDA offers a holistic, cost-effective solution for smarter, safer cities.

---

## 🏆 The Pitch: Why GARUDA Wins the BOSCH-BMU Challenge

### The Problem (Data-Backed Impact)
Potholes and road damage are silent killers in India. Between 2020 and 2024, pothole-related accidents caused over **9,438 fatalities** (a 53% upward trend). The National Highways Authority of India (NHAI) struggles to proactively monitor its massive network, spending over ₹6,500 crore annually on reactive maintenance. 

**Challenge Statement Addressed:**
> *"To develop a cost-effective, road hazard intelligence system which can help prevent accidents due to road anomalies."*

### Our Solution: Proactive Road Hazard Intelligence
GARUDA transforms existing traffic or dashboard cameras into proactive road safety monitors. By retrofitting software rather than installing expensive new hardware, we achieve mass scalability.

**How We Stand Out (Winning Criteria):**
1. **Innovation & Technical Viability:** Uses a lightweight YOLOv12 model (trained on the global RDD2022 dataset) to detect 5 types of road damage in real-time.
2. **Practical Impact (Proactive Safety):** Computes a dynamic **Road Health Score (RHS)** and tracks deterioration velocity. It predicts exactly *when* a road will become critically dangerous, allowing intervention *before* an accident occurs.
3. **Cost-Effectiveness & Scalability:** Requires ZERO new infrastructure. Plugs into existing RTSP camera streams or dashcam footage.
4. **Instant Emergency Alerts:** Broadcasts real-time WebSocket alerts to authorities when a road stretch crosses the critical risk threshold.

---

## 🏗️ System Architecture (Hazard Intelligence Flow)

```
Camera / Uploaded Image (Zero-Cost Infrastructure)
         │
         ▼
  [Existing] Frame Extractor
         │
         ├──► [Existing] ViolationClassifier  →  Traffic violations (Helmets, Seatbelts, OCR)
         │
         └──► [NEW] RoadHazardClassifier
                     │  yolo12s_RDD2022_best.pt
                     │  Detects 5 damage types
                     ▼
              HazardDetection objects
              (type, confidence, DSS, bbox)
                     │
                     ▼
              [NEW] RiskEngine
              ├── Road Health Score (0–100)
              ├── Deterioration velocity (RHS/day via linear regression)
              └── Predicted critical date
                     │
                     ▼
              [NEW] road_hazards DB table
                     │
              ┌──────┴──────┐
              ▼             ▼
       AlertService    FastAPI Endpoints
       (WS push)       /api/v1/hazards/*
              │             │
              └──────┬──────┘
                     ▼
              Next.js /hazards Page
              (Stats + Map + Upload + Table)
```

---

## 🎯 Demo Script for BOSCH Judges (2 minutes)

> **Goal:** Show them impact, scalability, and technical depth.

1. **Open** `http://localhost:3000/hazards`
2. **The Hook:** "In India, potholes caused over 9,400 deaths in the last 5 years. NHAI spends thousands of crores reactively. GARUDA changes this from reactive to proactive, using *existing* cameras."
3. **Point to stats cards** — "This dashboard tracks road health across an entire city's existing camera network."
4. **Upload** a heavily damaged road image (potholes visible):
   - Camera ID: `CAM-01`, Location: `NH-44 Km 120` (Use a real-sounding highway name), add Lat/Lon.
   - Click "Run Detection"
5. **Show result card** — "The AI instantly calculates a Road Health Score (RHS). Here it's 22/100 — CRITICAL. It detected alligator cracks and severe potholes."
6. **Upload 2 more images** for the same `CAM-01` — show the `deterioration_rate` appearing in the table.
7. **The "Wow" Factor (Prediction):** Point to `predicted_critical_at` — "Because we track this over time, our Risk Engine predicts exactly *when* this road will fail. This tells road authorities when they MUST repair it to prevent an accident."
8. **Show heatmap** — "Every camera feeds into this live map. Red means danger now. Authorities can optimize repair routes instantly."
9. **Show AlertBanner** — Point out the alert that popped up in the top right. "If a road drops below a safe threshold, the system pushes instant WebSocket alerts to dispatch teams."
10. **Close with**: "GARUDA is highly scalable and cost-effective because it requires no new hardware. It solves both traffic enforcement and hazard intelligence in one unified platform."

---

## 👨‍💻 Developer Handover (Technical Details)

### 🤖 ML Model
| Property | Value |
|---|---|
| **File** | `ml/models/weights/hazards/yolo12s_RDD2022_best.pt` |
| **Source** | `rezzzq/yolo12s-road-damage-rdd2022` on HuggingFace |
| **License** | MIT (free to use) |
| **Security** | Safe to load (No "suspicious" flags) |
| **Architecture** | YOLOv12-small |
| **Dataset** | RDD2022 (Road Damage Dataset 2022 — global standard) |
| **Size** | ~19 MB (Optimized for edge inference) |

**Classes Detected:**
- `0`: longitudinal_crack (Severity: 0.50)
- `1`: transverse_crack (Severity: 0.65)
- `2`: alligator_crack (Severity: 0.85)
- `3`: pothole (Severity: 1.00 - worst)
- `4`: repair (Severity: 0.05 - road being fixed)

### 📂 Key Files Implemented

#### Backend
- `ml/pipeline/road_hazard_classifier.py`: YOLO inference + Road Health Score (0-100) calculation.
- `backend/services/risk_engine.py`: Linear regression over history → deterioration rate (RHS/day) + predicted critical date.
- `backend/services/hazard_alert_service.py`: Fires WebSocket alerts when RHS < 30 or critical date ≤ 3 days away.
- `backend/api/hazards.py`: 5 REST endpoints (`/stats`, `/`, `/heatmap`, `/alerts`, `/analyze`).
- `backend/core/database.py`: Added `RoadHazardModel` table schema.
- `backend/services/ml_registry.py`: Registers the YOLO model in the global app registry.

#### Frontend
- `src/app/hazards/page.tsx`: Full dashboard with stats cards, map, image uploader, and historical table.
- `src/components/HazardMap.tsx`: Leaflet colour-coded map (🟢 LOW / 🟡 WARNING / 🔴 CRITICAL).
- `src/components/AlertBanner.tsx`: Auto-appearing alert banner (top-right, WebSocket-driven).

---

## 🔌 API Reference (Base URL: `http://localhost:8000`)

- **`GET /api/v1/hazards/stats`**: Dashboard summary stats (counts, avg RHS).
- **`GET /api/v1/hazards/`**: List detections (supports `limit`, `camera_id`, `risk_level` filters).
- **`GET /api/v1/hazards/heatmap`**: Returns GeoJSON FeatureCollection for Leaflet map mapping.
- **`GET /api/v1/hazards/alerts`**: Returns only records where `alert_fired = true`.
- **`POST /api/v1/hazards/analyze`**: Upload image → ML → get results, update DB, and fire alerts.

---

## 🚀 How To Run

### Start Backend
```powershell
cd /path/to/GARUDA
uvicorn backend.main:app --reload --port 8000
```
*(Ensure `yolo12s_RDD2022_best.pt` is present in `ml/models/weights/hazards/`)*

### Start Frontend
```powershell
cd /path/to/GARUDA
npm run dev
```
Open: **http://localhost:3000/hazards**

---

## 🔄 Future Scope (Post-Hackathon)
- **Auto GPS Extraction:** Extract EXIF GPS data from uploaded images automatically.
- **Batch Video Processing:** Analyze dashcam footage frame-by-frame.
- **Mobile Edge Inference:** Run the 19MB YOLO model directly on a smartphone app for crowdsourced road auditing.
- **Automated NHAI Reporting:** Generate daily PDF reports for specific highway stretches.
