"""
GARUDA Backend — Async Database
=================================
SQLite (dev) via aiosqlite / SQLAlchemy async ORM.
Switch to PostgreSQL by changing DATABASE_URL in .env.

Tables created automatically on startup.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Float, Integer, Boolean, Text, DateTime

from .config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Engine + session factory
# ---------------------------------------------------------------------------

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False}
    if "sqlite" in settings.DATABASE_URL
    else {},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


# ---------------------------------------------------------------------------
# ORM base + models
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


class ViolationModel(Base):
    __tablename__ = "violations"

    id             : Mapped[str]   = mapped_column(String, primary_key=True)
    camera_id      : Mapped[str]   = mapped_column(String, index=True)
    location       : Mapped[str]   = mapped_column(String, default="")
    timestamp      : Mapped[str]   = mapped_column(String, index=True)
    violation_type : Mapped[str]   = mapped_column(String, index=True)
    confidence     : Mapped[float] = mapped_column(Float)
    severity       : Mapped[str]   = mapped_column(String)
    tier           : Mapped[int]   = mapped_column(Integer)
    action         : Mapped[str]   = mapped_column(String)
    fine_amount    : Mapped[int]   = mapped_column(Integer, default=0)
    plate_text     : Mapped[str]   = mapped_column(String, default="", index=True)
    plate_conf     : Mapped[float] = mapped_column(Float,  default=0.0)
    vehicle_class  : Mapped[str]   = mapped_column(String, default="")
    annotated_img  : Mapped[str]   = mapped_column(String, default="")
    raw_img        : Mapped[str]   = mapped_column(String, default="")
    json_record    : Mapped[str]   = mapped_column(Text,   default="{}")
    status         : Mapped[str]   = mapped_column(String, default="pending", index=True)
    officer_id     : Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at     : Mapped[str]   = mapped_column(String, default=lambda: datetime.utcnow().isoformat())


class CameraModel(Base):
    __tablename__ = "cameras"

    id           : Mapped[str]   = mapped_column(String, primary_key=True)
    location     : Mapped[str]   = mapped_column(String)
    lat          : Mapped[float] = mapped_column(Float, default=0.0)
    lon          : Mapped[float] = mapped_column(Float, default=0.0)
    stop_line_y  : Mapped[int]   = mapped_column(Integer, default=380)
    status       : Mapped[str]   = mapped_column(String, default="active")
    last_seen    : Mapped[str]   = mapped_column(String, default="")
    description  : Mapped[str]   = mapped_column(String, default="")


class VehicleModel(Base):
    __tablename__ = "vehicles"

    plate              : Mapped[str]  = mapped_column(String, primary_key=True)
    violation_count    : Mapped[int]  = mapped_column(Integer, default=0)
    is_repeat_offender : Mapped[bool] = mapped_column(Boolean, default=False)
    first_seen         : Mapped[str]  = mapped_column(String, default="")
    last_seen          : Mapped[str]  = mapped_column(String, default="")
    violations_json    : Mapped[str]  = mapped_column(Text,   default="[]")
    state_code         : Mapped[str]  = mapped_column(String, default="")


# ---------------------------------------------------------------------------
# Init / teardown
# ---------------------------------------------------------------------------

async def init_db() -> None:
    """Create all tables. Called on FastAPI startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database initialised: %s", settings.DATABASE_URL)


async def close_db() -> None:
    await engine.dispose()
    logger.info("Database connection closed")


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------

async def get_db():
    """FastAPI dependency: yields an async DB session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# CRUD helpers
# ---------------------------------------------------------------------------

async def save_violation(session: AsyncSession, record: Dict) -> ViolationModel:
    obj = ViolationModel(
        id             = record["violation_id"],
        camera_id      = record.get("camera", {}).get("id", ""),
        location       = record.get("camera", {}).get("location", ""),
        timestamp      = record.get("timestamp", datetime.utcnow().isoformat()),
        violation_type = record.get("violations", [{}])[0].get("type", "") if record.get("violations") else "",
        confidence     = record.get("violations", [{}])[0].get("confidence", 0.0) if record.get("violations") else 0.0,
        severity       = record.get("violations", [{}])[0].get("severity", "") if record.get("violations") else "",
        tier           = record.get("tier", 3),
        action         = record.get("action", ""),
        fine_amount    = record.get("violations", [{}])[0].get("fine_amount_inr", 0) if record.get("violations") else 0,
        plate_text     = record.get("vehicle", {}).get("license_plate", ""),
        plate_conf     = record.get("vehicle", {}).get("plate_confidence", 0.0),
        vehicle_class  = record.get("vehicle", {}).get("class", ""),
        annotated_img  = record.get("evidence", {}).get("annotated_image", ""),
        raw_img        = record.get("evidence", {}).get("raw_frame", ""),
        json_record    = json.dumps(record, default=str),
        status         = "auto_challan" if record.get("tier") == 1 else "pending",
    )
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj


async def update_violation_status(
    session: AsyncSession,
    violation_id: str,
    status: str,
    officer_id: Optional[str] = None,
) -> Optional[ViolationModel]:
    from sqlalchemy import select
    result = await session.execute(
        select(ViolationModel).where(ViolationModel.id == violation_id)
    )
    obj = result.scalar_one_or_none()
    if obj:
        obj.status     = status
        obj.officer_id = officer_id
        await session.commit()
        await session.refresh(obj)
    return obj


async def upsert_vehicle(session: AsyncSession, plate: str, violation_type: str, state_code: str = "") -> None:
    from sqlalchemy import select
    result = await session.execute(
        select(VehicleModel).where(VehicleModel.plate == plate)
    )
    obj = result.scalar_one_or_none()
    now = datetime.utcnow().isoformat()

    if obj:
        obj.violation_count += 1
        obj.last_seen = now
        obj.is_repeat_offender = obj.violation_count >= 3
        violations = json.loads(obj.violations_json or "[]")
        violations.append({"type": violation_type, "time": now})
        obj.violations_json = json.dumps(violations[-50:])  # Keep last 50
    else:
        obj = VehicleModel(
            plate              = plate,
            violation_count    = 1,
            is_repeat_offender = False,
            first_seen         = now,
            last_seen          = now,
            violations_json    = json.dumps([{"type": violation_type, "time": now}]),
            state_code         = state_code,
        )
        session.add(obj)

    await session.commit()
