"""
Hazard Alert Service — GARUDA Road Hazard Intelligence Module
=============================================================
Fires instant emergency alerts (via the existing WebSocket broadcast)
when road health is critically low or deterioration is imminent.

Alert Conditions:
  1. road_health_score < 30  → already critical
  2. predicted_critical_at within 3 days → imminent
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, date

logger = logging.getLogger(__name__)

CRITICAL_RHS   = 30.0
IMMINENT_DAYS  = 3    # fire alert if critical date is within this many days


class HazardAlertService:
    """Static helper — no instance needed."""

    @staticmethod
    async def check_and_fire(hazard_record, broadcast_fn) -> bool:
        """
        Evaluate whether the hazard record warrants an emergency alert.
        If yes, fire the alert via `broadcast_fn` (the stream.py broadcast).

        Parameters
        ----------
        hazard_record : RoadHazardModel ORM object
        broadcast_fn  : async callable that accepts a JSON string

        Returns
        -------
        True if alert was fired, False otherwise.
        """
        should_alert = False
        reason       = ""

        # --- Condition 1: RHS already critical ---
        if hazard_record.road_health_score < CRITICAL_RHS:
            should_alert = True
            reason = (
                f"Road Health Score is critically low "
                f"({hazard_record.road_health_score:.0f}/100) at "
                f"{hazard_record.location or hazard_record.camera_id}"
            )

        # --- Condition 2: Imminent critical date ---
        elif hazard_record.predicted_critical_at:
            try:
                crit_date = date.fromisoformat(hazard_record.predicted_critical_at)
                days_left = (crit_date - date.today()).days
                if 0 <= days_left <= IMMINENT_DAYS:
                    should_alert = True
                    reason = (
                        f"Road predicted to become critical in {days_left} day(s) at "
                        f"{hazard_record.location or hazard_record.camera_id}"
                    )
            except (ValueError, TypeError):
                pass

        if should_alert:
            await HazardAlertService._fire(hazard_record, reason, broadcast_fn)

        return should_alert

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    @staticmethod
    async def _fire(hazard_record, reason: str, broadcast_fn) -> None:
        payload = {
            "type":                  "road_hazard_alert",
            "hazard_id":             hazard_record.id,
            "camera_id":             hazard_record.camera_id,
            "location":              hazard_record.location or "Unknown",
            "lat":                   hazard_record.lat,
            "lon":                   hazard_record.lon,
            "damage_type":           hazard_record.damage_type,
            "road_health_score":     hazard_record.road_health_score,
            "deterioration_rate":    hazard_record.deterioration_rate,
            "predicted_critical_at": hazard_record.predicted_critical_at,
            "reason":                reason,
            "severity":              "CRITICAL" if hazard_record.road_health_score < CRITICAL_RHS else "WARNING",
            "timestamp":             datetime.utcnow().isoformat() + "Z",
        }
        try:
            await broadcast_fn(json.dumps(payload))
            logger.warning(
                "🚨 ROAD HAZARD ALERT — camera=%s | RHS=%.0f | %s",
                hazard_record.camera_id,
                hazard_record.road_health_score,
                reason,
            )
        except Exception as exc:
            logger.error("HazardAlertService._fire: broadcast failed — %s", exc)
