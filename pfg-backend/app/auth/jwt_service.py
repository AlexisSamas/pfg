"""
Servicio de JWT para autenticación.

Proporciona funciones reutilizables para:
- Generar tokens de acceso
- Validar y decodificar tokens
- Manejo de expiración y errores
"""

from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt

from app.core.config import settings


def create_access_token(
    data: dict, expires_delta: Optional[timedelta] = None
) -> str:
    """
    Crea un token JWT de acceso.

    Args:
        data: Información a incluir en el token (ej: {"sub": user_id}).
        expires_delta: Tiempo de expiración personalizado. Si es None,
                      se usa ACCESS_TOKEN_EXPIRE_MINUTES de settings.

    Returns:
        Token JWT codificado como string.
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> dict:
    """
    Decodifica y valida un token JWT.

    Args:
        token: Token JWT a decodificar.

    Returns:
        Diccionario con los datos codificados en el token.

    Raises:
        JWTError: Si el token es inválido o ha expirado.
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        raise
