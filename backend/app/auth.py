"""
Supabase JWT authentication dependency for FastAPI.

Verifies the Supabase-issued Bearer token on incoming requests.
Provides `get_current_user` as an optional dependency — routes that need
authentication should declare `current_user: AuthUser = Depends(get_current_user)`.
Routes that should remain public (e.g. /health) do not declare this dependency.

The token is a RS256-signed JWT.  We fetch Supabase's JWKS once per process
and cache it.  The JWT is validated against:
  - signature (RS256, from JWKS)
  - expiry (`exp`)
  - audience (`aud == "authenticated"`)
  - issuer (`iss == https://<project>.supabase.co/auth/v1`)

Environment variables required (set in Render dashboard or .env):
  SUPABASE_URL   — e.g. https://xyzxyzxyz.supabase.co
  SUPABASE_ANON_KEY  — public anon key (used only to contact the JWKS endpoint)
  SUPABASE_JWT_SECRET — (OPTIONAL) HS256 secret; used as fallback if RS256 JWKS
                         fetch fails (useful for self-hosted / local dev).
"""

from __future__ import annotations

import os
import time
import logging
from dataclasses import dataclass, field
from typing import Any

import jwt
from jwt import PyJWKClient, PyJWKClientError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "").rstrip("/")
_SUPABASE_JWT_SECRET: str | None = os.environ.get("SUPABASE_JWT_SECRET")

# Expected JWT audience and issuer
_EXPECTED_AUDIENCE = "authenticated"
_EXPECTED_ISSUER: str = f"{_SUPABASE_URL}/auth/v1" if _SUPABASE_URL else ""

# JWKS endpoint
_JWKS_URL: str = f"{_SUPABASE_URL}/auth/v1/.well-known/jwks.json" if _SUPABASE_URL else ""

# ---------------------------------------------------------------------------
# JWKS client (cached, auto-refreshes)
# ---------------------------------------------------------------------------

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient | None:
    global _jwks_client  # noqa: PLW0603
    if not _JWKS_URL:
        return None
    if _jwks_client is None:
        try:
            _jwks_client = PyJWKClient(_JWKS_URL, cache_jwk_set=True, lifespan=300)
        except Exception:  # pragma: no cover
            logger.exception("Failed to initialise JWKS client for %s", _JWKS_URL)
    return _jwks_client


# ---------------------------------------------------------------------------
# Typed user representation
# ---------------------------------------------------------------------------

@dataclass
class AuthUser:
    """Minimal authenticated user data derived from a verified JWT."""
    id: str            # Supabase `sub` (UUID)
    email: str | None  # may be None for magic-link/phone users
    role: str          # usually "authenticated"
    claims: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Bearer token extractor (non-auto-error so we can give nicer messages)
# ---------------------------------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=False)


def _verify_token(token: str) -> AuthUser:
    """Decode and verify a Supabase JWT. Raises HTTPException on any failure."""
    if not _SUPABASE_URL and not _SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Authentication is not configured on this server. "
                "Set SUPABASE_URL and SUPABASE_JWT_SECRET environment variables."
            ),
        )

    try:
        unverified_header = jwt.get_unverified_header(token)
        alg = unverified_header.get("alg")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token header.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if alg not in ("RS256", "ES256", "HS256"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Unsupported token algorithm: {alg}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    decode_kwargs: dict[str, Any] = {
        "algorithms": [alg],
        "audience": _EXPECTED_AUDIENCE,
        "options": {"require": ["exp", "sub", "aud"]},
    }
    if _EXPECTED_ISSUER:
        decode_kwargs["issuer"] = _EXPECTED_ISSUER

    try:
        if alg in ("RS256", "ES256"):
            jwks_client = _get_jwks_client()
            if jwks_client is None:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="JWKS client not available. Set SUPABASE_URL.",
                )
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(token, signing_key.key, **decode_kwargs)
        else:
            # HS256 verification
            if not _SUPABASE_JWT_SECRET:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="HS256 token verification requires SUPABASE_JWT_SECRET.",
                )
            payload = jwt.decode(token, _SUPABASE_JWT_SECRET, **decode_kwargs)
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except (jwt.InvalidTokenError, PyJWKClientError) as exc:
        logger.debug("JWT validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or unverifiable token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    return AuthUser(
        id=payload["sub"],
        email=payload.get("email"),
        role=payload.get("role", "authenticated"),
        claims=payload,
    )


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AuthUser:
    """FastAPI dependency that returns the authenticated user or raises 401."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _verify_token(credentials.credentials)


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AuthUser | None:
    """FastAPI dependency that returns the user if authenticated, or None if guest.
    
    If credentials are provided but invalid or expired, raises 401 so the client
    can refresh the session rather than silently falling back to guest mode.
    """
    if credentials is None:
        return None
    return _verify_token(credentials.credentials)
