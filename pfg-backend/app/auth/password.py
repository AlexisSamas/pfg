"""
Servicio de hashing y verificación de contraseñas.

Proporciona funciones reutilizables para:
- Hashear contraseñas con bcrypt
- Verificar contraseñas contra hashes almacenados
"""

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str) -> str:
    """
    Hashea una contraseña en texto plano.

    Args:
        password: Contraseña en texto plano.

    Returns:
        Hash de la contraseña usando bcrypt.
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifica si una contraseña en texto plano coincide con su hash.

    Args:
        plain_password: Contraseña en texto plano.
        hashed_password: Hash almacenado de la contraseña.

    Returns:
        True si la contraseña coincide, False en caso contrario.
    """
    return pwd_context.verify(plain_password, hashed_password)
