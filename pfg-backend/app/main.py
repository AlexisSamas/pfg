"""
Punto de entrada de la aplicación FastAPI.

Arranca con:
    uvicorn app.main:app --reload
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy.orm import Session

from app.database.session import engine, SessionLocal
from app.database.init_db import init_db
from app.models.user import User
from app.auth.password import get_password_hash
from app.routers import auth, sessions


def create_test_user():
    """Crea un usuario de prueba si no existe."""
    db = SessionLocal()
    try:
        # Verificar si el usuario de prueba ya existe
        test_user = db.query(User).filter(User.username == "testuser").first()
        if not test_user:
            hashed_password = get_password_hash("secret")
            test_user = User(
                username="testuser",
                email="testuser@example.com",
                hashed_password=hashed_password,
                role="student"
            )
            db.add(test_user)
            db.commit()
            print("[OK] Usuario de prueba creado: testuser/secret")
        else:
            print("[OK] Usuario de prueba ya existe")
    except Exception as e:
        db.rollback()
        print(f"[WARN] Error al crear usuario de prueba: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crear tablas en la base de datos al arrancar
    init_db()
    # Crear usuario de prueba
    create_test_user()
    yield


app = FastAPI(
    title="PFG — Monitorización Cognitiva",
    description="API para evaluación de atención mediante juegos cognitivos.",
    version="0.1.0",
    lifespan=lifespan,
)

# Registrar routers
app.include_router(auth.router)
app.include_router(sessions.router)


@app.get("/", tags=["health"])
def root():
    """Health-check: verifica que el backend y la BD responden."""
    try:
        conn = engine.connect()
        conn.close()
        return {"message": "Backend OK + DB conectada"}
    except Exception:
        return {"error": "DB no conectada"}
