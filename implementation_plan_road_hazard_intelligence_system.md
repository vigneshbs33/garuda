# 🛣️ GARUDA — Road Hazard Intelligence System
## Developer Handover Document

> **Written for**: Anyone continuing this project  
> **Project path**: `d:\vignesh\files\Personal\Hackthon\flipkart_Gridlock2\GARUDA`  
> **Last verified**: 2026-07-08 — All imports pass, all 6 API routes live  

---

## 📌 What This Project Is

**GARUDA** was originally a traffic *violation* detection system (helmets, seatbelts, red lights).  
This handover documents the **Road Hazard Intelligence extension** added on top of it.

### Hackathon Problem Statement
> *"To develop a cost-effective, road hazard intelligence system which can help prevent accidents due to road anomalies."*

### How We Solve It
A camera or uploaded image is analysed by a YOLO model trained on the **RDD2022** (Road Damage Dataset 2022) global benchmark. The system:

1. **Detects** road damage in real time (potholes, cracks, etc.)
2. **Scores** the road's health from 0–100 (Road Health Score)
3. **Tracks** how fast the road is deteriorating over time (RHS/day)
4. **Predicts** the exact date the road will become critically dangerous
5. **Alerts** road authorities the moment risk crosses a threshold

This makes GARUDA **proactive, not reactive** — it prevents accidents *before* they happen.

---

## 🏗️ System Architecture

```
Camera / Uploaded Image
         │
         ▼
  [Existing] Frame Extractor
         │
         ├──► [Existing] ViolationClassifier  →  Traffic violations
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

## 🤖 ML Model

| Property | Value |
|---|---|
| **File** | `ml/models/weights/hazards/yolo12s_RDD2022_best.pt` |
| **Source** | `rezzzq/yolo12s-road-damage-rdd2022` on HuggingFace |
| **License** | MIT (free to use) |
| **Security** | No "suspicious" flag — safe to load |
| **Architecture** | YOLOv12-small |
| **Dataset** | RDD2022 (Road Damage Dataset 2022 — global standard) |
| **Size** | ~19 MB |

### Classes Detected
| Class ID | Name | Severity Weight |
|---|---|---|
| 0 | `longitudinal_crack` | 0.50 |
| 1 | `transverse_crack` | 0.65 |
| 2 | `alligator_crack` | 0.85 |
| 3 | `pothole` | 1.00 (worst) |
| 4 | `repair` | 0.05 (road being fixed) |

---

## 📁 Every File — What It Does

### New Files (created for this feature)

#### `ml/pipeline/road_hazard_classifier.py`
- Loads the YOLO model
- `analyze_frame(frame)` → list of `HazardDetection` objects
- `compute_road_health_score(detections)` → float 0–100
- `analyze_frame_full(frame)` → `FrameHazardResult` (detections + RHS + risk level)
- Gracefully disables itself if model file is missing (`available = False`)

#### `backend/services/risk_engine.py`
- `compute_deterioration_velocity(db, camera_id)` → async, queries DB history, returns RHS/day slope
- `predict_critical_date(rhs, velocity)` → ISO date string or None
- `get_risk_level(rhs)` → `"LOW"` / `"WARNING"` / `"CRITICAL"`
- `days_until_critical(rhs, velocity)` → integer days or None

#### `backend/services/hazard_alert_service.py`
- `check_and_fire(hazard_record, broadcast_fn)` → fires WS alert if:
  - RHS < 30 (already critical), OR
  - Predicted critical date ≤ 3 days away
- Reuses the existing `/ws/feed` WebSocket already in the project

#### `backend/api/hazards.py`
- FastAPI router, prefix: `/api/v1/hazards`
- See full endpoint table in next section

### Modified Files

#### `backend/core/database.py`
Added `RoadHazardModel` SQLAlchemy table (after line ~187):
```python
class RoadHazardModel(Base):
    __tablename__ = "road_hazards"
    id, camera_id, location, lat, lon, timestamp,
    damage_type, damage_severity_score, road_health_score,
    deterioration_rate, predicted_critical_at, alert_fired,
    frame_path, bbox_json, area_px
