# 🚦 GARUDA — "Gridlock Guardian"
### Automated Traffic Violation Detection — Flipkart Gridlock 3.0

An edge-native, ML-driven pipeline that detects traffic violations from camera images, reads license plates, routes uncertain cases to human officers, and surfaces everything on a live dashboard.

This README documents what's actually built and measured — not the pitch deck version. For the full ML architecture notes and an honest status checklist, see [`ml_plan.txt`](ml_plan.txt). For the backend API contract, see [`BACKEND_REFERENCE.md`](BACKEND_REFERENCE.md).

---

## Architecture

```
Camera image
    │
    ▼
Preprocessing (CLAHE, denoise, gamma correction)        ml/pipeline/preprocessor.py
    │
    ▼
Detection — YOLO11n (vehicles, persons)                 ml/pipeline/detector.py
    │
    ▼
Tracking — ByteTrack (within-camera)                     ml/pipeline/tracker.py
    │
    ▼
Violation Classifier — 9 violation types                ml/pipeline/violation_classifier.py
  (helmet uses a TRAINED CNN, see below)
    │
    ▼
License Plate — TRAINED YOLO detector + OCR fallback     ml/pipeline/ocr.py
    │
    ▼
Confidence Router — Tier 1/2/3 + repeat-offender rule    ml/pipeline/confidence_router.py
    │
    ▼
Evidence Packager — annotated JPEG + JSON record          ml/utils/evidence.py
    │
    ▼
FastAPI Backend (REST + WebSocket, async SQLAlchemy DB)   backend/
    │
    ▼
Next.js Dashboard (dashboard, violations, analytics,      src/app/
  cameras, review queue, patrol, search, settings, login)
```

`ml/demo_pipeline.py --backend-url http://localhost:8000` is what actually connects the ML side to the live backend — it POSTs real detections to `/api/v1/violations/ingest`, so the dashboard reflects genuine model output, not just `/debug/inject-violation` test data.

---

## ML — Datasets, Models, and Real Measured Results

This is the part judges should look at closely. Two models were actually trained (not just architected) on real public datasets, with real held-out evaluation — every number below is traceable to the source Kaggle pages and the raw metrics JSON files in `ml/models/weights/`:

### 1. Helmet compliance classifier

