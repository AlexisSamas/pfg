"""
Router de autenticación.

Endpoints:
- POST /auth/token: Autentica usuario y devuelve JWT
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.password import verify_password
from app.database.session import get_db
from app.models.user import User
from app.schemas.user import StudentStatus, Token
from app.services.last_evaluation import (
    create_user_access_token,
    get_context_attempt_claim,
    get_context_last_evaluation_claim,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    """Schema para recibir credenciales de login."""
    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)


@router.post("/token", response_model=Token)
def login(
    credentials: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Autentica un usuario y devuelve un JWT.

    Args:
        credentials: Credenciales de usuario (username y password).
        db: Sesión de base de datos.

    Returns:
        Token JWT con token_type "bearer".

    Raises:
        HTTPException 401: Si las credenciales son inválidas.
    """
    # Buscar usuario por username
    user = db.query(User).filter(User.username == credentials.username).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verificar contraseña
    if not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Generar token
    access_token = create_user_access_token(db=db, user=user)

    return Token(access_token=access_token, token_type="bearer")


@router.get("/refresh", response_model=Token)
def refresh_token(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Regenera el JWT del usuario autenticado con sus claims actuales.
    """
    access_token = create_user_access_token(db=db, user=current_user)

    return Token(access_token=access_token, token_type="bearer")


@router.get("/status/{context_id}", response_model=StudentStatus)
def get_student_status(
    context_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Devuelve el estado fresco del alumno para un contexto concreto.
    """
    attempt_claim = get_context_attempt_claim(
        db=db,
        user_id=current_user.id,
        context_id=context_id,
    )
    last_evaluation = get_context_last_evaluation_claim(
        db=db,
        user_id=current_user.id,
        context_id=context_id,
    )

    return StudentStatus(
        context_id=context_id,
        attempt_count=attempt_claim["attempt_count"],
        max_attempts=attempt_claim["max_attempts"],
        last_evaluation=last_evaluation,
    )
