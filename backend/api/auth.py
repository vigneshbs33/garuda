"""
GARUDA API — Authentication Router
====================================
Implements signup, password verification, activation link verification, and JWT generation.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import UserModel, get_db
from ..core.config import get_settings
from ..core.email_service import send_verification_email
from ..core.auth_utils import hash_password, verify_password, create_jwt_token, decode_jwt_token

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "Operator"  # Operator, Reviewer, Supervisor, Admin


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    email: str


class UserMeResponse(BaseModel):
    id: str
    name: str
    role: str
    email: str
    status: str


# ---------------------------------------------------------------------------
# Dependency: Get authenticated user
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> UserModel:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization header missing or invalid")
    
    token = credentials.credentials
    payload = decode_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token or session expired")
    
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Malformed authentication token")
        
    result = await db.execute(select(UserModel).where(UserModel.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User account not found")
    if user.status != "Active":
        raise HTTPException(status_code=403, detail="User account is deactivated")
        
    return user


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/auth/register")
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    settings = get_settings()
    # Check if SMTP parameters are set
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_FROM_EMAIL:
        raise HTTPException(
            status_code=400,
            detail=(
                "SMTP Email Server is not configured. Real-time email verification is active. "
                "Please configure the following values in your '.env' file: "
                "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL."
            )
        )

    # Check if user already exists
    existing = (await db.execute(
        select(UserModel).where(UserModel.email == body.email)
    )).scalar_one_or_none()
    
    if existing:
        raise HTTPException(status_code=409, detail="User with this email already registered")
        
    # Generate unique ID and activation token
    user_id = f"USR-{uuid.uuid4().hex[:6].upper()}"
    verification_token = uuid.uuid4().hex
    
    new_user = UserModel(
        id=user_id,
        name=body.name,
        email=body.email,
        role=body.role,
        status="Pending",
        password_hash=hash_password(body.password),
        is_verified=False,
        verification_token=verification_token
    )
    
    db.add(new_user)
    await db.commit()
    
    # Try sending real-time verification email
    try:
        await send_verification_email(body.email, body.name, verification_token, settings)
    except Exception as smtp_err:
        logger.error("Real-time SMTP email verification dispatch failed: %s", smtp_err)
        # Rollback user creation to maintain consistency
        await db.delete(new_user)
        await db.commit()
        raise HTTPException(
            status_code=502,
            detail=(
                f"Failed to dispatch verification email to {body.email}: {str(smtp_err)}. "
                "Check that your SMTP configurations in your '.env' are correct."
            )
        )
    
    return {
        "status": "ok", 
        "message": "Registration successful! A verification email has been sent to your registered address."
    }


@router.get("/auth/verify", response_class=HTMLResponse)
async def verify_email(token: str = Query(..., description="Activation token"), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserModel).where(UserModel.verification_token == token))
    user = result.scalar_one_or_none()
    
    if not user:
        return HTMLResponse(
            status_code=404,
            content=f"""
            <html>
                <head>
                    <title>Verification Failed | GARUDA</title>
                    <style>
                        body {{ background-color: #0F172A; color: #F8FAFC; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
                        .card {{ background-color: #1E293B; padding: 40px; border-radius: 12px; border: 1px solid #EF4444; max-width: 450px; text-align: center; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); }}
                        h1 {{ color: #EF4444; margin-top: 0; font-size: 24px; }}
                        p {{ color: #94A3B8; font-size: 14px; line-height: 1.6; margin-bottom: 20px; }}
                        .btn {{ background-color: #EF4444; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block; transition: background 0.2s; }}
                        .btn:hover {{ background-color: #DC2626; }}
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>ACTIVATION FAILED</h1>
                        <p>The activation token is invalid, expired, or has already been used. Please try registering again or contact system administration.</p>
                        <a href="http://localhost:3000/login" class="btn">Return to Login</a>
                    </div>
                </body>
            </html>
            """
        )
    
    # Activate user
    user.is_verified = True
    user.status = "Active"
    user.verification_token = None
    await db.commit()
    
    logger.info("User activated and email verified: %s (%s)", user.name, user.email)
    
    # Return a premium success page matching GARUDA theme
    return HTMLResponse(
        content=f"""
        <html>
            <head>
                <title>Email Verified | GARUDA</title>
                <style>
                    body {{ background-color: #0F172A; color: #F8FAFC; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
                    .card {{ background-color: #1E293B; padding: 40px; border-radius: 16px; border: 2px solid #FEF08A; max-width: 480px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4); }}
                    .success-icon {{ width: 64px; height: 64px; background-color: #FEF08A; color: #0F172A; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; margin: 0 auto 24px auto; }}
                    h1 {{ color: #FEF08A; margin-top: 0; font-size: 26px; letter-spacing: -0.5px; font-weight: 800; }}
                    p {{ color: #CBD5E1; font-size: 15px; line-height: 1.6; margin-bottom: 28px; }}
                    .btn {{ background-color: #FEF08A; color: #0F172A; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block; transition: background 0.2s, transform 0.1s; }}
                    .btn:hover {{ background-color: #FDE047; transform: translateY(-1px); }}
                    .btn:active {{ transform: translateY(0); }}
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="success-icon">✓</div>
                    <h1>EMAIL VERIFIED</h1>
                    <p>Congratulations, <b>{user.name}</b>! Your email address has been successfully verified. Your account status is now updated to <b>Active</b>.</p>
                    <a href="http://localhost:3000/login" class="btn">Proceed to Login</a>
                </div>
            </body>
        </html>
        """
    )


@router.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserModel).where(UserModel.email == body.email))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password credentials")
        
    if not user.is_verified:
        raise HTTPException(
            status_code=400, 
            detail="Your email address has not been verified yet. Please check your email inbox (including spam) for the activation link."
        )
        
    # Generate token
    token = create_jwt_token({
        "sub": user.email,
        "name": user.name,
        "role": user.role
    })
    
    return LoginResponse(
        access_token=token,
        role=user.role,
        username=user.name,
        email=user.email
    )


@router.get("/auth/me", response_model=UserMeResponse)
async def get_me(current_user: UserModel = Depends(get_current_user)):
    return UserMeResponse(
        id=current_user.id,
        name=current_user.name,
        role=current_user.role,
        email=current_user.email,
        status=current_user.status
    )
