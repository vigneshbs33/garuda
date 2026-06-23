"""
Real end-to-end evaluation of helmet_best.pt against a labeled Kaggle test
set (andrewmvd/helmet-detection, Pascal VOC XML annotations) the user placed
at temp/testtodeletelater/{images,annotations}/.

Runs the EXACT model used in the live pipeline (AIHelmetViolationDetector's
underlying YOLO model via _run_full_image), IoU-matches predictions to
ground-truth head/helmet boxes (IoU >= 0.5), and reports real precision/
recall/F1 per class plus mAP@0.5 (all-point interpolated AP), the same way
Ultralytics' own val() does it.

No invented numbers — every figure printed here comes directly from running
the actual checkpoint against the actual labeled images.
"""
import glob
import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.services.ml_registry import get_ml_registry

DATA_DIR = "temp/testtodeletelater"
CLASS_MAP = {"With Helmet": "helmet", "Without Helmet": "no_helmet"}
IOU_THRESHOLD = 0.5


def parse_voc(xml_path: str):
    tree = ET.parse(xml_path)
    objs = []
    for obj in tree.findall("object"):
        name = CLASS_MAP.get(obj.find("name").text, obj.find("name").text)
        box = obj.find("bndbox")
        bbox = [float(box.find(t).text) for t in ("xmin", "ymin", "xmax", "ymax")]
        objs.append((name, bbox))
    return objs


def iou(a, b) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def average_precision(preds_sorted, n_gt: int) -> float:
    """All-point interpolated AP from a list of (is_tp: bool) sorted by descending confidence."""
    if n_gt == 0:
        return 0.0
    tp_cum, fp_cum = 0, 0
    precisions, recalls = [], []
    for is_tp in preds_sorted:
        if is_tp:
            tp_cum += 1
        else:
            fp_cum += 1
        precisions.append(tp_cum / (tp_cum + fp_cum))
        recalls.append(tp_cum / n_gt)
    # all-point interpolation: integrate the precision envelope over recall
    pts = sorted(zip(recalls, precisions))
    recalls_sorted = [0.0] + [p[0] for p in pts] + [1.0]
    precisions_sorted = [precisions[0] if precisions else 0.0] + [p[1] for p in pts] + [0.0]
    # make precision envelope monotonically decreasing from the right
    for i in range(len(precisions_sorted) - 2, -1, -1):
        precisions_sorted[i] = max(precisions_sorted[i], precisions_sorted[i + 1])
    ap = 0.0
    for i in range(1, len(recalls_sorted)):
        ap += (recalls_sorted[i] - recalls_sorted[i - 1]) * precisions_sorted[i]
    return ap


def main() -> None:
    ml = get_ml_registry()
    if not ml.available:
        print(f"[FATAL] ML pipeline failed to load: {ml.error}")
        sys.exit(1)

    ah = ml.classifier.ai_helmet
    if ah._model is None:
        print("[FATAL] helmet_best.pt is not loaded — cannot evaluate.")
        sys.exit(1)

    xml_files = sorted(glob.glob(os.path.join(DATA_DIR, "annotations", "*.xml")))
    print(f"Found {len(xml_files)} annotated images")

    # per-class: list of (confidence, is_tp) across the whole dataset, and total GT count
    records = {"helmet": [], "no_helmet": []}
    gt_counts = {"helmet": 0, "no_helmet": 0}
    tp_count = {"helmet": 0, "no_helmet": 0}
    fp_count = {"helmet": 0, "no_helmet": 0}
    fn_count = {"helmet": 0, "no_helmet": 0}

    n_done = 0
    for xml_path in xml_files:
        img_name = Path(xml_path).stem
        img_path = None
        for ext in (".png", ".jpg", ".jpeg"):
            cand = os.path.join(DATA_DIR, "images", img_name + ext)
            if os.path.exists(cand):
                img_path = cand
                break
        if img_path is None:
            continue

        gt_objs = parse_voc(xml_path)
        img = cv2.imread(img_path)
        if img is None:
            continue

        ah._cached_image_id = None  # force fresh inference, no stale cache
        ah._run_full_image(img)
        preds = [("no_helmet", box, conf) for box, conf in ah._cached_heads] + \
                [("helmet", box, conf) for box, conf in ah._cached_helmets]

        for cls in ("helmet", "no_helmet"):
            gt_boxes = [b for c, b in gt_objs if c == cls]
            gt_counts[cls] += len(gt_boxes)
            matched_gt = [False] * len(gt_boxes)

            cls_preds = sorted([p for p in preds if p[0] == cls], key=lambda p: -p[2])
            for _, pbox, conf in cls_preds:
                best_iou, best_idx = 0.0, -1
                for i, gbox in enumerate(gt_boxes):
                    if matched_gt[i]:
                        continue
                    iou_val = iou(pbox, gbox)
                    if iou_val > best_iou:
                        best_iou, best_idx = iou_val, i
                is_tp = best_iou >= IOU_THRESHOLD
                if is_tp:
                    matched_gt[best_idx] = True
                    tp_count[cls] += 1
                else:
                    fp_count[cls] += 1
                records[cls].append((conf, is_tp))
            fn_count[cls] += matched_gt.count(False)

        n_done += 1
        if n_done % 100 == 0:
            print(f"  ...{n_done}/{len(xml_files)} images processed")

    print(f"\nProcessed {n_done} images\n")
    print(f"{'Class':<12} {'GT':>6} {'TP':>6} {'FP':>6} {'FN':>6} {'Precision':>10} {'Recall':>8} {'F1':>8} {'AP@0.5':>8}")
    maps = []
    for cls in ("helmet", "no_helmet"):
        tp, fp, fn = tp_count[cls], fp_count[cls], fn_count[cls]
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        recs_sorted = sorted(records[cls], key=lambda r: -r[0])
        is_tp_sorted = [r[1] for r in recs_sorted]
        ap = average_precision(is_tp_sorted, gt_counts[cls])
        maps.append(ap)
        print(f"{cls:<12} {gt_counts[cls]:>6} {tp:>6} {fp:>6} {fn:>6} {precision:>10.4f} {recall:>8.4f} {f1:>8.4f} {ap:>8.4f}")

    print(f"\nmAP@0.5 (mean over 2 classes): {sum(maps)/len(maps):.4f}")


if __name__ == "__main__":
    main()
