"""
Router de autenticación.

Endpoints:
- POST /auth/token: Autentica usuario y devuelve JWT
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.password import verify_password
from app.database.session import get_db
from app.models.user import User
from app.schemas.user import Token
from app.services.last_evaluation import create_user_access_token

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
