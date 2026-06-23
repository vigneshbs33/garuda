"""
GARUDA API — Violations Router
================================
Endpoints:
  GET    /api/v1/violations              List violations (paginated + filtered)
  GET    /api/v1/violations/{id}         Single violation with full JSON record
  POST   /api/v1/violations/ingest       Submit from ML pipeline
  POST   /api/v1/violations/{id}/confirm Officer confirms Tier 2 (→ challan)
  POST   /api/v1/violations/{id}/reject  Officer rejects (→ false positive)
  GET    /api/v1/violations/{id}/image   Redirect to annotated evidence image
"""
from __future__ import annotations

import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import (
    AsyncSessionLocal, ViolationModel,
    get_db, save_violation, update_violation_status, upsert_vehicle,
)
from ..core.alert_service import get_alert_service
from ..models.schemas import (
    OfficerActionRequest, OfficerActionResponse,
    ViolationDetailResponse, ViolationIngestRequest,
    ViolationListResponse, ViolationResponse,
)
from .stream import broadcast_violation

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# List violations
# ---------------------------------------------------------------------------

@router.get("/violations", response_model=ViolationListResponse)
async def list_violations(
    page      : int = Query(1, ge=1),
    page_size : int = Query(20, ge=1, le=100),
    tier      : Optional[int]  = Query(None, description="Filter by tier 1/2/3"),
    status    : Optional[str]  = Query(None, description="pending/auto_challan/confirmed/rejected"),
    camera_id : Optional[str]  = Query(None),
    type      : Optional[str]  = Query(None, description="Violation type filter"),
    date_from : Optional[str]  = Query(None, description="ISO date YYYY-MM-DD"),
    date_to   : Optional[str]  = Query(None),
    db        : AsyncSession   = Depends(get_db),
):
    """
    Paginated violation list with optional filters.
    Sorted newest first.
    """
    q = select(ViolationModel).order_by(ViolationModel.created_at.desc())

    if tier is not None:
        q = q.where(ViolationModel.tier == tier)
    if status:
        q = q.where(ViolationModel.status == status)
    if camera_id:
        q = q.where(ViolationModel.camera_id == camera_id)
    if type:
        q = q.where(ViolationModel.violation_type == type)
    if date_from:
        q = q.where(ViolationModel.timestamp >= date_from)
    if date_to:
        q = q.where(ViolationModel.timestamp <= date_to + "T23:59:59")

    # Count
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    # Page
    offset = (page - 1) * page_size
    rows = (await db.execute(q.offset(offset).limit(page_size))).scalars().all()

    return ViolationListResponse(
        total=total,
        page=page,
        page_size=page_size,
        violations=[ViolationResponse.model_validate(r) for r in rows],
    )


# ---------------------------------------------------------------------------
# Get single violation
# ---------------------------------------------------------------------------

@router.get("/violations/{violation_id}", response_model=ViolationDetailResponse)
async def get_violation(
    violation_id : str,
    db           : AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ViolationModel).where(ViolationModel.id == violation_id)
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail=f"Violation {violation_id} not found")
    return ViolationDetailResponse.model_validate(obj)


# ---------------------------------------------------------------------------
# Ingest new violation
# ---------------------------------------------------------------------------

