"""
GARUDA ML Pipeline — Confidence-Gated Routing Engine
=====================================================
Every detection goes through 3 tiers:

  TIER 1 (conf ≥ 0.90) → AUTO_CHALLAN
    Evidence packaged, stored in DB, no human needed.

  TIER 2 (0.60 ≤ conf < 0.90) → HUMAN_REVIEW
    WhatsApp/SMS alert to nearest patrol officer.
    Officer confirms or rejects within 10 min.
    Response feeds back to federated learning.

  TIER 3 (0.40 ≤ conf < 0.60) → LOG_WITH_PLATE / DISCARD
    Capture for audit trail; cross-reference repeat offender DB.

  OVERRIDE: Repeat offender → always Tier 2 (priority HIGH),
    regardless of visual confidence.
"""
from __future__ import annotations

import uuid
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional

from .violation_classifier import ViolationResult, ViolationType

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Thresholds — tweak here, nowhere else
# ---------------------------------------------------------------------------

TIER1_AUTO_CHALLAN  = 0.90
TIER2_HUMAN_REVIEW  = 0.60
TIER3_LOW_CONF      = 0.40
REPEAT_OFFENDER_MIN = 3   # Violations to be flagged as repeat offender


# ---------------------------------------------------------------------------
# Repeat offender registry
# ---------------------------------------------------------------------------

class RepeatOffenderDB:
    """
    In-memory repeat offender registry.
    Backed by the vehicles table in PostgreSQL/SQLite in production
    (violation_worker syncs this on startup).
    """

    def __init__(self) -> None:
        # plate_text → {count, violations: [{type, time}], first_seen}
        self._registry: Dict[str, Dict] = {}

    def register(self, plate: str, violation_type: str) -> None:
        if not plate:
            return
        if plate not in self._registry:
            self._registry[plate] = {
                "count": 0,
                "violations": [],
                "first_seen": datetime.utcnow().isoformat(),
            }
        self._registry[plate]["count"] += 1
        self._registry[plate]["violations"].append({
            "type": violation_type,
            "timestamp": datetime.utcnow().isoformat(),
        })
        logger.debug("Registered violation for %s (total=%d)", plate, self._registry[plate]["count"])

    def is_repeat(self, plate: str) -> bool:
        return self._registry.get(plate, {}).get("count", 0) >= REPEAT_OFFENDER_MIN

    def get_history(self, plate: str) -> Dict:
        return self._registry.get(plate, {"count": 0, "violations": [], "first_seen": None})

    def load_from_list(self, records: List[Dict]) -> None:
        """Bulk-load from DB on startup. Each record: {plate, count, violations}"""
        for rec in records:
            plate = rec.get("plate", "")
            if plate:
                self._registry[plate] = {
                    "count": rec.get("count", 0),
                    "violations": rec.get("violations", []),
                    "first_seen": rec.get("first_seen"),
                }

    def export(self) -> List[Dict]:
        return [
            {"plate": p, **data}
            for p, data in self._registry.items()
        ]

    def __len__(self) -> int:
        return len(self._registry)


# ---------------------------------------------------------------------------
# Routing decision
# ---------------------------------------------------------------------------

@dataclass
class RoutingDecision:
    tier: int
    action: str
    violation: ViolationResult
    plate_info: Dict
    camera_info: Dict
    violation_id: str = field(
        default_factory=lambda: (
            f"VIO-BLR-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
            f"-{str(uuid.uuid4())[:6].upper()}"
        )
    )
    timestamp: str = field(
        default_factory=lambda: datetime.utcnow().isoformat() + "Z"
    )
    escalation_reason: Optional[str] = None
    priority: str = "NORMAL"  # "NORMAL" | "HIGH"

    @property
    def needs_human(self) -> bool:
        return self.tier == 2

    @property
    def is_auto_challan(self) -> bool:
        return self.tier == 1 and self.action == "AUTO_CHALLAN"

    def to_dict(self) -> dict:
        return {
            "violation_id": self.violation_id,
            "tier": self.tier,
            "action": self.action,
            "priority": self.priority,
            "timestamp": self.timestamp,
            "escalation_reason": self.escalation_reason,
            "violation": self.violation.to_dict(),
            "plate": self.plate_info,
            "camera": self.camera_info,
        }


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

