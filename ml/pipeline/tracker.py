"""
GARUDA ML Pipeline — Multi-Object Tracker
==========================================
Wraps Ultralytics ByteTrack to maintain per-vehicle frame history,
velocity vectors, and stop-line crossing state for violation detection.

ByteTrack handles:
  - Track assignment (Hungarian algorithm + IoU)
  - Track lifecycle (new / active / lost / removed)
  - Persistent IDs across occlusions
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

from .detector import Detection


# ---------------------------------------------------------------------------
# Per-frame track entry
# ---------------------------------------------------------------------------

@dataclass
class FrameEntry:
    frame_idx: int
    timestamp: float
    bbox: List[float]
    confidence: float
    class_name: str


# ---------------------------------------------------------------------------
# Per-vehicle track state
# ---------------------------------------------------------------------------

@dataclass
class TrackState:
    track_id: int
    class_name: str
    first_seen_frame: int
    first_seen_time: float = field(default_factory=time.time)
    history: deque = field(default_factory=lambda: deque(maxlen=60))  # ~2s at 30fps
    is_active: bool = True
    crossed_stop_line: bool = False
    flagged_violation: bool = False

    # Parking state
    parking_start_time: Optional[float] = None

    def add_frame(self, entry: FrameEntry) -> None:
        self.history.append(entry)

    @property
    def latest(self) -> Optional[FrameEntry]:
        return self.history[-1] if self.history else None

    @property
    def age_frames(self) -> int:
        if not self.history:
            return 0
        return self.history[-1].frame_idx - self.first_seen_frame

    def velocity(self, window: int = 10) -> Tuple[float, float]:
        """
        Return (vx, vy) pixel velocity averaged over last `window` frames.
        Positive vy = moving down (toward camera / bottom of frame).
        """
        entries = list(self.history)
        if len(entries) < 2:
            return 0.0, 0.0
        recent = entries[-min(window, len(entries)):]
        centers = [
            ((e.bbox[0] + e.bbox[2]) / 2, (e.bbox[1] + e.bbox[3]) / 2)
            for e in recent
        ]
        dt = max(len(centers) - 1, 1)
        vx = (centers[-1][0] - centers[0][0]) / dt
        vy = (centers[-1][1] - centers[0][1]) / dt
        return vx, vy

    def is_stationary(self, threshold_px: float = 5.0, window: int = 15) -> bool:
        """True if vehicle hasn't moved more than threshold_px in last window frames"""
        vx, vy = self.velocity(window)
        return abs(vx) < threshold_px and abs(vy) < threshold_px

    def direction_vector(self, window: int = 20) -> np.ndarray:
        """Unit vector of motion direction"""
        vx, vy = self.velocity(window)
        vec = np.array([vx, vy], dtype=float)
        norm = np.linalg.norm(vec)
        return vec / norm if norm > 1e-6 else np.array([0.0, 0.0])

    def bboxes_in_window(self, window: int = 15) -> List[List[float]]:
        entries = list(self.history)
        return [e.bbox for e in entries[-window:]]

    def crossed_line(self, line_y: int, direction: str = "any") -> bool:
        """
        True if bottom of vehicle bbox has crossed line_y in recent history.
        direction: "down" | "up" | "any"
        """
        bboxes = self.bboxes_in_window(20)
        if len(bboxes) < 2:
            return False

        fronts = [b[3] for b in bboxes]  # y2 = vehicle front (bottom of bbox)
        for i in range(1, len(fronts)):
            prev_y, curr_y = fronts[i - 1], fronts[i]
            if direction == "down" and prev_y < line_y <= curr_y:
                return True
            if direction == "up" and prev_y > line_y >= curr_y:
                return True
            if direction == "any" and (
                (prev_y < line_y <= curr_y) or (prev_y > line_y >= curr_y)
            ):
                return True
        return False


# ---------------------------------------------------------------------------
# Tracker registry
# ---------------------------------------------------------------------------

