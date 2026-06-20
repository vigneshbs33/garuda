"""
GARUDA — License Plate Detector Training (YOLO11n fine-tune)
================================================================
Fine-tunes YOLO11n on the dataset produced by prepare_plate_data.py to
directly localise license plates (replaces the contour-heuristic in
ml/pipeline/ocr.py::PlateOCR.detect_plate_region).

Produces:
  models/weights/plate_yolo.pt          (best checkpoint, copied for convenience)
  models/weights/plate_metrics.json     (mAP50, mAP50-95, precision, recall)
  runs/detect/garuda_plate/             (full ultralytics run: curves, confusion matrix, samples)

Usage:
    python -m ml.training.train_plate_yolo --data datasets/plate/data.yaml --epochs 60 --device cpu
    python -m ml.training.train_plate_yolo --data datasets/plate/data.yaml --epochs 60 --device 0
"""
from __future__ import annotations

import argparse
import json
import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)


def train(args) -> None:
    from ultralytics import YOLO

    model = YOLO("yolo11n.pt")
    results = model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch_size,
        device=args.device,
        project="runs/detect",
        name="garuda_plate",
        patience=15,
        exist_ok=True,
        verbose=True,
    )

    metrics = model.val(data=args.data, device=args.device)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    best_ckpt = Path(results.save_dir) / "weights" / "best.pt"
    shutil.copy2(best_ckpt, out_dir / "plate_yolo.pt")

    summary = {
        "mAP50": round(float(metrics.box.map50), 4),
        "mAP50_95": round(float(metrics.box.map), 4),
        "precision": round(float(metrics.box.mp), 4),
        "recall": round(float(metrics.box.mr), 4),
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "weights": str(out_dir / "plate_yolo.pt"),
        "full_run_dir": str(results.save_dir),
    }
    with open(out_dir / "plate_metrics.json", "w") as f:
        json.dump(summary, f, indent=2)

    logger.info("=" * 60)
    logger.info("PLATE DETECTOR METRICS: %s", summary)
    logger.info("=" * 60)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
    parser = argparse.ArgumentParser(description="Fine-tune YOLO11n for license plate detection")
    parser.add_argument("--data", default="datasets/plate/data.yaml")
    parser.add_argument("--out", default="models/weights")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    train(args)


if __name__ == "__main__":
    main()