@router.post("/violations/ingest", status_code=201)
async def ingest_violation(
    payload : ViolationIngestRequest,
    db      : AsyncSession = Depends(get_db),
):
    """
    Called by the ML pipeline (demo_pipeline.py or violation_worker.py).
    Saves to DB, updates vehicle registry, sends alerts for Tier 2.
    """
    record = payload.model_dump()
    record["tier"] = payload.tier.value

    # Save to DB
    obj = await save_violation(db, record)

    # Update vehicle registry
    plate = payload.vehicle.license_plate
    if plate:
        await upsert_vehicle(
            db, plate,
            payload.violations[0].type if payload.violations else "",
            payload.vehicle.plate_state[:2] if payload.vehicle.plate_state else "",
        )

    # Send alert for Tier 2
    if payload.tier.value == 2:
        alert_svc = get_alert_service()
        await alert_svc.send_tier2_review(
            violation_id   = payload.violation_id,
            violation_type = payload.violations[0].type if payload.violations else "",
            confidence     = payload.violations[0].confidence if payload.violations else 0,
            plate          = plate or "UNCLEAR",
            location       = payload.camera.location,
            image_url      = f"/evidence/annotated/{payload.violation_id}.jpg",
        )

    # WebSocket broadcast
    await broadcast_violation({
        "event"               : "violation_detected",
        "violation_id"        : payload.violation_id,
        "violation_type"      : payload.violations[0].type if payload.violations else "",
        "confidence"          : payload.violations[0].confidence if payload.violations else 0,
        "tier"                : payload.tier.value,
        "plate"               : plate or "",
        "camera_id"           : payload.camera.id,
        "location"            : payload.camera.location,
        "timestamp"           : payload.timestamp,
        "severity"            : payload.violations[0].severity if payload.violations else "",
        "annotated_image_url" : f"/evidence/annotated/{payload.violation_id}.jpg",
    })

    logger.info(
        "Violation ingested: %s | tier=%d | %s",
        payload.violation_id, payload.tier.value,
        payload.violations[0].type if payload.violations else "unknown",
    )

    return {"violation_id": payload.violation_id, "status": obj.status}


# ---------------------------------------------------------------------------
# Officer: confirm
# ---------------------------------------------------------------------------

