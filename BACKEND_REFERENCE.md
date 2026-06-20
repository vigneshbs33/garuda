# GARUDA — Backend Reference Guide
**For frontend developers and integration partners**

---

## What is GARUDA?

GARUDA is an **edge-native, automated traffic violation detection system**. A camera feed is processed locally (no cloud) through a multi-stage ML pipeline that detects violations, reads license plates, and either auto-issues challans or escalates uncertain cases to patrol officers.

---

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Copy and fill env
cp .env.example .env

# 3. Start backend
uvicorn backend.main:app --reload --port 8000

# 4. Open Swagger docs
open http://localhost:8000/docs

# 5. Open frontend dashboard
open frontend/index.html
```

---

## System Architecture

```
Camera Feed
    ↓
[Preprocessor]   ← CLAHE + denoising + gamma correction
    ↓
[Detector]       ← YOLO11n → detects cars, bikes, people
    ↓
[Tracker]        ← ByteTrack → assigns persistent IDs
    ↓
[Violation Classifier]  ← 8 violation types
    ↓
[Driver State]   ← MediaPipe FaceMesh → drowsiness, yawn, phone
    ↓
[OCR]            ← PaddleOCR → license plate text
    ↓
[Confidence Router]  ← 3-tier routing decision
    ↓
┌─────────────────────┐
│  TIER 1 (conf≥0.90) │ → AUTO_CHALLAN (saved to DB, no human needed)
│  TIER 2 (conf≥0.60) │ → HUMAN_REVIEW (WhatsApp alert to officer)
│  TIER 3 (conf<0.60) │ → LOG_WITH_PLATE / DISCARD
└─────────────────────┘
    ↓
[Evidence Packager]  ← annotated JPEG + JSON record
    ↓
[FastAPI Backend]    ← REST API + WebSocket
    ↓
[Frontend Dashboard]
```

---

## API Base URL

```
http://localhost:8000/api/v1
```

Interactive docs: `http://localhost:8000/docs`

---

## Authentication

**None by default** (add JWT or API key middleware before production deployment).

---

## REST Endpoints

### Violations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/violations` | List violations (paginated, filterable) |
| GET | `/violations/{id}` | Get single violation with full JSON |
| POST | `/violations/ingest` | Submit new violation from ML pipeline |
| POST | `/violations/{id}/confirm` | Officer confirms → auto-challan |
| POST | `/violations/{id}/reject` | Officer rejects → false positive |
| GET | `/violations/{id}/image` | Redirect to annotated evidence image |

#### List Violations — Query Params
| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Page number (default 1) |
| `page_size` | int | Items per page (max 100, default 20) |
| `tier` | int | Filter by tier 1/2/3 |
| `status` | str | `pending` / `auto_challan` / `confirmed` / `rejected` |
| `camera_id` | str | Filter by camera |
| `type` | str | Violation type string |
| `date_from` | str | ISO date `YYYY-MM-DD` |
| `date_to` | str | ISO date `YYYY-MM-DD` |

#### Violation Status Values
| Status | Meaning |
|--------|---------|
| `pending` | Tier 2 — awaiting officer action |
| `auto_challan` | Tier 1 — auto-issued, no review needed |
| `confirmed` | Officer confirmed, challan issued |
| `rejected` | Officer rejected (false positive) |
| `discarded` | Tier 3, too low confidence |

---

### Cameras

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/cameras` | List all registered cameras |
| POST | `/cameras` | Register a new camera |
| GET | `/cameras/{id}` | Get single camera info |
| PUT | `/cameras/{id}/config` | Update stop line, description |
| DELETE | `/cameras/{id}` | Remove camera |

#### Register Camera — Body
```json
{
  "id":          "BLR-CAM-MG-ROAD-001",
  "location":    "MG Road & Brigade Road Intersection",
  "lat":         12.9753,
  "lon":         77.6069,
  "stop_line_y": 380,
  "description": "4-lane junction, 30 km/h zone"
}
```

---

### Vehicles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vehicles/{plate}` | Vehicle history by plate |
| GET | `/vehicles/repeat` | All repeat offenders |
| DELETE | `/vehicles/{plate}/clear` | Admin: reset vehicle record |

---

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/summary` | Today + week totals, type breakdown |
| GET | `/analytics/trends?days=30` | Daily violation counts over N days |
| GET | `/analytics/heatmap` | Per-camera counts with lat/lon for Leaflet |

---

### Debug Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/debug/inject-violation` | Create fake violation (for testing) |
| GET | `/debug/pipeline-status` | Shows which ML modules are installed |

#### Inject Test — Body
```json
{
  "violation_type": "helmet_non_compliance",
  "confidence": 0.75,
  "tier": 2,
  "plate": "KA-01-AB-1234",
  "camera_id": "BLR-CAM-DEMO-001",
  "location": "MG Road"
}
```

---

## WebSocket — Live Feed

```
ws://localhost:8000/ws/feed
```