| | |
|---|---|
| **Architecture** | MobileNetV3-Small backbone (ImageNet-pretrained) + custom head — `ml/models/helmet_cnn.py` |
| **Parameters** | 1,075,234 (~1.1M — light enough for edge deployment) |
| **Dataset** | [Kaggle — andrewmvd/helmet-detection](https://www.kaggle.com/datasets/andrewmvd/helmet-detection) — 764 source images, Pascal VOC bounding boxes around riders' heads, classes "With Helmet" / "Without Helmet". Each image can contain multiple riders, so the actual number of trained crops is higher than 764 — exact count wasn't logged during the Colab run, so it isn't quoted here rather than guess. |
| **Split** | 70/15/15 train/val/test, split by source image (no leakage across splits) |
| **Test accuracy** | **87.44%** (n=215 held-out crops) |
| **Precision / Recall** | 86.75% / 81.82% |
| **F1** | 84.21% |
| **Confusion matrix** | TP=72, TN=116, FP=11, FN=16 |
| **Best val accuracy during training** | 94.1% (epoch 14 of 25) |

Training curves and confusion matrix: `ml/models/weights/helmet_training_report.png`. Raw numbers: `ml/models/weights/helmet_metrics.json`.

### 2. License plate detector

| | |
|---|---|
| **Architecture** | YOLO11n, fine-tuned from COCO-pretrained weights — `ml/training/train_plate_yolo.py` |
| **Dataset** | [Kaggle — andrewmvd/car-plate-detection](https://www.kaggle.com/datasets/andrewmvd/car-plate-detection) — 433 source images, Pascal VOC, single class "licence" |
| **Split** | 80/10/10 train/val/test |
| **Validation instances** | 49 plate boxes across the 43 validation images (logged directly by the Ultralytics training run — some images have more than one visible plate) |
| **Training** | 60 epochs requested, early-stopped at epoch 38 (no improvement for 15 epochs) |
| **mAP@0.5** | **88.16%** |
| **mAP@0.5:0.95** | 51.02% |
| **Precision / Recall** | 84.35% / 83.67% |

PR curves, F1 curve, confusion matrix: `ml/models/weights/*.png`. Raw numbers: `ml/models/weights/plate_metrics.json`.

Both checkpoints (`helmet_cnn.pt`, `plate_yolo.pt`) are committed in `ml/models/weights/` and auto-load in `demo_pipeline.py` — if the files are missing, the pipeline degrades gracefully to a heuristic (edge-density/Hough-line based, lower confidence, always routed to human review) rather than crashing.

### How these were trained (reproducible)

Training was done on free Google Colab GPU (T4), not this dev machine. Full pipeline:

1. `ml/training/voc_utils.py` — parses the Kaggle Pascal-VOC exports
2. `ml/training/prepare_helmet_data.py` — crops head/helmet bounding boxes into 64×64 classification images
3. `ml/training/prepare_plate_data.py` — converts plate bounding boxes into YOLO label format
4. `ml/training/train_helmet.py` — PyTorch training loop, outputs accuracy/precision/recall/F1/confusion matrix
5. `ml/training/train_plate_yolo.py` — wraps `ultralytics` training + validation
6. `ml/training/GARUDA_Train_Colab.ipynb` — self-contained notebook bundling all of the above; upload to Colab, run top to bottom, download the resulting weights+metrics zip

### What's a trained model vs. what's rule-based logic

Not every violation in the problem statement needs (or has) a trained model — most are geometry/temporal logic on top of the YOLO detector + tracker, which is the correct design, not a shortcut:

| Violation | Method |
|---|---|
| Helmet non-compliance | **Trained CNN** (above) |
| License plate | **Trained YOLO detector** (above) + PaddleOCR/EasyOCR/Tesseract fallback chain for text |
| Phone use while driving | YOLO11n COCO class 67 ("cell phone") — no extra training needed |
| Triple riding | Geometry: count person-boxes inside a 2-wheeler box |
| Wrong-side driving | Tracker velocity vector vs. expected traffic direction |
| Stop-line / Red-light | Bbox position vs. calibrated stop-line `y` + HSV signal-color detection |
| Illegal parking | Stationary-duration timer in a calibrated no-parking zone |
| Seatbelt | Hough-line heuristic (diagonal belt line) — intentionally capped at low confidence, always sent to human review |
| Drowsy driving | MediaPipe FaceMesh, Eye Aspect Ratio < 0.25 sustained |

### Known limitations (stated plainly, not buried)

- **Edge export untested**: `detector.py` has real `export_tensorrt()`/`export_tflite()` calls, but no Jetson/Raspberry Pi hardware was available to actually run them — no `.engine`/`.tflite` file has ever been produced, and FPS numbers anywhere in `ml_plan.txt` predating this are unverified targets, not measurements.
- **Cross-camera vehicle re-identification** (matching the same vehicle across different camera feeds) is not implemented — no OSNet/torchreid code exists in this repo.
- **Federated learning** (`ml/federated/`) has real Flower/FedAvg wiring, but the local training step is currently a no-op stub — officer corrections are collected but not yet used to retrain.
- License plate **OCR accuracy** (character-level) hasn't been separately benchmarked — only plate *localization* (YOLO) has a measured mAP. Install `paddleocr` or `easyocr` and provide a labeled plate-text test set to get that number.

---

## Tech Stack

```
ML:        YOLO11n (Ultralytics), MobileNetV3-Small, ByteTrack, MediaPipe FaceMesh,
           PaddleOCR/EasyOCR/Tesseract, OpenCV, PyTorch, Albumentations
Backend:   FastAPI (async), SQLAlchemy 2.0 (async), SQLite (dev) / PostgreSQL (prod),
           Pydantic v2, WebSocket, Twilio (mock mode)
Frontend:  Next.js 16 (App Router), React 19, TypeScript
Federated: Flower (flwr) — wiring only, training stub
```

---

## Running It

### Backend + ML

```bash
pip install -r requirements.txt
cp .env.example .env
uvicorn backend.main:app --reload --port 8000      # http://localhost:8000/docs

# Run the ML pipeline on an image and push real results into the backend:
python ml/demo_pipeline.py --input sample.jpg --backend-url http://localhost:8000 --verbose

# Or with driver-state (drowsiness/phone) analysis:
python ml/demo_pipeline.py --input sample.jpg --driver-state --backend-url http://localhost:8000
```

### Frontend dashboard

```bash
npm install
npm run dev      # http://localhost:3000
```

### Re-train the ML models

Open `ml/training/GARUDA_Train_Colab.ipynb` in Google Colab (free GPU), run all cells, drop the resulting `helmet_cnn.pt` / `plate_yolo.pt` into `ml/models/weights/`.

---

## Project Structure

```
ml/            ML pipeline, trained models, training scripts          → see ml_plan.txt
backend/       FastAPI REST + WebSocket API, async DB                 → see BACKEND_REFERENCE.md
src/           Next.js dashboard (App Router)
frontend/      Legacy vanilla HTML/JS dashboard (superseded by src/)
ps.txt         Original hackathon problem statement (unmodified)
```

---

*Team CodeKrafters | Flipkart Gridlock 3.0*
