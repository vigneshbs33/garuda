from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Dict, Any

from ..core.database import ViolationModel, get_db

router = APIRouter(prefix="/evidence")

class EvidenceDetailResponse(BaseModel):
    violation_id: str
    camera_id: str
    timestamp: str
    plate_text: str
    vehicle_class: str
    before_frame: Dict[str, Any]
    violation_frame: Dict[str, Any]
    after_frame: Dict[str, Any]

@router.get("/{id}", response_model=EvidenceDetailResponse)
async def get_evidence_detail(id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(select(ViolationModel).where(ViolationModel.id == id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Evidence records not found for {id}")
        
    import json
    try:
        record = json.loads(row.json_record or "{}")
    except:
        record = {}
        
    # Build default coordinates if not present
    before_frame = record.get("beforeFrame", {
        "timestamp": row.timestamp,
        "vehicleBox": {"x": 50, "y": 120, "w": 90, "h": 55},
        "plateBox": {"x": 90, "y": 155, "w": 20, "h": 10},
        "vehicleSvgType": "sedan",
        "color": "#3B82F6"
    })
    
    violation_frame = record.get("violationFrame", {
        "timestamp": row.timestamp,
        "vehicleBox": {"x": 120, "y": 100, "w": 95, "h": 58},
        "plateBox": {"x": 165, "y": 138, "w": 22, "h": 11},
        "vehicleSvgType": "sedan",
        "color": "#3B82F6"
    })
    
    after_frame = record.get("afterFrame", {
        "timestamp": row.timestamp,
        "vehicleBox": {"x": 220, "y": 80, "w": 90, "h": 55},
        "plateBox": {"x": 260, "y": 115, "w": 20, "h": 10},
        "vehicleSvgType": "sedan",
        "color": "#3B82F6"
    })
    
    return EvidenceDetailResponse(
        violation_id=row.id,
        camera_id=row.camera_id,
        timestamp=row.timestamp,
        plate_text=row.plate_text,
        vehicle_class=row.vehicle_class,
        before_frame=before_frame,
        violation_frame=violation_frame,
        after_frame=after_frame
    )
