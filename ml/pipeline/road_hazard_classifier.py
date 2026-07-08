"""
Road Hazard Classifier — GARUDA Road Hazard Intelligence Module
===============================================================
Uses yolo12s_RDD2022_best.pt (RDD2022 dataset) to detect 5 damage classes
on road surfaces and computes a Road Health Score (0-100) per location.

Classes (RDD2022):
    0 → longitudinal_crack
    1 → transverse_crack
    2 → alligator_crack
    3 → pothole
    4 → repair

Usage::
    from ml.pipeline.road_hazard_classifier import RoadHazardClassifier

    clf = RoadHazardClassifier(model_path="ml/models/weights/hazards/yolo12s_RDD2022_best.pt")
    detections = clf.analyze_frame(frame)
    rhs = clf.compute_road_health_score(detections)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# RDD2022 class labels
# ---------------------------------------------------------------------------

DAMAGE_CLASS_MAP: dict[int, str] = {
    0: "longitudinal_crack",
    1: "transverse_crack",
    2: "alligator_crack",
    3: "pothole",
    4: "repair",
}

# Severity weights — how much each damage type degrades the road health score
# Higher = worse, repair = nearly neutral (road was fixed)
SEVERITY_WEIGHT: dict[str, float] = {
    "pothole":            1.00,
    "alligator_crack":    0.85,
    "transverse_crack":   0.65,
    "longitudinal_crack": 0.50,
    "repair":             0.05,
    "unknown":            0.40,
}

CRITICAL_RHS = 30.0   # Below this = emergency alert
WARNING_RHS  = 55.0   # Below this = warning state


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class HazardDetection:
    """A single road damage detection from one frame."""
    damage_type    : str
    confidence     : float
    severity_score : float          # 0.0 – 1.0, computed DSS
    bbox           : list[float]    # [x1, y1, x2, y2] pixels
    area_px        : float = 0.0    # bounding box area in pixels
    frame_w        : int   = 0
    frame_h        : int   = 0

    @property
    def bbox_fraction(self) -> float:
        """Bbox area as fraction of total frame area."""
        total = max(self.frame_w * self.frame_h, 1)
        return self.area_px / total


@dataclass
class FrameHazardResult:
    """Aggregated result for a single frame."""
    detections         : list[HazardDetection]
    road_health_score  : float          # 0 – 100
    primary_damage     : str            # most severe detected type
    total_detections   : int
    risk_level         : str            # "LOW" | "WARNING" | "CRITICAL"


# ---------------------------------------------------------------------------
# Classifier
# ---------------------------------------------------------------------------

class RoadHazardClassifier:
    """
    Wraps the RDD2022-trained YOLO model.
    Gracefully degrades when the model file is missing (available=False).
    """

    def __init__(self, model_path: str | None = None):
        self.model = None
        self._model_path = model_path
        if model_path:
            self._load(model_path)

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def available(self) -> bool:
        return self.model is not None

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    def _load(self, path: str) -> None:
        if not Path(path).exists():
            logger.warning(
                "RoadHazardClassifier: model not found at %s — classifier disabled", path
            )
            return
        try:
            from ultralytics import YOLO
            self.model = YOLO(path)
            logger.info("RoadHazardClassifier: loaded model from %s", path)
        except Exception as exc:
            logger.error("RoadHazardClassifier: failed to load — %s", exc)

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    def analyze_frame(
        self,
        frame: np.ndarray,
        conf_threshold: float = 0.25,
    ) -> list[HazardDetection]:
        """
        Run road damage detection on a single BGR frame.
        Returns a (possibly empty) list of HazardDetection objects.
        """
        if not self.available:
            return []

        h, w = frame.shape[:2]
        frame_area = max(h * w, 1)
        detections: list[HazardDetection] = []

        try:
            results = self.model(frame, conf=conf_threshold, verbose=False)[0]

            for box in results.boxes:
                cls_id      = int(box.cls[0])
                confidence  = float(box.conf[0])
                xyxy        = box.xyxy[0].tolist()          # [x1,y1,x2,y2]
                damage_type = DAMAGE_CLASS_MAP.get(cls_id, "unknown")

                bw      = xyxy[2] - xyxy[0]
                bh      = xyxy[3] - xyxy[1]
                area_px = bw * bh

                # Damage Severity Score (DSS):
                #   confidence × type_weight × size_factor
                # size_factor approaches 1.0 when bbox covers ≥2% of frame
                size_factor   = min(area_px / frame_area * 50, 1.0)
                type_weight   = SEVERITY_WEIGHT.get(damage_type, 0.40)
                dss           = confidence * type_weight * (0.5 + 0.5 * size_factor)
                dss           = min(round(dss, 4), 1.0)

                detections.append(HazardDetection(
                    damage_type    = damage_type,
                    confidence     = round(confidence, 4),
                    severity_score = dss,
                    bbox           = [round(v, 1) for v in xyxy],
                    area_px        = round(area_px, 1),
                    frame_w        = w,
                    frame_h        = h,
                ))

            logger.debug(
                "RoadHazardClassifier: %d detections on %dx%d frame",
                len(detections), w, h,
            )

        except Exception as exc:
            logger.error("RoadHazardClassifier.analyze_frame: %s", exc, exc_info=True)

        return detections

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    def compute_road_health_score(self, detections: list[HazardDetection]) -> float:
        """
        Aggregate detections into a Road Health Score (0 – 100).
        100 = perfect, 0 = completely deteriorated.

        Formula:
            combined_dss = 0.7 × max_dss  +  0.3 × avg_dss
            RHS = 100 − combined_dss × 100
        The max term ensures one severe pothole drags the score down sharply.
        """
        if not detections:
            return 100.0

        # Exclude repair detections from scoring (repairs improve the road)
        damage_only = [d for d in detections if d.damage_type != "repair"]
        if not damage_only:
            return 95.0   # Only repairs seen — road being maintained

        max_dss = max(d.severity_score for d in damage_only)
        avg_dss = sum(d.severity_score for d in damage_only) / len(damage_only)
        combined = 0.7 * max_dss + 0.3 * avg_dss
        rhs = max(0.0, 100.0 - combined * 100.0)
        return round(rhs, 1)

    def analyze_frame_full(self, frame: np.ndarray, conf_threshold: float = 0.25) -> FrameHazardResult:
        """Convenience: run analysis + scoring in one call."""
        detections = self.analyze_frame(frame, conf_threshold)
        rhs        = self.compute_road_health_score(detections)

        if rhs < CRITICAL_RHS:
            risk_level = "CRITICAL"
        elif rhs < WARNING_RHS:
            risk_level = "WARNING"
        else:
            risk_level = "LOW"

        # Primary damage = highest severity type detected
        primary = "none"
        if detections:
            primary = max(detections, key=lambda d: d.severity_score).damage_type

        return FrameHazardResult(
            detections        = detections,
            road_health_score = rhs,
            primary_damage    = primary,
            total_detections  = len(detections),
            risk_level        = risk_level,
        )

    @staticmethod
    def risk_level(rhs: float) -> str:
        if rhs < CRITICAL_RHS:
            return "CRITICAL"
        elif rhs < WARNING_RHS:
            return "WARNING"
        return "LOW"