```
Also added migration calls in `init_db()` to handle existing databases.

#### `backend/services/ml_registry.py`
- Added `"road_damage"` key to `WEIGHTS` dict
- Added `road_hazard_classifier: Any = None` field to `MLRegistry`
- Added loading code in `_load_registry()` — graceful fallback if model missing

#### `backend/main.py`
- Added `hazards` to import line
- Added `app.include_router(hazards.router, prefix=API_PREFIX, tags=["Road Hazards"])`

#### `src/components/layout/LayoutShell.tsx`
- Added `{ name: "🛣️ Road Hazards", href: "/hazards", ... }` to `menuItems` array

### New Frontend Files

#### `src/app/hazards/page.tsx`
- Full dashboard page at `/hazards`
- Stats cards (Total detections, Critical zones, Warning zones, Alerts fired, Avg RHS)
- Interactive heatmap (Leaflet.js, colour-coded circles)
- Image upload form (camera ID + location + image file)
- Results card (RHS, risk level, damage type, prediction date, alert fired)
- Recent detections table (all fields, auto-refreshes every 15s)

#### `src/components/HazardMap.tsx`
- SSR-safe (uses Next.js `dynamic` import — Leaflet won't run server-side)
- `circleMarker` per detection: 🔴 CRITICAL (r=14), 🟡 WARNING (r=10), 🟢 LOW (r=8)
- Click marker → popup with full hazard detail
- Rebuilds markers when `geojson` prop changes

#### `src/components/AlertBanner.tsx`
- Connects to `ws://localhost:8000/ws/feed`
- Filters for `type === "road_hazard_alert"` messages only
- Shows floating card in top-right corner
- Auto-dismisses after 12 seconds
- Shows up to 5 simultaneous alerts
- Auto-reconnects on disconnect

---

## 🔌 API Reference

Base URL: `http://localhost:8000`

### `GET /api/v1/hazards/stats`
```json
{
  "total_detections": 42,
  "critical_zones": 3,
  "warning_zones": 8,
  "alerts_fired": 2,
  "average_rhs": 67.4
}
```

### `GET /api/v1/hazards/`
Query params: `limit` (1-500), `camera_id`, `risk_level` (CRITICAL/WARNING/LOW)  
Returns: array of hazard objects

### `GET /api/v1/hazards/heatmap`
Returns GeoJSON FeatureCollection. Use with Leaflet or Mapbox.
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [77.59, 12.97] },
      "properties": {
        "id": 1,
        "damage_type": "pothole",
        "road_health_score": 22.5,
        "risk_level": "CRITICAL",
        "predicted_critical": "2026-07-12",
        "alert_fired": true
      }
    }
  ]
}
```

### `GET /api/v1/hazards/alerts`
Returns only records where `alert_fired = true`, newest first.

### `GET /api/v1/hazards/{hazard_id}`
Returns single hazard detail by integer ID.

### `POST /api/v1/hazards/analyze`
**Form data** (multipart):
| Field | Type | Description |
|---|---|---|
| `file` | File | Road image (JPEG/PNG) |
| `camera_id` | string | Sensor/camera identifier |
| `location` | string | Human-readable location |
| `lat` | float | GPS latitude (0 = no GPS) |
| `lon` | float | GPS longitude (0 = no GPS) |

**Response**:
```json
{
  "hazard_id": 1,
  "total_detections": 2,
  "road_health_score": 28.4,
  "risk_level": "CRITICAL",
  "deterioration_rate": -3.2,
  "predicted_critical_at": "2026-07-11",
  "days_until_critical": 3,
  "alert_fired": true,
  "detections": [
    {
      "damage_type": "pothole",
      "confidence": 0.87,
      "severity_score": 0.74,
      "bbox": [120.0, 340.0, 280.0, 450.0],
      "area_px": 16800.0
    }
  ]
}
```

---

## 🔑 Key Thresholds & Business Logic

| Constant | Value | Meaning |
|---|---|---|
| `CRITICAL_RHS` | 30 | Below this → emergency alert fires immediately |
| `WARNING_RHS` | 55 | Below this → warning state |
| `IMMINENT_DAYS` | 3 | Alert fires if critical date ≤ 3 days away |
| `MAX_PREDICT_DAYS` | 90 | Won't predict further than 90 days (too uncertain) |
| `conf_threshold` | 0.25 | YOLO detection confidence cutoff |

### Road Health Score Formula
```
DSS (per detection) = confidence × severity_weight × (0.5 + 0.5 × size_factor)
combined_DSS        = 0.7 × max_DSS  +  0.3 × avg_DSS
RHS                 = 100 − combined_DSS × 100
```
The 70/30 split ensures one severe pothole drags the score down sharply.

### Deterioration Velocity Formula
Linear regression over last 14 days of RHS readings for the same `camera_id`:
```
slope = Σ((xi − x̄)(yi − ȳ)) / Σ((xi − x̄)²)
```
Where `x` = days since first reading, `y` = RHS value.  
**Negative slope** = road getting worse. **Positive** = improving (repairs).

---

## 🚀 How To Run

### Prerequisites
```powershell
# Python deps (already in requirements.txt)
pip install ultralytics

