"""
Risk Engine — GARUDA Road Hazard Intelligence Module
=====================================================
Computes:
  • Deterioration velocity  (RHS drop per day via linear regression)
  • Predicted critical date (when RHS will fall below 30)
  • Risk level label        (LOW / WARNING / CRITICAL)

Usage::
    from backend.services.risk_engine import RiskEngine

    velocity  = await RiskEngine.compute_deterioration_velocity(db, "CAM-01")
    pred_date = RiskEngine.predict_critical_date(current_rhs=45.0, velocity=velocity)
    level     = RiskEngine.get_risk_level(current_rhs=45.0)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, date
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger(__name__)

CRITICAL_RHS = 30.0
WARNING_RHS  = 55.0
MAX_PREDICT_DAYS = 90   # Don't predict further than 90 days — too uncertain


class RiskEngine:
    """Static helper — no instance needed."""

    # ------------------------------------------------------------------
    # Deterioration velocity
    # ------------------------------------------------------------------

    @staticmethod
    async def compute_deterioration_velocity(
        session: AsyncSession,
        camera_id: str,
        window_days: int = 14,
    ) -> float:
        """
        Linear regression over the last `window_days` of road_hazards records
        for this camera.

        Returns RHS change per day:
            negative  → road is deteriorating (getting worse)
            zero      → stable
            positive  → improving (repairs happening)

        Returns 0.0 if fewer than 2 data points exist.
        """
        from backend.core.database import RoadHazardModel   # lazy import avoids circular

        cutoff = (datetime.utcnow() - timedelta(days=window_days)).isoformat()
        result = await session.execute(
            select(RoadHazardModel)
            .where(RoadHazardModel.camera_id == camera_id)
            .where(RoadHazardModel.timestamp  >= cutoff)
            .where(RoadHazardModel.road_health_score > 0)   # exclude un-scored rows
            .order_by(RoadHazardModel.timestamp)
        )
        records = result.scalars().all()

        if len(records) < 2:
            return 0.0

        try:
            t0 = datetime.fromisoformat(records[0].timestamp)
            xs = [
                (datetime.fromisoformat(r.timestamp) - t0).total_seconds() / 86400.0
                for r in records
            ]
            ys = [r.road_health_score for r in records]

            n       = len(xs)
            x_mean  = sum(xs) / n
            y_mean  = sum(ys) / n
            num     = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys))
            den     = sum((x - x_mean) ** 2 for x in xs)
            slope   = num / den if den != 0.0 else 0.0
            return round(slope, 4)

        except Exception as exc:
            logger.error("RiskEngine.compute_deterioration_velocity: %s", exc)
            return 0.0

    # ------------------------------------------------------------------
    # Prediction
    # ------------------------------------------------------------------

    @staticmethod
    def predict_critical_date(current_rhs: float, velocity: float) -> Optional[str]:
        """
        Given the current RHS and the deterioration rate (RHS/day),
        calculate when RHS will drop below CRITICAL_RHS.

        Returns ISO date string (e.g. "2026-07-15"), or None if:
          - velocity >= 0  (not deteriorating)
          - already critical
          - prediction > MAX_PREDICT_DAYS away
        """
        if velocity >= 0:
            return None   # Road is stable or improving
        if current_rhs <= CRITICAL_RHS:
            return date.today().isoformat()   # Already critical

        days_to_critical = (current_rhs - CRITICAL_RHS) / abs(velocity)
        if days_to_critical > MAX_PREDICT_DAYS:
            return None   # Too far out to report meaningfully

        pred = date.today() + timedelta(days=int(days_to_critical))
        return pred.isoformat()

    # ------------------------------------------------------------------
    # Risk labeling
    # ------------------------------------------------------------------

    @staticmethod
    def get_risk_level(rhs: float) -> str:
        """Return "CRITICAL", "WARNING", or "LOW" based on RHS value."""
        if rhs < CRITICAL_RHS:
            return "CRITICAL"
        elif rhs < WARNING_RHS:
            return "WARNING"
        return "LOW"

    @staticmethod
    def days_until_critical(current_rhs: float, velocity: float) -> Optional[int]:
        """Return integer days until critical, or None."""
        pred = RiskEngine.predict_critical_date(current_rhs, velocity)
        if pred is None:
            return None
        delta = date.fromisoformat(pred) - date.today()
        return max(0, delta.days)