class VehicleTracker:
    """
    Manages per-vehicle TrackState objects for the full scene.

    This class does NOT run ByteTrack itself — that's done inside
    VehicleDetector.detect_with_tracking(). This class consumes the
    track_id-annotated Detection objects and maintains history.

    Usage (video loop):
        tracker = VehicleTracker(stop_line_y=380)
        for frame, detections in detector.stream_video(source):
            tracked = detector.detect_with_tracking(frame)
            tracker.update(tracked, frame_idx)
            violations = tracker.check_stop_line_crossings(signal_state)
    """

    def __init__(
        self,
        stop_line_y: int = 400,
        max_lost_frames: int = 30,
        parking_threshold_sec: float = 300.0,  # 5 minutes
    ) -> None:
        self.stop_line_y = stop_line_y
        self.max_lost_frames = max_lost_frames
        self.parking_threshold_sec = parking_threshold_sec

        self._tracks: Dict[int, TrackState] = {}
        self._last_seen: Dict[int, int] = {}   # track_id -> last frame_idx
        self._frame_idx: int = 0

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    def update(
        self,
        detections: List[Detection],
        frame_idx: Optional[int] = None,
    ) -> List[Detection]:
        """
        Consume detections from VehicleDetector.detect_with_tracking().
        Updates internal track history.

        Returns the same detections list (pass-through for chaining).
        """
        if frame_idx is not None:
            self._frame_idx = frame_idx
        else:
            self._frame_idx += 1

        ts = time.time()
        active_ids = set()

        for det in detections:
            tid = det.track_id
            if tid is None:
                continue

            active_ids.add(tid)
            self._last_seen[tid] = self._frame_idx

            if tid not in self._tracks:
                self._tracks[tid] = TrackState(
                    track_id=tid,
                    class_name=det.class_name,
                    first_seen_frame=self._frame_idx,
                )

            entry = FrameEntry(
                frame_idx=self._frame_idx,
                timestamp=ts,
                bbox=det.bbox,
                confidence=det.confidence,
                class_name=det.class_name,
            )
            self._tracks[tid].add_frame(entry)
            self._tracks[tid].is_active = True

        # Mark lost tracks
        for tid, state in self._tracks.items():
            if tid not in active_ids:
                frames_since_last = self._frame_idx - self._last_seen.get(tid, 0)
                if frames_since_last > self.max_lost_frames:
                    state.is_active = False

        return detections

    # ------------------------------------------------------------------
    # Violation checks
    # ------------------------------------------------------------------

    def check_stop_line_crossings(
        self,
        signal_state: str,
    ) -> List[Dict]:
        """
        Return list of track_ids that crossed stop line while signal is red.
        Marks them so they're not re-flagged.
        """
        violations = []
        if signal_state not in ("red", "RED"):
            return violations

        for tid, state in self._tracks.items():
            if not state.is_active:
                continue
            if state.flagged_violation:
                continue
            if state.crossed_line(self.stop_line_y, direction="down"):
                state.crossed_stop_line = True
                state.flagged_violation = True
                violations.append({
                    "track_id": tid,
                    "class_name": state.class_name,
                    "bbox": state.latest.bbox if state.latest else [],
                    "violation": "red_light_violation",
                    "confidence": 0.95,
                })

        return violations

    def check_illegal_parking(
        self,
        no_parking_track_ids: Optional[List[int]] = None,
    ) -> List[Dict]:
        """
        Return tracks that have been stationary for > parking_threshold_sec
        and are in a no-parking zone.
        """
        now = time.time()
        violations = []

        for tid, state in self._tracks.items():
            if not state.is_active:
                continue
            if no_parking_track_ids and tid not in no_parking_track_ids:
                continue

            if state.is_stationary(threshold_px=8.0, window=30):
                if state.parking_start_time is None:
                    state.parking_start_time = now
                else:
                    parked_sec = now - state.parking_start_time
                    if parked_sec > self.parking_threshold_sec:
                        violations.append({
                            "track_id": tid,
                            "class_name": state.class_name,
                            "bbox": state.latest.bbox if state.latest else [],
                            "violation": "illegal_parking",
                            "confidence": 0.90,
                            "parked_duration_sec": int(parked_sec),
                        })
            else:
                # Vehicle moved — reset parking timer
                state.parking_start_time = None

        return violations

    def check_wrong_side_driving(
        self,
        expected_direction_y: str = "down",  # "down" = traffic flows bottom→top
    ) -> List[Dict]:
        """
        Flag vehicles whose velocity vector opposes expected traffic flow.
        expected_direction_y: "down" means vehicles should move top→bottom in frame.
        """
        violations = []
        for tid, state in self._tracks.items():
            if not state.is_active or state.flagged_violation:
                continue
            if state.age_frames < 15:  # Need enough history
                continue

            vx, vy = state.velocity(window=20)
            speed = (vx ** 2 + vy ** 2) ** 0.5

            if speed < 3.0:  # Too slow to determine direction
                continue

            is_wrong_side = False
            if expected_direction_y == "down" and vy < -5:
                is_wrong_side = True
            elif expected_direction_y == "up" and vy > 5:
                is_wrong_side = True

            if is_wrong_side:
                conf = min(0.90, 0.5 + speed / 100)
                violations.append({
                    "track_id": tid,
                    "class_name": state.class_name,
                    "bbox": state.latest.bbox if state.latest else [],
                    "violation": "wrong_side_driving",
                    "confidence": conf,
                    "velocity": (round(vx, 2), round(vy, 2)),
                })

        return violations

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------

    def get_track(self, track_id: int) -> Optional[TrackState]:
        return self._tracks.get(track_id)

    def active_tracks(self) -> List[TrackState]:
        return [s for s in self._tracks.values() if s.is_active]

    def get_history(self, track_id: int) -> List[FrameEntry]:
        state = self._tracks.get(track_id)
        return list(state.history) if state else []

    def summary(self) -> dict:
        return {
            "total_tracks": len(self._tracks),
            "active_tracks": sum(1 for s in self._tracks.values() if s.is_active),
            "frame_idx": self._frame_idx,
        }

    def reset(self) -> None:
        self._tracks.clear()
        self._last_seen.clear()
        self._frame_idx = 0
