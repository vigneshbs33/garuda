"""
GARUDA API — Users Router
===========================
Endpoints to view and manage platform users.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import UserModel, AuditLogModel, get_db
from .auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users")


class UserResponse(BaseModel):
    id: str
    name: str
    role: str
    email: str
    status: str
    last_login: str

    class Config:
        from_attributes = True


class UpdateRoleRequest(BaseModel):
    role: str


@router.get("", response_model=List[UserResponse])
async def list_users(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve all users in the system."""
    rows = (await db.execute(select(UserModel).order_by(UserModel.name))).scalars().all()
    return [UserResponse.model_validate(r) for r in rows]


@router.put("/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: UpdateRoleRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Admin privilege: change user role."""
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Only users in the Admin role can alter user roles.")

    user = (await db.execute(select(UserModel).where(UserModel.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")

    old_role = user.role
    user.role = body.role
    
    # Save audit log
    log = AuditLogModel(
        timestamp=datetime.utcnow().isoformat() + "Z",
        actor=current_user.name,
        action="USER_ROLE_REASSIGNED",
        target=user.name,
        details=f"Reassigned from {old_role} to {body.role}"
    )
    db.add(log)
    await db.commit()
    
    logger.info("User %s role updated from %s to %s by %s", user.name, old_role, body.role, current_user.name)
    return {"status": "ok", "message": f"Successfully updated {user.name}'s role to {body.role}"}
