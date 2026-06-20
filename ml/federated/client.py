"""
GARUDA — Federated Learning Client
=====================================
Runs on each edge camera node (Jetson / Raspberry Pi).
Trains locally on officer-corrected samples, sends only weight
updates (never raw video) to the central aggregation server.

Framework: Flower (flwr)
Schedule : Every Sunday 2 AM via cron / Task Scheduler

Usage:
    python -m ml.federated.client \
        --server-address central-server:8080 \
        --camera-id BLR-CAM-MG-ROAD-001 \
        --corrections-db evidence/corrections.db
"""
from __future__ import annotations

import argparse
import logging
import sqlite3
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Local correction dataset
# ---------------------------------------------------------------------------

class LocalCorrectionDataset:
    """
    SQLite-backed store of officer corrections (Tier 2 feedback).

    Schema:
      corrections(id, violation_id, image_path, true_label, false_label,
                  officer_id, corrected_at)
    """

    def __init__(self, db_path: str = "evidence/corrections.db") -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS corrections (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    violation_id    TEXT NOT NULL,
                    image_path      TEXT,
                    true_label      TEXT,
                    false_label     TEXT,
                    officer_id      TEXT,
                    corrected_at    TEXT DEFAULT CURRENT_TIMESTAMP,
                    used_in_training INTEGER DEFAULT 0
                )
            """)
            conn.commit()

    def add_correction(
        self,
        violation_id: str,
        image_path: str,
        true_label: str,
        false_label: str,
        officer_id: str = "unknown",
    ) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO corrections "
                "(violation_id, image_path, true_label, false_label, officer_id) "
                "VALUES (?, ?, ?, ?, ?)",
                (violation_id, image_path, true_label, false_label, officer_id),
            )
            conn.commit()
        logger.info("Correction stored: %s (true=%s)", violation_id, true_label)

    def get_weekly_corrections(self) -> List[Dict]:
        """Return corrections from the last 7 days not yet used in training"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("""
                SELECT * FROM corrections
                WHERE used_in_training = 0
                  AND corrected_at >= datetime('now', '-7 days')
            """).fetchall()
        return [dict(r) for r in rows]

    def mark_used(self, ids: List[int]) -> None:
        if not ids:
            return
        placeholders = ",".join("?" * len(ids))
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                f"UPDATE corrections SET used_in_training=1 WHERE id IN ({placeholders})",
                ids,
            )
            conn.commit()

    def correction_count(self) -> int:
        with sqlite3.connect(self.db_path) as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM corrections WHERE used_in_training=0"
            ).fetchone()[0]


# ---------------------------------------------------------------------------
# Simple violation classifier model (for FL training)
# ---------------------------------------------------------------------------

def _build_model():
    """
    Lightweight CNN violation classifier.
    Input: 128x128 RGB image crop of violation region
    Output: softmax over violation classes
    """
    try:
        import torch
        import torch.nn as nn

        class ViolationCNN(nn.Module):
            CLASSES = [
                "helmet_non_compliance",
                "seatbelt_non_compliance",
                "triple_riding",
                "wrong_side_driving",
                "red_light_violation",
                "stop_line_violation",
                "illegal_parking",
                "no_violation",
            ]

            def __init__(self) -> None:
                super().__init__()
                self.features = nn.Sequential(
                    nn.Conv2d(3, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
                    nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
                    nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2),
                )
                self.classifier = nn.Sequential(
                    nn.AdaptiveAvgPool2d((4, 4)),
                    nn.Flatten(),
                    nn.Linear(128 * 16, 256),
                    nn.ReLU(),
                    nn.Dropout(0.4),
                    nn.Linear(256, len(self.CLASSES)),
                )

            def forward(self, x):
                return self.classifier(self.features(x))

        return ViolationCNN()

    except ImportError:
        logger.error("PyTorch not installed. Federated learning requires torch.")
        return None


def _get_parameters(model) -> List[np.ndarray]:
    import torch
    return [val.cpu().numpy() for val in model.parameters()]


def _set_parameters(model, parameters: List[np.ndarray]) -> None:
    import torch
    params_dict = zip(model.parameters(), parameters)
    for p, new_val in params_dict:
        p.data = torch.tensor(new_val, dtype=p.dtype)


# ---------------------------------------------------------------------------
# Flower FL client
# ---------------------------------------------------------------------------

class TrafficViolationClient:
    """
    Flower NumPy client for privacy-safe federated learning.

    Each camera node:
    1. Receives global model weights from central server
    2. Fine-tunes on local officer corrections
    3. Sends back weight deltas only
    """

    def __init__(
        self,
        camera_id: str,
        corrections_db: LocalCorrectionDataset,
    ) -> None:
        self.camera_id = camera_id
        self.corrections = corrections_db
        self.model = _build_model()

    def _get_fl_client(self):
        """Returns the Flower NumPyClient"""
        try:
            import flwr as fl  # type: ignore
        except ImportError:
            raise ImportError("Flower not installed. Run: pip install flwr")

        model         = self.model
        corrections   = self.corrections
        camera_id     = self.camera_id

        class _FlwrClient(fl.client.NumPyClient):

            def get_parameters(self, config):
                logger.info("[%s] Sending parameters to server", camera_id)
                return _get_parameters(model)

            def fit(self, parameters, config):
                _set_parameters(model, parameters)
                corrections_list = corrections.get_weekly_corrections()
                n = len(corrections_list)
                logger.info("[%s] Training on %d local corrections", camera_id, n)

                if n > 0:
                    _local_train(model, corrections_list, epochs=5)
                    used_ids = [c["id"] for c in corrections_list]
                    corrections.mark_used(used_ids)

                return _get_parameters(model), n, {"camera_id": camera_id}

            def evaluate(self, parameters, config):
                _set_parameters(model, parameters)
                loss, acc = _local_evaluate(model, corrections)
                n = corrections.correction_count()
                return loss, n, {"accuracy": acc, "camera_id": camera_id}

        return _FlwrClient()

    def start(self, server_address: str = "localhost:8080") -> None:
        """Connect to FL server and participate in training round"""
        import flwr as fl  # type: ignore
        logger.info("FL client [%s] connecting to %s", self.camera_id, server_address)
        fl.client.start_numpy_client(
            server_address=server_address,
            client=self._get_fl_client(),
        )


# ---------------------------------------------------------------------------
# Local train / evaluate stubs
# ---------------------------------------------------------------------------

def _local_train(model, corrections: List[Dict], epochs: int = 5) -> None:
    """
    Fine-tune model on officer corrections.
    In production: load correction images, apply transforms, train.
    """
    try:
        import torch
        import torch.optim as optim

        model.train()
        optimizer = optim.Adam(model.parameters(), lr=1e-4)
        criterion = torch.nn.CrossEntropyLoss()

        # Stub: in real usage, load images from correction["image_path"]
        # and use correction["true_label"] as ground truth.
        # Here we just run a dry training loop to demonstrate the structure.
        for epoch in range(epochs):
            logger.debug("Training epoch %d/%d on %d samples", epoch + 1, epochs, len(corrections))

    except ImportError:
        logger.warning("PyTorch unavailable — skipping local training")


def _local_evaluate(model, corrections: LocalCorrectionDataset) -> Tuple[float, float]:
    """Return (loss, accuracy) on local validation set"""
    return 0.0, 0.0   # Stub — replace with actual evaluation


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="GARUDA Federated Learning Client")
    parser.add_argument("--server-address", default="localhost:8080")
    parser.add_argument("--camera-id", default="BLR-CAM-DEMO-001")
    parser.add_argument("--corrections-db", default="evidence/corrections.db")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    db = LocalCorrectionDataset(args.corrections_db)
    client = TrafficViolationClient(args.camera_id, db)
    client.start(args.server_address)


if __name__ == "__main__":
    main()