Connect from frontend:
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/feed');
ws.onmessage = (evt) => {
  const data = JSON.parse(evt.data);
  if (data.event === 'violation_detected') {
    // data.violation_id, data.violation_type, data.confidence,
    // data.tier, data.plate, data.camera_id, data.location,
    // data.timestamp, data.severity, data.annotated_image_url
  }
};
```

### Event Types
| Event | When | Fields |
|-------|------|--------|
| `connected` | On connect | `message` |
| `violation_detected` | New violation | See above |
| `system_stats` | Every 10s | `fps`, `active_cameras`, `violations_today`, `tier1`, `tier2` |
| `pong` | Reply to `ping` | — |

Send `"ping"` (string) to keep connection alive.

---

## Static Files — Evidence Images

Annotated JPEGs are served at:
```
GET /evidence/annotated/{violation_id}.jpg
```

Raw (unannotated) frames:
```
GET /evidence/raw/{violation_id}_raw.jpg
```

---

## ML Pipeline — Violation Types

| Type | Description | Fine (₹) | Severity |
|------|-------------|----------|----------|
| `helmet_non_compliance` | Rider without helmet | 1,000 | High |
| `seatbelt_non_compliance` | Driver without seatbelt | 1,000 | Medium |
| `triple_riding` | 3+ persons on 2-wheeler | 2,000 | High |
| `wrong_side_driving` | Vehicle against traffic | 5,000 | Critical |
| `red_light_violation` | Crossing on red | 1,000 | High |
| `stop_line_violation` | Encroaching stop line | 500 | Medium |
| `illegal_parking` | Parked in no-parking zone (>5 min) | 500 | Low |
| `phone_use_while_driving` | Phone detected in hand | 5,000 | High |
| `drowsy_driving` | Eyes closed >1.5s | 2,000 | Critical |

---

## Confidence Router

```
TIER 1 (conf ≥ 0.90) → AUTO_CHALLAN
  • Evidence saved, challan auto-generated
  • No human intervention needed

TIER 2 (0.60 ≤ conf < 0.90) → HUMAN_REVIEW
  • WhatsApp + SMS alert to nearest officer
  • Officer has 10 min to CONFIRM or reject (FP)
  • Officer response → federated learning training data

TIER 3 (conf < 0.60) → LOG_WITH_PLATE / DISCARD
  • Stored for audit trail only
  • Cross-reference repeat offender DB

OVERRIDE → Repeat offender always escalates to TIER 2 (HIGH priority)
```

---

## Federated Learning

No raw video leaves the camera. Only **model weight deltas** are sent to the central server:

```bash
# On edge node (camera server):
python -m ml.federated.client \
    --server-address central:8080 \
    --camera-id BLR-CAM-MG-001

# On central server (run weekly):
python -m ml.federated.server \
    --port 8080 --rounds 3 --min-cameras 3

# Local simulation (no hardware needed):
python -c "from ml.federated.server import simulate_training; simulate_training(5, 3)"
```

---

## Running the Full Demo

```bash
# Test image (shows step-by-step logs)
python ml/demo_pipeline.py --input sample.jpg --verbose

# Test video
python ml/demo_pipeline.py --input traffic.mp4 --video

# Webcam + driver state + show window
python ml/demo_pipeline.py --webcam --driver-state --show

# Export YOLO11n to TensorRT for Jetson
python -c "
from ml.pipeline.detector import VehicleDetector
d = VehicleDetector()
d.export_tensorrt(half=True)
"
```

---

## Database Schema (Quick Reference)

```sql
violations (
  id TEXT PRIMARY KEY,          -- VIO-BLR-YYYYMMDD-HHmmss-XXXXXX
  camera_id TEXT,
  location TEXT,
  timestamp TEXT,               -- ISO UTC
  violation_type TEXT,
  confidence REAL,
  severity TEXT,                -- critical/high/medium/low
  tier INTEGER,                 -- 1/2/3
  action TEXT,                  -- AUTO_CHALLAN/HUMAN_REVIEW/...
  fine_amount INTEGER,
  plate_text TEXT,
  plate_conf REAL,
  vehicle_class TEXT,
  annotated_img TEXT,           -- path to annotated JPEG
  raw_img TEXT,
  json_record TEXT,             -- full evidence JSON
  status TEXT,                  -- pending/auto_challan/confirmed/rejected
  officer_id TEXT,
  created_at TEXT
)

cameras (id, location, lat, lon, stop_line_y, status, last_seen, description)

vehicles (plate, violation_count, is_repeat_offender, first_seen, last_seen, violations_json, state_code)
```

---

## Frontend Migration Guide

The vanilla frontend (`frontend/`) is intentionally simple. To migrate to React/Vue:

1. **API calls**: Everything is in `frontend/js/api.js`. Import as-is or rewrite as `fetch`/`axios` calls.
2. **WebSocket**: Copy `GarudaWS` from `frontend/js/websocket.js` or use the same pattern with `useEffect`.
3. **Charts**: Replace `GarudaCharts` with Recharts/Victory — same data shapes.
4. **Map**: Replace `GarudaMap` with `react-leaflet` — same `API.getHeatmapData()` call.
5. **Base URL**: Change `BASE_URL` in `api.js` or set an env var.

---

## Environment Variables (Key Ones)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./garuda.db` | Switch to Postgres for prod |
| `DEVICE` | `cpu` | `cuda:0` for GPU |
| `STOP_LINE_Y` | `380` | Pixel Y of stop line (calibrate!) |
| `CONFIDENCE_TIER1` | `0.90` | Auto-challan threshold |
| `CONFIDENCE_TIER2` | `0.60` | Human review threshold |
| `ALERTS_ENABLED` | `false` | Set `true` + Twilio creds for real SMS |
| `FL_ENABLED` | `false` | Enable federated learning client |

---

## Contact

- **ML & Backend**: You (the ML engineer)
- **Frontend & UX**: Your friend
- This file: `BACKEND_REFERENCE.md` — keep updated as the system evolves.
