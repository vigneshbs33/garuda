from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from pydantic import BaseModel
from datetime import datetime
import asyncio
import random
import uuid

from ..core.database import JobModel, get_db, AsyncSessionLocal, save_violation
from .stream import broadcast_violation

router = APIRouter(prefix="/jobs")

class JobCreate(BaseModel):
    name: str
    source_type: str  # "Image" or "Video"

class JobResponse(BaseModel):
    id: str
    name: str
    source_type: str
    progress: int
    status: str
    duration: int
    frames_processed: int
    violations_found: int
    upload_time: str

    class Config:
        from_attributes = True

async def simulate_job_inference(job_id: str):
    await asyncio.sleep(2)  # Delay before start
    
    # 25% progress
    async with AsyncSessionLocal() as session:
        job = (await session.execute(select(JobModel).where(JobModel.id == job_id))).scalar_one_or_none()
        if job:
            job.status = "Processing"
            job.progress = 25
            job.duration = 2
            await session.commit()
            
    await asyncio.sleep(2)
    
    # 65% progress
    async with AsyncSessionLocal() as session:
        job = (await session.execute(select(JobModel).where(JobModel.id == job_id))).scalar_one_or_none()
        if job:
            job.progress = 65
            job.duration = 4
            job.frames_processed = 120
            await session.commit()

    await asyncio.sleep(2)
    
    # 100% completion
    async with AsyncSessionLocal() as session:
        job = (await session.execute(select(JobModel).where(JobModel.id == job_id))).scalar_one_or_none()
        if job:
            found_count = random.choice([1, 2])
            job.progress = 100
            job.status = "Completed"
            job.duration = 6
            job.frames_processed = 240 if job.source_type == "Video" else 1
            job.violations_found = found_count
            await session.commit()
            
            # Seed and insert simulated violations for the completed job
            for i in range(found_count):
                vid = f"VIO-JOB-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:4].upper()}"
                v_type = random.choice(["Speeding", "Red Light", "Wrong Way", "Seatbelt"])
                plate = f"{random.randint(0,9)}KA-{random.randint(10,99)}-AB-{random.randint(1000,9999)}"
                
                record = {
                    "violation_id": vid,
                    "tier": 2,
                    "action": "HUMAN_REVIEW",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "camera": {"id": "CAM-101", "location": "Downtown Zone A", "coordinates": {}},
                    "vehicle": {
                        "class": "car", "color": "white",
                        "license_plate": plate, "plate_confidence": 0.88,
                        "plate_valid": True, "plate_state": "Karnataka",
                        "repeat_offender": False, "prior_violations": 0,
                    },
                    "violations": [{
                        "type": v_type,
                        "confidence": 0.85,
                        "severity": "medium",
                        "fine_amount_inr": 1000,
                        "bbox": [100, 100, 300, 300],
                        "metadata": {"job": job_id},
                    }],
                    "driver_state": {"alerts": [], "total_alerts": 0},
                    "evidence": {"annotated_image": "", "raw_frame": ""},
                }
                
                await save_violation(session, record)
                
                # Broadcast new violation to active WebSockets
                await broadcast_violation({
                    "event": "violation_detected",
                    "violation_id": vid,
                    "violation_type": v_type,
                    "confidence": 85.0,
                    "tier": 2,
                    "plate": plate,
                    "camera_id": "CAM-101",
                    "location": "Downtown Zone A",
                    "timestamp": record["timestamp"],
                    "severity": "medium",
                    "annotated_image_url": "",
                })

@router.get("", response_model=List[JobResponse])
async def list_jobs(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(JobModel).order_by(JobModel.upload_time.desc()))).scalars().all()
    return [JobResponse.model_validate(r) for r in rows]

@router.post("", response_model=JobResponse, status_code=201)
async def create_job(body: JobCreate, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    job_id = f"JOB-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:4].upper()}"
    job = JobModel(
        id=job_id,
        name=body.name,
        source_type=body.source_type,
        progress=0,
        status="Queued",
        duration=0,
        frames_processed=0,
        violations_found=0,
        upload_time=datetime.utcnow().isoformat() + "Z"
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    
    # Run the worker simulation in background
    background_tasks.add_task(simulate_job_inference, job_id)
    
    return JobResponse.model_validate(job)

@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    job = (await db.execute(select(JobModel).where(JobModel.id == job_id))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return JobResponse.model_validate(job)
