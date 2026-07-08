"""
Road Hazard API Router — GARUDA Road Hazard Intelligence Module
===============================================================
Prefix: /api/v1/hazards

Endpoints:
    GET  /                → list all hazard records
    GET  /heatmap         → GeoJSON for Leaflet map
    GET  /alerts          → active emergency alerts
    GET  /stats           → dashboard summary stats
    POST /analyze         → upload image → ML → get RHS + prediction
    GET  /{id}            → single hazard detail
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from ..core.database import get_db, RoadHazardModel
from ..services.risk_engine import RiskEngine, CRITICAL_RHS, WARNING_RHS
from ..services.hazard_alert_service import HazardAlertService

router = APIRouter(prefix="/hazards")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helper — serialise ORM row → dict
# ---------------------------------------------------------------------------

def _row(r: RoadHazardModel) -> dict:
    return {
        "id":                    r.id,
        "camera_id":             r.camera_id,
        "location":              r.location,
        "lat":                   r.lat,
        "lon":                   r.lon,
        "timestamp":             r.timestamp,
        "damage_type":           r.damage_type,
        "damage_severity_score": r.damage_severity_score,
        "road_health_score":     r.road_health_score,
        "risk_level":            RiskEngine.get_risk_level(r.road_health_score),
        "deterioration_rate":    r.deterioration_rate,
        "predicted_critical_at": r.predicted_critical_at,
        "days_until_critical":   RiskEngine.days_until_critical(
            r.road_health_score, r.deterioration_rate
        ),
        "alert_fired":           r.alert_fired,
        "frame_path":            r.frame_path,
    }


# ---------------------------------------------------------------------------
# GET /hazards/stats
# ---------------------------------------------------------------------------

@router.get("/stats")
async def hazard_stats(db: AsyncSession = Depends(get_db)):
    """Summary stats for the road hazard dashboard cards."""
    result = await db.execute(select(RoadHazardModel))
    rows   = result.scalars().all()

    critical_count = sum(1 for r in rows if r.road_health_score < CRITICAL_RHS)
    warning_count  = sum(1 for r in rows if WARNING_RHS > r.road_health_score >= CRITICAL_RHS)
    alerts_count   = sum(1 for r in rows if r.alert_fired)
    avg_rhs = round(sum(r.road_health_score for r in rows) / len(rows), 1) if rows else 100.0

    return {
        "total_detections":  len(rows),
        "critical_zones":    critical_count,
        "warning_zones":     warning_count,
        "alerts_fired":      alerts_count,
        "average_rhs":       avg_rhs,
    }


# ---------------------------------------------------------------------------
# GET /hazards/
# ---------------------------------------------------------------------------

@router.get("/")
async def list_hazards(
    limit:      int             = Query(50,  ge=1, le=500),
    camera_id:  Optional[str]  = Query(None),
    risk_level: Optional[str]  = Query(None, description="CRITICAL | WARNING | LOW"),
    db: AsyncSession = Depends(get_db),
):
    """List hazard records, newest first."""
    q = select(RoadHazardModel).order_by(desc(RoadHazardModel.timestamp)).limit(limit)
    if camera_id:
        q = q.where(RoadHazardModel.camera_id == camera_id)
    if risk_level == "CRITICAL":
        q = q.where(RoadHazardModel.road_health_score < CRITICAL_RHS)
    elif risk_level == "WARNING":
        q = q.where(
            RoadHazardModel.road_health_score < WARNING_RHS,
            RoadHazardModel.road_health_score >= CRITICAL_RHS,
        )

    result = await db.execute(q)
    return [_row(r) for r in result.scalars().all()]


# ---------------------------------------------------------------------------
# GET /hazards/heatmap
# ---------------------------------------------------------------------------

@router.get("/heatmap")
async def heatmap_geojson(db: AsyncSession = Depends(get_db)):
    """
    GeoJSON FeatureCollection for Leaflet.js.
    Only includes records with GPS coordinates (lat/lon != 0).
    """
    result = await db.execute(
        select(RoadHazardModel)
        .where(RoadHazardModel.lat != 0.0)
        .order_by(desc(RoadHazardModel.timestamp))
        .limit(1000)
    )
    rows = result.scalars().all()

    features = [
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [r.lon, r.lat],
            },
            "properties": {
                "id":                  r.id,
                "camera_id":           r.camera_id,
                "location":            r.location,
                "damage_type":         r.damage_type,
                "road_health_score":   r.road_health_score,
                "risk_level":          RiskEngine.get_risk_level(r.road_health_score),
                "predicted_critical":  r.predicted_critical_at,
                "alert_fired":         r.alert_fired,
                "timestamp":           r.timestamp,
            },
        }
        for r in rows
    ]

    return {"type": "FeatureCollection", "features": features}


# ---------------------------------------------------------------------------
# GET /hazards/alerts
# ---------------------------------------------------------------------------

@router.get("/alerts")
async def active_alerts(db: AsyncSession = Depends(get_db)):
    """Return all hazard records that have fired emergency alerts."""
    result = await db.execute(
        select(RoadHazardModel)
        .where(RoadHazardModel.alert_fired == True)     # noqa: E712
        .order_by(desc(RoadHazardModel.timestamp))
        .limit(50)
    )
    return [_row(r) for r in result.scalars().all()]


# ---------------------------------------------------------------------------
# GET /hazards/{id}
# ---------------------------------------------------------------------------

@router.get("/{hazard_id}")
async def get_hazard(hazard_id: int, db: AsyncSession = Depends(get_db)):
    """Detail view for a single hazard record."""
    result = await db.execute(
        select(RoadHazardModel).where(RoadHazardModel.id == hazard_id)
    )
    r = result.scalar_one_or_none()
    if r is None:
        raise HTTPException(status_code=404, detail="Hazard not found")
    return _row(r)


# ---------------------------------------------------------------------------
# POST /hazards/analyze
# ---------------------------------------------------------------------------

@router.post("/analyze")
async def analyze_image(
    file:      UploadFile     = File(..., description="Road image (JPEG/PNG)"),
    camera_id: str            = Form(default="manual",  description="Camera or sensor ID"),
    location:  str            = Form(default="Unknown", description="Human-readable location"),
    lat:       float          = Form(default=0.0,       description="GPS latitude"),
    lon:       float          = Form(default=0.0,       description="GPS longitude"),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a road image → run ML inference → return hazard data.
    Also saves to DB, computes risk, and fires alerts if needed.
    """
    from ..services.ml_registry import get_ml_registry

    # --- Decode image ---
    raw = await file.read()
    arr = np.frombuffer(raw, np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Could not decode image — send JPEG or PNG")

    # --- ML inference ---
    reg = get_ml_registry()
    if not reg.road_hazard_classifier or not reg.road_hazard_classifier.available:
        raise HTTPException(
            status_code=503,
            detail=(
                "Road hazard model not loaded. "
                "Ensure ml/models/weights/hazards/yolo12s_RDD2022_best.pt exists "
                "and restart the server."
            ),
        )

    result = reg.road_hazard_classifier.analyze_frame_full(frame)
    rhs    = result.road_health_score

    # --- Time-based risk (needs history) ---
    velocity  = await RiskEngine.compute_deterioration_velocity(db, camera_id)
    pred_date = RiskEngine.predict_critical_date(rhs, velocity)
    risk_lv   = RiskEngine.get_risk_level(rhs)
    days_left = RiskEngine.days_until_critical(rhs, velocity)

    # --- Save to DB ---
    primary = result.primary_damage
    dss     = max((d.severity_score for d in result.detections), default=0.0)

    record = RoadHazardModel(
        camera_id             = camera_id,
        location              = location,
        lat                   = lat,
        lon                   = lon,
        damage_type           = primary,
        damage_severity_score = round(dss, 4),
        road_health_score     = rhs,
        deterioration_rate    = velocity,
        predicted_critical_at = pred_date,
        bbox_json             = json.dumps([d.bbox for d in result.detections]),
        area_px               = sum(d.area_px for d in result.detections),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    # --- Alert check ---
    alert_fired = False
    try:
        from ..api.stream import broadcast_violation  # reuse existing WS broadcast
        async def _broadcast_str(payload_str: str) -> None:
            await broadcast_violation(json.loads(payload_str))

        alert_fired = await HazardAlertService.check_and_fire(record, _broadcast_str)
        if alert_fired:
            record.alert_fired = True
            await db.commit()
    except Exception as exc:
        logger.warning("Alert broadcast failed (non-fatal): %s", exc)

    # --- Response ---
    return {
        "hazard_id":            record.id,
        "camera_id":            camera_id,
        "location":             location,
        "detections":           [
            {
                "damage_type":    d.damage_type,
                "confidence":     d.confidence,
                "severity_score": d.severity_score,
                "bbox":           d.bbox,
                "area_px":        d.area_px,
            }
            for d in result.detections
        ],
        "total_detections":     result.total_detections,
        "road_health_score":    rhs,
        "risk_level":           risk_lv,
        "deterioration_rate":   velocity,
        "predicted_critical_at": pred_date,
        "days_until_critical":  days_left,
        "alert_fired":          alert_fired,
        "timestamp":            record.timestamp,
    }