# Frontend deps (already installed)
npm install  # leaflet, react-leaflet, @types/leaflet are already added
```

### Start Backend
```powershell
cd d:\vignesh\files\Personal\Hackthon\flipkart_Gridlock2\GARUDA
uvicorn backend.main:app --reload --port 8000
```
**Expected startup log lines:**
```
MLRegistry: loaded damage model from ...yolo12s_RDD2022_best.pt
MLRegistry: road hazard classifier loaded from ...
Database initialised: sqlite+aiosqlite:///./garuda.db
```

### Start Frontend
```powershell
# In a separate terminal
cd d:\vignesh\files\Personal\Hackthon\flipkart_Gridlock2\GARUDA
npm run dev
```
Open: **http://localhost:3000/hazards**

### Quick API Test (no frontend needed)
```powershell
# Stats
curl http://localhost:8000/api/v1/hazards/stats

# Upload test image
curl -X POST http://localhost:8000/api/v1/hazards/analyze `
  -F "file=@path\to\road_image.jpg" `
  -F "camera_id=CAM-01" `
  -F "location=NH-44 Km 120" `
  -F "lat=12.97" `
  -F "lon=77.59"

# Full interactive API: http://localhost:8000/docs → "Road Hazards" section
```

---

## 🧪 Verification Checklist

Run these in order to confirm everything works:

```
[ ] 1. uvicorn starts without errors
[ ] 2. Startup log shows "road hazard classifier loaded"
[ ] 3. GET http://localhost:8000/api/v1/hazards/stats → returns JSON (not 500)
[ ] 4. POST /analyze with a road image → returns road_health_score
[ ] 5. http://localhost:3000/hazards loads in browser
[ ] 6. Nav sidebar shows "Road Hazards" link
[ ] 7. Upload an image → result card appears below form
[ ] 8. Upload same camera_id 3+ times → deterioration_rate shows in table
[ ] 9. Upload very damaged image (multiple potholes) → RHS < 30 → alert_fired: true
[ ] 10. AlertBanner appears top-right when alert fires
[ ] 11. Heatmap shows coloured circles (add GPS lat/lon to uploads)
```

---

## 🔄 What's Left To Build (Future Work)

These are enhancements that are NOT yet done:

### High Priority
- [ ] **GPS from camera metadata** — currently user manually enters lat/lon. Auto-extract from camera config table (cameras already have `lat` + `lon` columns in DB)
- [ ] **Batch video analysis** — process road survey videos frame-by-frame, one detection per 30 frames
- [ ] **Deterioration chart** — add recharts line chart showing RHS over time per location (recharts already installed in the project)

### Medium Priority
- [ ] **Email/SMS alerts** — hook into existing `sms_service.py` to send alerts to road authority phone numbers
- [ ] **Repair tracking** — when `repair` class is detected after a pothole → mark zone as "fixed", reset RHS
- [ ] **Multi-camera aggregation** — compute zone-level RHS across multiple cameras covering the same road stretch
- [ ] **Export to PDF** — generate inspection report for road authorities

### Nice to Have
- [ ] **Speed-adaptive TTI** — integrate with vehicle speed detection to compute Time-To-Impact (the "GuardianLane" idea)
- [ ] **Mobile/dashcam mode** — run the lightweight model on phone camera in real-time

---

## 🐛 Known Issues & Notes

1. **Leaflet SSR** — `HazardMap.tsx` uses `dynamic(() => import(...), { ssr: false })`. If you add it anywhere new, keep this pattern. Leaflet directly imported will crash Next.js SSR.

2. **Model load time** — The YOLO model takes 3-5 seconds to load on first startup. The API will return 503 on `/analyze` until the registry finishes loading. This is expected.

3. **GPS for heatmap** — The `/heatmap` endpoint filters out records where `lat = 0 AND lon = 0`. For the demo, manually set lat/lon when uploading test images to see points on the map.

4. **History needed for prediction** — `predict_critical_date` returns `null` until there are at least 2 records for the same `camera_id`. Upload 3+ images for the same camera to trigger prediction.

5. **Existing DB** — If `garuda.db` already exists, the migration in `init_db()` will `ALTER TABLE` to add new columns. This is safe and non-destructive.

---

## 📂 Full Project Structure (Road Hazard Files Only)

```
GARUDA/
├── ml/
│   ├── models/weights/hazards/
│   │   └── yolo12s_RDD2022_best.pt          ← THE MODEL (19MB)
│   └── pipeline/
│       └── road_hazard_classifier.py         ← NEW: ML inference
│
├── backend/
│   ├── api/
│   │   └── hazards.py                        ← NEW: REST endpoints
│   ├── core/
│   │   └── database.py                       ← MODIFIED: + RoadHazardModel
│   └── services/
│       ├── ml_registry.py                    ← MODIFIED: + road_hazard_classifier
│       ├── risk_engine.py                    ← NEW: RHS/day + prediction
│       └── hazard_alert_service.py           ← NEW: WebSocket alerts
│   └── main.py                               ← MODIFIED: + hazards router
│
├── src/
│   ├── app/hazards/
│   │   └── page.tsx                          ← NEW: Dashboard page
│   └── components/
│       ├── HazardMap.tsx                     ← NEW: Leaflet map
│       └── AlertBanner.tsx                   ← NEW: WS alert banner
│       └── layout/LayoutShell.tsx            ← MODIFIED: + nav link
│
├── temp/
│   └── yolo12s_RDD2022_best.pt              ← original download location
│
└── implementation_plan_road_hazard_intelligence_system.md  ← THIS FILE
```

---

## 🎯 Demo Script for Judges (2 minutes)

> Run this exact sequence for maximum impact:

1. **Open** `http://localhost:3000/hazards`
2. **Point to stats cards** — say "This tracks road health across all cameras"
3. **Upload** a heavily damaged road image (potholes visible):
   - Camera ID: `CAM-01`, Location: `NH-44 Km 120`, add any lat/lon for map
   - Click "Run Detection"
4. **Show result card** — "RHS is 22/100 — that's CRITICAL"
5. **Upload 2 more images** for the same `CAM-01` — show `deterioration_rate` appearing in table
6. **Point to `predicted_critical_at`** — "The system predicted this road will become dangerous on [date]"
7. **Show heatmap** — "Every camera feeds into this live map — red means danger now"
8. **Show AlertBanner** — if alert fired, it appeared in the top-right corner automatically
9. **Close with**: "This is cost-effective — no new hardware, just existing cameras + our software"

---

*Built on top of GARUDA (original traffic violation platform)*  
*Road Hazard Intelligence extension: 7 new files, 4 modified files, ~19MB model*
