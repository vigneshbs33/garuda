"""
GARUDA — Dataset Preparation Pipeline
=========================================
Handles:
  1. Dataset download from Roboflow (auto API)
  2. Custom Indian traffic dataset builder (from raw video frames)
  3. Class balancing (SMOTE on embeddings for rare violations)
  4. Train/val/test split with stratified sampling
  5. YOLO11n dataset YAML generation
  6. Helmet crop extraction from violation frames

Datasets used:
  - IDD (Indian Driving Dataset): https://idd.insaan.iiit.ac.in/
  - BDD100K: https://bdd-data.berkeley.edu/
  - AI City Challenge: https://www.aicitychallenge.org/
  - Roboflow helmet detection: roboflow.com/universe/datasets/helmet-detection

Usage:
    # Download helmet dataset from Roboflow
    python -m ml.training.dataset_prep --task helmet --roboflow-key YOUR_KEY

    # Build YOLO dataset from raw video frames
    python -m ml.training.dataset_prep --task yolo --video-dir raw_videos/

    # Balance classes
    python -m ml.training.dataset_prep --task balance --dataset-dir datasets/helmet/
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import random
import shutil
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Dataset structure constants
# ---------------------------------------------------------------------------

HELMET_DATASET_STRUCTURE = {
    "train": {"helmet": [], "no_helmet": []},
    "val":   {"helmet": [], "no_helmet": []},
    "test":  {"helmet": [], "no_helmet": []},
}

YOLO_CLASS_NAMES = [
    "person", "bicycle", "car", "motorcycle", "bus", "truck",
    # Custom additions for Indian roads:
    "auto_rickshaw", "tractor", "bullock_cart",
]

VIOLATION_CLASS_NAMES = [
    "no_helmet_rider",       # rider of bike without helmet
    "triple_riding",         # 3+ persons on bike
    "wrong_side_vehicle",    # vehicle on wrong side
    "phone_use",             # phone near driver face
]

# Proportion splits
TRAIN_RATIO = 0.70
VAL_RATIO   = 0.15
TEST_RATIO  = 0.15


# ---------------------------------------------------------------------------
# Helper: frame extractor
# ---------------------------------------------------------------------------

class VideoFrameExtractor:
    """
    Extract frames from raw traffic videos for dataset building.
    
    Parameters
    ----------
    output_dir  : Root directory to save frames
    fps_sample  : Extract 1 frame every N seconds
    max_frames  : Maximum frames per video
    """

    def __init__(
        self,
        output_dir: str = "datasets/raw_frames",
        fps_sample: float = 0.5,
        max_frames: int = 500,
    ) -> None:
        self.output_dir = Path(output_dir)
        self.fps_sample = fps_sample
        self.max_frames = max_frames
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def extract(self, video_path: str, camera_id: str = "cam") -> List[str]:
        """
        Extract frames from a video file.
        Returns list of saved frame paths.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error("Cannot open video: %s", video_path)
            return []

        video_fps = cap.get(cv2.CAP_PROP_FPS) or 30
        sample_every = max(1, int(video_fps / self.fps_sample))

        frames_saved = []
        frame_idx = 0
        saved_count = 0

        while cap.isOpened() and saved_count < self.max_frames:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % sample_every == 0:
                out_path = self.output_dir / f"{camera_id}_{frame_idx:06d}.jpg"
                cv2.imwrite(str(out_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                frames_saved.append(str(out_path))
                saved_count += 1

            frame_idx += 1

        cap.release()
        logger.info("Extracted %d frames from %s", saved_count, video_path)
        return frames_saved

    def extract_directory(self, video_dir: str) -> Dict[str, List[str]]:
        """Extract all videos in a directory"""
        results = {}
        video_exts = {".mp4", ".avi", ".mov", ".mkv", ".ts"}

        for path in Path(video_dir).rglob("*"):
            if path.suffix.lower() in video_exts:
                cam_id = path.stem
                results[cam_id] = self.extract(str(path), cam_id)

        total = sum(len(v) for v in results.values())
        logger.info("Total frames extracted: %d from %d videos", total, len(results))
        return results


# ---------------------------------------------------------------------------
# Helmet crop extractor
# ---------------------------------------------------------------------------

class HelmetCropExtractor:
    """
    Extract helmet/head region crops from labelled frames.
    
    Uses YOLO to detect motorcycles, then crops the head region
    (top 30-40% of motorcycle bounding box) for helmet classification.
    """

    def __init__(
        self,
        output_dir: str = "datasets/helmet",
        crop_size: int = 64,
        min_crop_area: int = 400,
    ) -> None:
        self.output_dir = Path(output_dir)
        self.crop_size  = crop_size
        self.min_area   = min_crop_area
        for split in ("train", "val", "test"):
            for cls in ("helmet", "no_helmet"):
                (self.output_dir / split / cls).mkdir(parents=True, exist_ok=True)

    def extract_from_frame(
        self,
        frame: np.ndarray,
        motorcycle_bboxes: List[List[float]],
        label: str,       # "helmet" or "no_helmet"
        split: str = "train",
        prefix: str = "frame",
    ) -> List[str]:
        """Extract and save head crops from motorcycle detections"""
        saved = []
        for i, bbox in enumerate(motorcycle_bboxes):
            x1, y1, x2, y2 = map(int, bbox)
            h = y2 - y1

            # Head region: top 35% of motorcycle bbox
            head_y2 = y1 + int(h * 0.35)
            crop = frame[max(0, y1) : head_y2, max(0, x1) : min(frame.shape[1], x2)]

            if crop.size < self.min_area or crop.shape[0] < 8 or crop.shape[1] < 8:
                continue

            # Resize to standard input
            crop_resized = cv2.resize(crop, (self.crop_size, self.crop_size))

            out_path = self.output_dir / split / label / f"{prefix}_{i}.jpg"
            cv2.imwrite(str(out_path), crop_resized, [cv2.IMWRITE_JPEG_QUALITY, 92])
            saved.append(str(out_path))

        return saved

    def count_samples(self) -> Dict[str, Dict[str, int]]:
        """Count samples per split per class"""
        counts = {}
        for split in ("train", "val", "test"):
            counts[split] = {}
            for cls in ("helmet", "no_helmet"):
                path = self.output_dir / split / cls
                counts[split][cls] = len(list(path.glob("*.jpg")))
        return counts


# ---------------------------------------------------------------------------
# Dataset balancer
# ---------------------------------------------------------------------------

class DatasetBalancer:
    """
    Balance imbalanced violation classes using:
    1. Oversampling with heavy augmentation (rare classes)
    2. Undersampling (overrepresented background class)
    
    For Indian traffic data:
    - "no_violation" frames are ~85% of raw footage → undersample
    - "triple_riding" and "wrong_side" are rare → oversample with augment
    """

    def __init__(self, dataset_dir: str, target_per_class: int = 2000) -> None:
        self.dataset_dir = Path(dataset_dir)
        self.target = target_per_class

    def balance_helmet_dataset(self) -> Dict[str, int]:
        """
        Balance helmet / no_helmet by augmenting the minority class.
        Returns final counts.
        """
        for split in ("train", "val"):
            helmet_dir    = self.dataset_dir / split / "helmet"
            no_helmet_dir = self.dataset_dir / split / "no_helmet"

            helmet_files    = list(helmet_dir.glob("*.jpg"))
            no_helmet_files = list(no_helmet_dir.glob("*.jpg"))

            h_count  = len(helmet_files)
            nh_count = len(no_helmet_files)

            logger.info(
                "[%s] Before balance: helmet=%d no_helmet=%d",
                split, h_count, nh_count,
            )

            if h_count == 0 or nh_count == 0:
                continue

            # Oversample minority via augmentation
            minority_dir, minority_files, majority_count = (
                (helmet_dir, helmet_files, nh_count)
                if h_count < nh_count
                else (no_helmet_dir, no_helmet_files, h_count)
            )

            needed = majority_count - len(minority_files)
            for i in range(needed):
                src = random.choice(minority_files)
                img = cv2.imread(str(src))
                if img is None:
                    continue
                aug = self._augment(img)
                out_path = minority_dir / f"aug_{i:05d}.jpg"
                cv2.imwrite(str(out_path), aug)

            logger.info("[%s] After balance: +%d augmented samples", split, needed)

        return self._count_all()

    def _augment(self, img: np.ndarray) -> np.ndarray:
        """
        Aggressive augmentation for minority class oversampling.
        Simulates real Indian traffic conditions:
        - Night / low light
        - Motion blur (fast-moving bikes)
        - Haze / dust
        - Camera lens artifacts
        """
        h, w = img.shape[:2]

        # Random horizontal flip
        if random.random() > 0.5:
            img = cv2.flip(img, 1)

        # Random brightness + contrast
        alpha = random.uniform(0.5, 1.7)  # contrast
        beta  = random.randint(-60, 60)   # brightness
        img = np.clip(img.astype(np.float32) * alpha + beta, 0, 255).astype(np.uint8)

        # Motion blur (simulates fast rider)
        if random.random() > 0.4:
            ksize = random.choice([3, 5, 7])
            kernel = np.zeros((ksize, ksize))
            kernel[ksize // 2, :] = 1.0 / ksize
            img = cv2.filter2D(img, -1, kernel)

        # Gaussian noise (sensor noise)
        if random.random() > 0.5:
            noise = np.random.normal(0, random.uniform(5, 20), img.shape).astype(np.float32)
            img = np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)

        # Random rotation ±15°
        if random.random() > 0.5:
            angle = random.uniform(-15, 15)
            M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
            img = cv2.warpAffine(img, M, (w, h))

        # JPEG compression artefacts (low-quality cameras)
        if random.random() > 0.5:
            quality = random.randint(30, 70)
            encode_param = [cv2.IMWRITE_JPEG_QUALITY, quality]
            _, encoded = cv2.imencode('.jpg', img, encode_param)
            img = cv2.imdecode(encoded, 1)

        return img

    def _count_all(self) -> Dict[str, int]:
        counts = {}
        for split in ("train", "val", "test"):
            for cls in ("helmet", "no_helmet"):
                key = f"{split}/{cls}"
                path = self.dataset_dir / split / cls
                counts[key] = len(list(path.glob("*.jpg"))) if path.exists() else 0
        return counts


# ---------------------------------------------------------------------------
# YOLO dataset YAML generator
# ---------------------------------------------------------------------------

def generate_yolo_yaml(
    dataset_path: str,
    yaml_path: str,
    class_names: List[str],
    task: str = "detect",
) -> str:
    """
    Generate YOLO-format dataset YAML.
    Compatible with Ultralytics YOLO11n training.
    """
    yaml_content = f"""# GARUDA — YOLO Dataset Configuration
# Auto-generated by ml/training/dataset_prep.py
# Compatible with: ultralytics >= 8.0.0

path: {os.path.abspath(dataset_path)}
train: images/train
val:   images/val
test:  images/test

nc: {len(class_names)}
names: {class_names}

# Notes:
# - Annotated with LabelImg or Roboflow
# - Indian traffic dataset (IDD + custom dashcam footage)
# - Contains: day/night, rain, dust, motion-blur conditions
"""
    Path(yaml_path).write_text(yaml_content)
    logger.info("YOLO YAML written: %s", yaml_path)
    return yaml_path


# ---------------------------------------------------------------------------
# Roboflow downloader
# ---------------------------------------------------------------------------

def download_roboflow_dataset(
    api_key: str,
    workspace: str,
    project: str,
    version: int,
    format: str = "yolov8",
    location: str = "datasets/",
) -> str:
    """
    Download a labelled dataset from Roboflow Universe.
    Requires: pip install roboflow

    Recommended datasets for GARUDA:
      workspace="ishan-1nnbz", project="indian-helmet-detection", version=1
      workspace="bdd100k", project="bdd100k-vehicle", version=1
      workspace="ai-city", project="traffic-violations", version=3
    """
    try:
        from roboflow import Roboflow  # type: ignore
    except ImportError:
        raise ImportError("pip install roboflow")

    rf = Roboflow(api_key=api_key)
    proj = rf.workspace(workspace).project(project)
    dataset = proj.version(version).download(format, location=location)
    logger.info("Downloaded dataset: %s → %s", project, dataset.location)
    return dataset.location


# ---------------------------------------------------------------------------
# Train/val/test splitter
# ---------------------------------------------------------------------------

def stratified_split(
    src_dir: str,
    out_dir: str,
    class_labels: Optional[Dict[str, str]] = None,
    train: float = TRAIN_RATIO,
    val: float = VAL_RATIO,
    seed: int = 42,
) -> Dict[str, int]:
    """
    Split images in src_dir into train/val/test with stratified sampling.
    
    Parameters
    ----------
    src_dir      : Directory with labelled images
    out_dir      : Output root (creates train/val/test subdirs)
    class_labels : {filename: label} dict. If None, uses subdir structure.
    """
    random.seed(seed)
    src = Path(src_dir)
    out = Path(out_dir)

    # Build class → file list mapping
    class_files: Dict[str, List[Path]] = defaultdict(list)

    if class_labels:
        for fname, label in class_labels.items():
            fpath = src / fname
            if fpath.exists():
                class_files[label].append(fpath)
    else:
        # Use subdirectory structure
        for cls_dir in src.iterdir():
            if cls_dir.is_dir():
                class_files[cls_dir.name] = list(cls_dir.glob("*.jpg")) + list(cls_dir.glob("*.png"))

    counts = {}
    for label, files in class_files.items():
        random.shuffle(files)
        n = len(files)
        n_train = int(n * train)
        n_val   = int(n * val)

        splits = {
            "train": files[:n_train],
            "val":   files[n_train : n_train + n_val],
            "test":  files[n_train + n_val :],
        }

        for split, split_files in splits.items():
            dest = out / split / label
            dest.mkdir(parents=True, exist_ok=True)
            for f in split_files:
                shutil.copy2(f, dest / f.name)

        counts[label] = {"train": len(splits["train"]), "val": len(splits["val"]), "test": len(splits["test"])}
        logger.info("Split [%s]: train=%d val=%d test=%d", label, *counts[label].values())

    return counts


# ---------------------------------------------------------------------------
# Dataset stats reporter
# ---------------------------------------------------------------------------

def print_dataset_stats(dataset_dir: str) -> None:
    root = Path(dataset_dir)
    print(f"\n{'='*50}")
    print(f"GARUDA Dataset Statistics: {dataset_dir}")
    print(f"{'='*50}")

    for split in ("train", "val", "test"):
        split_dir = root / split
        if not split_dir.exists():
            continue
        print(f"\n  [{split.upper()}]")
        total = 0
        for cls_dir in sorted(split_dir.iterdir()):
            if cls_dir.is_dir():
                count = len(list(cls_dir.glob("*.jpg"))) + len(list(cls_dir.glob("*.png")))
                print(f"    {cls_dir.name:<30} {count:>6} samples")
                total += count
        print(f"    {'TOTAL':<30} {total:>6}")

    print(f"\n{'='*50}\n")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="GARUDA Dataset Preparation")
    parser.add_argument("--task", choices=["helmet", "yolo", "balance", "split", "stats"],
                        required=True)
    parser.add_argument("--video-dir",      default="raw_videos/")
    parser.add_argument("--dataset-dir",    default="datasets/helmet/")
    parser.add_argument("--output-dir",     default="datasets/")
    parser.add_argument("--roboflow-key",   default="")
    parser.add_argument("--fps-sample",     type=float, default=0.5)
    parser.add_argument("--max-frames",     type=int,   default=500)
    parser.add_argument("--target-samples", type=int,   default=2000)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    if args.task == "yolo":
        extractor = VideoFrameExtractor(
            output_dir=f"{args.output_dir}/raw_frames",
            fps_sample=args.fps_sample,
            max_frames=args.max_frames,
        )
        results = extractor.extract_directory(args.video_dir)
        total = sum(len(v) for v in results.values())
        print(f"\n✓ Extracted {total} frames from {len(results)} videos → {args.output_dir}/raw_frames")
        print("Next: label with LabelImg or upload to Roboflow for annotation")

    elif args.task == "helmet":
        print("Usage: Python API — see HelmetCropExtractor class")
        print("Required: YOLO detections JSON + raw frames")

    elif args.task == "balance":
        balancer = DatasetBalancer(args.dataset_dir, args.target_samples)
        counts = balancer.balance_helmet_dataset()
        print("\nBalanced dataset:")
        for k, v in counts.items():
            print(f"  {k}: {v}")

    elif args.task == "split":
        counts = stratified_split(args.dataset_dir, args.output_dir)
        print(f"\nSplit complete: {args.output_dir}")

    elif args.task == "stats":
        print_dataset_stats(args.dataset_dir)


if __name__ == "__main__":
    main()
