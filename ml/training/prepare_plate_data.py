"""
GARUDA — License Plate YOLO Dataset Builder
==============================================
Converts the Kaggle "Car License Plate Detection" dataset
(andrewmvd/car-plate-detection, Pascal VOC, single class "licence")
into YOLO11 detection format:

    datasets/plate/images/{train,val,test}/*.jpg
    datasets/plate/labels/{train,val,test}/*.txt
    datasets/plate/data.yaml

Split is done by source image, stratified is unnecessary (single class).

Usage:
    python -m ml.training.prepare_plate_data --src data/raw/plate --out datasets/plate
"""
from __future__ import annotations

import argparse
import logging
import random
import shutil
from pathlib import Path

from .voc_utils import load_voc_dataset

logger = logging.getLogger(__name__)

CLASS_NAMES = ["license_plate"]


def build(src_dir: str, out_dir: str, train: float = 0.80, val: float = 0.10, seed: int = 42) -> dict:
    annotations = load_voc_dataset(src_dir)
    if not annotations:
        raise FileNotFoundError(
            f"No VOC annotations found under {src_dir}. "
            "Expected '<src>/images/*.png' + '<src>/annotations/*.xml'."
        )

    out = Path(out_dir)
    for split in ("train", "val", "test"):
        (out / "images" / split).mkdir(parents=True, exist_ok=True)
        (out / "labels" / split).mkdir(parents=True, exist_ok=True)

    random.seed(seed)
    random.shuffle(annotations)
    n = len(annotations)
    n_train = int(n * train)
    n_val = int(n * val)

    counts = {"train": 0, "val": 0, "test": 0}

    for i, ann in enumerate(annotations):
        split = "train" if i < n_train else ("val" if i < n_train + n_val else "test")

        dest_img = out / "images" / split / ann.image_path.name
        shutil.copy2(ann.image_path, dest_img)

        lines = []
        for obj in ann.objects:
            cx = ((obj.xmin + obj.xmax) / 2) / ann.width
            cy = ((obj.ymin + obj.ymax) / 2) / ann.height
            bw = (obj.xmax - obj.xmin) / ann.width
            bh = (obj.ymax - obj.ymin) / ann.height
            lines.append(f"0 {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")

        label_path = out / "labels" / split / f"{dest_img.stem}.txt"
        label_path.write_text("\n".join(lines))
        counts[split] += 1

    yaml_path = out / "data.yaml"
    yaml_path.write_text(
        f"path: {out.resolve()}\n"
        f"train: images/train\n"
        f"val: images/val\n"
        f"test: images/test\n\n"
        f"nc: {len(CLASS_NAMES)}\n"
        f"names: {CLASS_NAMES}\n"
    )
    logger.info("YOLO data.yaml written: %s", yaml_path)
    return counts


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
    parser = argparse.ArgumentParser(description="Build YOLO plate-detection dataset from Kaggle VOC export")
    parser.add_argument("--src", required=True, help="Path to extracted Kaggle dataset (contains images/ + annotations/)")
    parser.add_argument("--out", default="datasets/plate", help="Output dataset root")
    args = parser.parse_args()

    counts = build(args.src, args.out)
    print("\nPlate detection YOLO dataset built:")
    for split, c in counts.items():
        print(f"  {split:<6} images={c}")


if __name__ == "__main__":
    main()
