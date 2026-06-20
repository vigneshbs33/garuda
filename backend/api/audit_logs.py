"""
GARUDA API — Audit Logs Router
================================
Provides log access for system audit-ready compliance tracking.
"""
from __future__ import annotations

import logging
from typing import List
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import AuditLogModel, UserModel, get_db
from .auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/audit-logs")


class AuditLogResponse(BaseModel):
    time: str
    actor: str
    action: str
    target: str
    details: str

    class Config:
        from_attributes = True


@router.get("", response_model=List[AuditLogResponse])
async def list_audit_logs(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve all compliance logs, sorted newest first."""
    rows = (await db.execute(select(AuditLogModel).order_by(AuditLogModel.timestamp.desc()))).scalars().all()
    
    # Map backend database fields to frontend API expectations
    return [
        AuditLogResponse(
            time=r.timestamp,
            actor=r.actor,
            action=r.action,
            target=r.target,
            details=r.details
        )
        for r in rows
    ]