@router.post("/violations/{violation_id}/confirm", response_model=OfficerActionResponse)
async def confirm_violation(
    violation_id : str,
    body         : OfficerActionRequest,
    db           : AsyncSession = Depends(get_db),
):
    """Officer confirms a Tier 2 violation → issues challan + trains FL"""
    obj = await update_violation_status(db, violation_id, "confirmed", body.officer_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Violation not found")

    # Update vehicle repeat count
    if obj.plate_text:
        await upsert_vehicle(db, obj.plate_text, obj.violation_type)

    # Save to audit log
    from ..core.database import AuditLogModel
    from datetime import datetime
    log = AuditLogModel(
        timestamp=datetime.utcnow().isoformat() + "Z",
        actor=body.officer_id,
        action="CITATION_APPROVED",
        target=violation_id,
        details=body.notes or f"Violation approved and citation confirmed. Plate: {obj.plate_text}"
    )
    db.add(log)
    await db.commit()

    logger.info("Violation CONFIRMED: %s by %s", violation_id, body.officer_id)
    return OfficerActionResponse(
        violation_id = violation_id,
        new_status   = "confirmed",
        officer_id   = body.officer_id,
        message      = "Violation confirmed. Challan will be issued.",
    )


# ---------------------------------------------------------------------------
# Officer: reject (false positive)
# ---------------------------------------------------------------------------

@router.post("/violations/{violation_id}/reject", response_model=OfficerActionResponse)
async def reject_violation(
    violation_id : str,
    body         : OfficerActionRequest,
    db           : AsyncSession = Depends(get_db),
):
    """Officer rejects → marked as false positive → fed into FL training"""
    obj = await update_violation_status(db, violation_id, "rejected", body.officer_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Violation not found")

    # Save to audit log
    from ..core.database import AuditLogModel
    from datetime import datetime
    log = AuditLogModel(
        timestamp=datetime.utcnow().isoformat() + "Z",
        actor=body.officer_id,
        action="CITATION_REJECTED",
        target=violation_id,
        details=body.notes or f"Violation rejected as false positive. Plate: {obj.plate_text or 'unclear'}"
    )
    db.add(log)
    await db.commit()

    logger.info("Violation REJECTED (false positive): %s by %s", violation_id, body.officer_id)
    return OfficerActionResponse(
        violation_id = violation_id,
        new_status   = "rejected",
        officer_id   = body.officer_id,
        message      = "Marked as false positive. Will be used for model improvement.",
    )


# ---------------------------------------------------------------------------
# Evidence image redirect
# ---------------------------------------------------------------------------

@router.get("/violations/{violation_id}/image")
async def get_violation_image(violation_id: str):
    """Redirect to the annotated evidence image"""
    return RedirectResponse(url=f"/evidence/annotated/{violation_id}.jpg")


# ---------------------------------------------------------------------------
# Public Submission Endpoint
# ---------------------------------------------------------------------------
from pydantic import BaseModel

class PublicViolationReport(BaseModel):
    violation_id    : str
    violation_type  : str
    plate_text      : str
    location        : str
    severity        : str = "medium"
    frame_b64       : Optional[str] = None


@router.post("/violations/public-report", status_code=201)
async def public_report_violation(
    body: PublicViolationReport,
    db: AsyncSession = Depends(get_db),
):
    """
    Submits a violation reported from the public portal.
    Decodes the frame image, saves it to disk, and inserts the record in the database.
    """
    from datetime import datetime
    import base64
    import os

    annotated_url = ""
    if body.frame_b64:
        b64_data = body.frame_b64
        if "," in b64_data:
            b64_data = b64_data.split(",", 1)[1]
        
        try:
            img_data = base64.b64decode(b64_data)
            os.makedirs("evidence/annotated", exist_ok=True)
            file_path = f"evidence/annotated/{body.violation_id}.jpg"
            with open(file_path, "wb") as f:
                f.write(img_data)
            annotated_url = f"/evidence/annotated/{body.violation_id}.jpg"
        except Exception as e:
            logger.error("Failed to save public uploaded frame: %s", e)

    record = {
        "violation_id": body.violation_id,
        "tier": 2,
        "action": "HUMAN_REVIEW",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "camera": {
            "id": "PUBLIC-REPORT",
            "location": body.location or "Public Submission",
            "coordinates": {}
        },
        "vehicle": {
            "vehicle_class": "car",
            "color": "unknown",
            "license_plate": body.plate_text.upper().strip(),
            "plate_confidence": 1.0,
            "plate_valid": True,
            "plate_state": "",
            "repeat_offender": False,
            "prior_violations": 0,
        },
        "violations": [{
            "type": body.violation_type,
            "confidence": 1.0,
            "severity": body.severity,
            "fine_amount_inr": 1000,
            "bbox": [],
            "metadata": {"source": "public_report"},
        }],
        "driver_state": {"alerts": [], "total_alerts": 0},
        "evidence": {
            "annotated_image": annotated_url,
            "raw_frame": annotated_url
        },
    }

    # Save to DB
    obj = await save_violation(db, record)

    # Update vehicle registry
    plate = body.plate_text.upper().strip()
    if plate:
        await upsert_vehicle(
            db, plate,
            body.violation_type,
            "",
        )

    # WebSocket broadcast to main feed so operators see it in real-time
    await broadcast_violation({
        "event"               : "violation_detected",
        "violation_id"        : body.violation_id,
        "violation_type"      : body.violation_type,
        "confidence"          : 100.0,
        "tier"                : 2,
        "plate"               : plate,
        "camera_id"           : "PUBLIC-REPORT",
        "location"            : body.location or "Public Submission",
        "timestamp"           : record["timestamp"],
        "severity"            : body.severity,
        "annotated_image_url" : annotated_url,
    })

    logger.info("Public violation reported: %s | %s", body.violation_id, body.violation_type)
    return {"violation_id": body.violation_id, "status": obj.status}


@router.delete("/violations/{violation_id}", status_code=204)
async def delete_single_violation(
    violation_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single violation record by ID."""
    result = await db.execute(
        select(ViolationModel).where(ViolationModel.id == violation_id)
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail=f"Violation {violation_id} not found")
        
    await db.execute(delete(ViolationModel).where(ViolationModel.id == violation_id))
    await db.commit()
    return None


class BatchDeleteRequest(BaseModel):
    ids: List[str]


@router.post("/violations/batch-delete", status_code=204)
async def batch_delete_violations(
    body: BatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete a batch of violations by their IDs."""
    if not body.ids:
        return None
    await db.execute(delete(ViolationModel).where(ViolationModel.id.in_(body.ids)))
    await db.commit()
    return None


@router.post("/violations/{violation_id}/send-sms")
async def manual_send_sms(
    violation_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Manually send an SMS challan, bypassing the 10-minute rate limit (force=True)."""
    result = await db.execute(
        select(ViolationModel).where(ViolationModel.id == violation_id)
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail=f"Violation {violation_id} not found")

    from ..services.sms_service import send_challan_sms
    try:
        await send_challan_sms(obj, force=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    return {"status": "success", "message": f"Challan SMS manually sent to dual recipients for violation {violation_id}"}