class ConfidenceRouter:
    """
    Routes ViolationResult to the correct action tier.

    Parameters
    ----------
    repeat_db : Shared RepeatOffenderDB instance
    """

    def __init__(
        self,
        repeat_db: Optional[RepeatOffenderDB] = None,
    ) -> None:
        self.repeat_db = repeat_db or RepeatOffenderDB()

    def route(
        self,
        violation: ViolationResult,
        plate_info: Dict,
        camera_info: Dict,
    ) -> RoutingDecision:
        """
        Determine routing tier and action for a single violation detection.

        Parameters
        ----------
        violation   : ViolationResult from ViolationClassifier
        plate_info  : Dict from PlateOCR.read_plate() → .to_dict()
        camera_info : Dict with camera_id, location, coordinates

        Returns
        -------
        RoutingDecision with tier, action, full context
        """
        conf = violation.confidence
        plate_text = plate_info.get("formatted_text", "").strip()

        # ---------------------------------------------------------------
        # OVERRIDE: Repeat offender — always escalate to Tier 2 (HIGH)
        # ---------------------------------------------------------------
        if plate_text and self.repeat_db.is_repeat(plate_text):
            history = self.repeat_db.get_history(plate_text)
            reason = f"REPEAT_OFFENDER — {history['count']} prior violations"
            logger.warning("Repeat offender escalation: %s | %s", plate_text, reason)
            return RoutingDecision(
                tier=2,
                action="ESCALATE_REPEAT_OFFENDER",
                violation=violation,
                plate_info=plate_info,
                camera_info=camera_info,
                escalation_reason=reason,
                priority="HIGH",
            )

        # ---------------------------------------------------------------
        # TIER 1 — Auto-challan
        # ---------------------------------------------------------------
        if conf >= TIER1_AUTO_CHALLAN:
            if plate_text:
                self.repeat_db.register(plate_text, violation.violation_type.value)
            logger.info(
                "TIER 1 AUTO-CHALLAN | %s | plate=%s | conf=%.2f",
                violation.violation_type.value, plate_text or "N/A", conf,
            )
            return RoutingDecision(
                tier=1,
                action="AUTO_CHALLAN",
                violation=violation,
                plate_info=plate_info,
                camera_info=camera_info,
            )

        # ---------------------------------------------------------------
        # TIER 2 — Human review
        # ---------------------------------------------------------------
        if conf >= TIER2_HUMAN_REVIEW:
            logger.info(
                "TIER 2 HUMAN_REVIEW | %s | plate=%s | conf=%.2f",
                violation.violation_type.value, plate_text or "N/A", conf,
            )
            return RoutingDecision(
                tier=2,
                action="HUMAN_REVIEW",
                violation=violation,
                plate_info=plate_info,
                camera_info=camera_info,
            )

        # ---------------------------------------------------------------
        # TIER 3 — Low confidence
        # ---------------------------------------------------------------
        action = "LOG_WITH_PLATE" if plate_text else "DISCARD_WITH_LOG"
        logger.debug(
            "TIER 3 %s | %s | plate=%s | conf=%.2f",
            action, violation.violation_type.value, plate_text or "N/A", conf,
        )
        return RoutingDecision(
            tier=3,
            action=action,
            violation=violation,
            plate_info=plate_info,
            camera_info=camera_info,
        )

    def route_batch(
        self,
        violations: List[ViolationResult],
        plate_info: Dict,
        camera_info: Dict,
    ) -> List[RoutingDecision]:
        """Route multiple violations from the same frame"""
        return [self.route(v, plate_info, camera_info) for v in violations]

    # ------------------------------------------------------------------
    # Alert text builders
    # ------------------------------------------------------------------

    def build_whatsapp_alert(self, decision: RoutingDecision) -> str:
        """Generate WhatsApp alert text for Tier 2 decisions"""
        v = decision.violation
        p = decision.plate_info
        c = decision.camera_info
        ts = decision.timestamp[:19].replace("T", " ")

        header = "🚨 REPEAT OFFENDER" if decision.priority == "HIGH" else "⚠️ UNCERTAIN — REVIEW NEEDED"
        history = self.repeat_db.get_history(p.get("formatted_text", ""))

        lines = [
            f"🚦 GARUDA ALERT | {c.get('location', 'Unknown')}",
            f"🕐 {ts} UTC",
            "",
            header,
            f"Violation : {v.violation_type.value.replace('_', ' ').title()}",
            f"Confidence: {v.confidence * 100:.0f}%",
            f"Severity  : {v.severity.upper()}",
            f"Fine      : ₹{v.fine_amount:,}",
            f"Plate     : {p.get('formatted_text') or 'PLATE UNCLEAR'}",
        ]

        if decision.priority == "HIGH" and history["count"]:
            lines.append(f"Prior     : {history['count']} violations")

        lines += [
            "",
            f"ID: {decision.violation_id}",
            "",
            "Reply CONFIRM or FP within 10 minutes",
            "Auto-dismisses if no response.",
        ]

        return "\n".join(lines)

    def build_sms_alert(self, decision: RoutingDecision) -> str:
        """Compact SMS version of the alert"""
        v = decision.violation
        p = decision.plate_info
        c = decision.camera_info
        plate = p.get("formatted_text") or "UNCLEAR"
        vtype = v.violation_type.value.replace("_", " ").upper()
        return (
            f"GARUDA: {vtype} at {c.get('location','?')} | "
            f"Plate: {plate} | Conf: {v.confidence*100:.0f}% | "
            f"ID: {decision.violation_id} | Reply CONFIRM/FP"
        )
