from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from pydantic import BaseModel
from datetime import datetime

from ..core.database import AuditLogModel, ViolationModel, get_db, update_violation_status

router = APIRouter(prefix="/reviews")

class ReviewSubmitRequest(BaseModel):
    violation_id: str
    action: str  # "Approved" | "Rejected" | "Escalated"
    reviewer: str
    reason: Optional[str] = None

class ReviewLogResponse(BaseModel):
    id: int
    timestamp: str
    actor: str
    action: str
    target: str
    details: str

    class Config:
        from_attributes = True

@router.get("", response_model=List[ReviewLogResponse])
async def list_reviews(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(AuditLogModel)
        .where(AuditLogModel.action.in_(["CITATION_APPROVED", "CITATION_REJECTED", "CITATION_ESCALATED"]))
        .order_by(AuditLogModel.timestamp.desc())
    )).scalars().all()
    return [ReviewLogResponse.model_validate(r) for r in rows]

@router.post("")
async def submit_review(body: ReviewSubmitRequest, db: AsyncSession = Depends(get_db)):
    # Map status
    db_status = "pending"
    action_type = "CITATION_ESCALATED"
    if body.action == "Approved":
        db_status = "confirmed"
        action_type = "CITATION_APPROVED"
    elif body.action == "Rejected":
        db_status = "rejected"
        action_type = "CITATION_REJECTED"
    
    violation = (await db.execute(select(ViolationModel).where(ViolationModel.id == body.violation_id))).scalar_one_or_none()
    if not violation:
        raise HTTPException(status_code=404, detail=f"Violation {body.violation_id} not found")
        
    await update_violation_status(db, body.violation_id, db_status, body.reviewer)
    
    # Save audit log
    log = AuditLogModel(
        timestamp=datetime.utcnow().isoformat() + "Z",
        actor=body.reviewer,
        action=action_type,
        target=body.violation_id,
        details=body.reason or f"Violation status changed to {body.action.lower()}"
    )
    db.add(log)
    await db.commit()
    return {"status": "ok", "message": f"Review action {body.action} logged successfully"}

from typing import Optional
