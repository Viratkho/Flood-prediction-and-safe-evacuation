"""
User Authentication and Profile Router (Section 4.A & Section 7).
100% Free & Local with salted PBKDF2 password hashing in SQLite.
"""

from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Header, status

from backend.schemas import UserRegisterRequest, UserLoginRequest, UserResponse, UserLoginResponse
from backend.crud import (
    create_user,
    authenticate_user,
    create_user_session,
    get_session_user,
    revoke_user_session
)

router = APIRouter(prefix="/api/users", tags=["User Operations"])


def extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:].strip()
    return authorization


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserRegisterRequest):
    """
    Registers a new citizen or administrator in SQLite.
    Validates email uniqueness and hashes passwords using PBKDF2-HMAC-SHA256.
    """
    try:
        user_record = create_user(user_in)
        return user_record
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Registration failed: {str(e)}")


@router.post("/login", response_model=UserLoginResponse)
def login(login_in: UserLoginRequest):
    """
    Validates user credentials against SQLite salted PBKDF2 hash.
    Generates a revocable session token.
    """
    user_record = authenticate_user(login_in.email, login_in.password)
    if not user_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    token = create_user_session(user_record["id"], user_record["email"], user_record["role"])
    return {
        "token": token,
        "token_type": "bearer",
        "user": user_record
    }


@router.get("/me", response_model=UserResponse)
def get_me(authorization: Optional[str] = Header(None)):
    """
    Retrieves currently authenticated user profile from active SQLite session.
    """
    token = extract_bearer_token(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header."
        )

    user_record = get_session_user(token)
    if not user_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token."
        )

    return user_record


@router.post("/logout")
def logout(authorization: Optional[str] = Header(None)):
    """Revokes current user session token in SQLite."""
    token = extract_bearer_token(authorization)
    if token:
        revoke_user_session(token)
    return {"status": "SUCCESS", "message": "User session revoked."}
