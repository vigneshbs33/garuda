"""
GARUDA — Helmet Classification Dataset Builder
=================================================
Converts the Kaggle "Helmet Detection" dataset (andrewmvd/helmet-detection,
Pascal VOC bounding boxes around riders' heads, classes "With Helmet" /
"Without Helmet") into 64x64 classification crops matching the folder
structure expected by ml/training/dataset_prep.py and ml/models/helmet_cnn.py:

    datasets/helmet/{train,val,test}/{helmet,no_helmet}/*.jpg

Split is done by SOURCE IMAGE (not by crop) so that multiple heads from the
same photo never leak across train/val/test.

Usage:
    python -m ml.training.prepare_helmet_data --src data/raw/helmet --out datasets/helmet
"""
from __future__ import annotations

import argparse
import logging
import random
from pathlib import Path

import cv2

from .voc_utils import class_histogram, load_voc_dataset

logger = logging.getLogger(__name__)

CROP_SIZE = 64
PADDING_RATIO = 0.15  # expand bbox slightly so the helmet rim isn't cut off


def _bucket(class_name: str) -> str | None:
    """Map a raw VOC class name to 'helmet' / 'no_helmet'. None = ignore (e.g. 'license plate')."""
    n = class_name.lower()
    if "without" in n or "no_helmet" in n or "no-helmet" in n:
        return "no_helmet"
    if "helmet" in n:  # "with helmet", "helmet", etc.
        return "helmet"
    return None


def build(src_dir: str, out_dir: str, train: float = 0.70, val: float = 0.15, seed: int = 42) -> dict:
    annotations = load_voc_dataset(src_dir)
    if not annotations:
        raise FileNotFoundError(
            f"No VOC annotations found under {src_dir}. "
            "Expected '<src>/images/*.png' + '<src>/annotations/*.xml'."
        )

    hist = class_histogram(annotations)
    logger.info("Raw class histogram: %s", hist)

    out = Path(out_dir)
    for split in ("train", "val", "test"):
        for cls in ("helmet", "no_helmet"):
            (out / split / cls).mkdir(parents=True, exist_ok=True)

    random.seed(seed)
    random.shuffle(annotations)
    n = len(annotations)
    n_train = int(n * train)
    n_val = int(n * val)
    split_map = {}
    for i, ann in enumerate(annotations):
        if i < n_train:
            split_map[ann.image_path] = "train"
        elif i < n_train + n_val:
            split_map[ann.image_path] = "val"
        else:
            split_map[ann.image_path] = "test"

    counts = {"train": {"helmet": 0, "no_helmet": 0}, "val": {"helmet": 0, "no_helmet": 0}, "test": {"helmet": 0, "no_helmet": 0}}
    skipped = 0

    for ann in annotations:
        image = cv2.imread(str(ann.image_path))
        if image is None:
            continue
        h, w = image.shape[:2]
        split = split_map[ann.image_path]

        for idx, obj in enumerate(ann.objects):
            bucket = _bucket(obj.name)
            if bucket is None:
                continue

            bw, bh = obj.xmax - obj.xmin, obj.ymax - obj.ymin
            pad_x, pad_y = int(bw * PADDING_RATIO), int(bh * PADDING_RATIO)
            x1 = max(0, obj.xmin - pad_x)
            y1 = max(0, obj.ymin - pad_y)
            x2 = min(w, obj.xmax + pad_x)
            y2 = min(h, obj.ymax + pad_y)

            crop = image[y1:y2, x1:x2]
            if crop.size == 0 or crop.shape[0] < 8 or crop.shape[1] < 8:
                skipped += 1
                continue

            crop = cv2.resize(crop, (CROP_SIZE, CROP_SIZE), interpolation=cv2.INTER_AREA)
            out_path = out / split / bucket / f"{ann.image_path.stem}_{idx}.jpg"
            cv2.imwrite(str(out_path), crop, [cv2.IMWRITE_JPEG_QUALITY, 95])
            counts[split][bucket] += 1

    logger.info("Skipped %d tiny/invalid crops", skipped)
    return counts


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
    parser = argparse.ArgumentParser(description="Build helmet classification dataset from Kaggle VOC export")
    parser.add_argument("--src", required=True, help="Path to extracted Kaggle dataset (contains images/ + annotations/)")
    parser.add_argument("--out", default="datasets/helmet", help="Output dataset root")
    args = parser.parse_args()

    counts = build(args.src, args.out)
    print("\nHelmet classification dataset built:")
    for split, c in counts.items():
        print(f"  {split:<6} helmet={c['helmet']:<5} no_helmet={c['no_helmet']:<5}")


if __name__ == "__main__":
    main()
