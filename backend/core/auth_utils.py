"""
GARUDA Backend — Cryptography & JWT Helpers (Zero-dependency)
=============================================================
Uses standard library hashlib, hmac, base64 to prevent dependency issues.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Fallback SECRET_KEY if not in environment
SECRET_KEY = os.environ.get("GARUDA_JWT_SECRET", "garuda_super_secret_jwt_encryption_key_2026")


# ---------------------------------------------------------------------------
# Password hashing via PBKDF2-HMAC-SHA256
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256."""
    salt = os.urandom(16)
    db_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        100000
    )
    return f"{salt.hex()}.{db_hash.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """Verify PBKDF2-HMAC-SHA256 password hash."""
    if not hashed or "." not in hashed:
        return False
    try:
        salt_hex, hash_hex = hashed.split(".", 1)
        salt = bytes.fromhex(salt_hex)
        db_hash = bytes.fromhex(hash_hex)
        test_hash = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            100000
        )
        return hmac.compare_digest(test_hash, db_hash)
    except Exception as exc:
        logger.error("Password verification error: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Base64URL encoding helpers
# ---------------------------------------------------------------------------

def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def base64url_decode(data: str) -> bytes:
    padding = "=" * (4 - (len(data) % 4))
    return base64.urlsafe_b64decode(data + padding)


# ---------------------------------------------------------------------------
# JWT Encode / Decode (HS256)
# ---------------------------------------------------------------------------

def create_jwt_token(payload: Dict[str, Any], expires_in_seconds: int = 86400) -> str:
    """Create a HMAC-SHA256 signed JWT token."""
    header = {"alg": "HS256", "typ": "JWT"}
    payload_copy = payload.copy()
    payload_copy["exp"] = int(time.time()) + expires_in_seconds
    
    header_json = json.dumps(header, separators=(",", ":")).encode("utf-8")
    payload_json = json.dumps(payload_copy, separators=(",", ":")).encode("utf-8")
    
    encoded_header = base64url_encode(header_json)
    encoded_payload = base64url_encode(payload_json)
    
    signature_base = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    signature = hmac.new(SECRET_KEY.encode("utf-8"), signature_base, hashlib.sha256).digest()
    encoded_signature = base64url_encode(signature)
    
    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"


def decode_jwt_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and verify signature and expiration of a JWT token."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        encoded_header, encoded_payload, encoded_signature = parts
        
        # Verify signature
        signature_base = f"{encoded_header}.{encoded_payload}".encode("utf-8")
        expected_signature = hmac.new(SECRET_KEY.encode("utf-8"), signature_base, hashlib.sha256).digest()
        actual_signature = base64url_decode(encoded_signature)
        
        if not hmac.compare_digest(expected_signature, actual_signature):
            logger.warning("JWT decode failed: signature mismatch")
            return None
            
        # Parse payload
        payload_json = base64url_decode(encoded_payload)
        payload = json.loads(payload_json.decode("utf-8"))
        
        # Check expiration
        if payload.get("exp", 0) < time.time():
            logger.warning("JWT decode failed: token expired")
            return None
            
        return payload
    except Exception as exc:
        logger.error("JWT decode error: %s", exc)
        return None
