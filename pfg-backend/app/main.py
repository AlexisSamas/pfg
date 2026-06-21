"""
Punto de entrada de la aplicación FastAPI.

Arranca con:
    uvicorn app.main:app --reload
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database.session import engine, SessionLocal
from app.database.init_db import init_db
from app.models.user import User
from app.auth.password import get_password_hash
from app.routers import auth, dashboard, sessions


DEMO_USERS = [
    {
        "username": "alexis.samas.contreras@alumnos.upm.es",
        "email": "alexis.samas.contreras@alumnos.upm.es",
        "password": "secret",
        "role": "student",
    },
    {
        "username": "mario.vega@upm.es",
        "email": "mario.vega@upm.es",
        "password": "secret",
        "role": "instructor",
    },
]


def create_demo_users():
    """Crea usuarios de demo si no existen."""
    db = SessionLocal()
    try:
        for demo_user in DEMO_USERS:
            existing_user = (
                db.query(User)
                .filter(User.username == demo_user["username"])
                .first()
            )

            if existing_user:
                print(f"[OK] Usuario demo ya existe: {demo_user['username']}")
                continue

            user = User(
                username=demo_user["username"],
                email=demo_user["email"],
                hashed_password=get_password_hash(demo_user["password"]),
                role=demo_user["role"],
            )
            db.add(user)
            db.commit()
            print(
                "[OK] Usuario demo creado: "
                f"{demo_user['username']}/{demo_user['password']} "
                f"({demo_user['role']})"
            )
    except Exception as e:
        db.rollback()
        print(f"[WARN] Error al crear usuarios demo: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crear tablas en la base de datos al arrancar
    init_db()
    # Crear usuarios de demo
    create_demo_users()
    yield


app = FastAPI(
    title="PFG — Monitorización Cognitiva",
    description="API para evaluación de atención mediante juegos cognitivos.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar routers
app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(dashboard.router)


@app.get("/", tags=["health"])
def root():
    """Health-check: verifica que el backend y la BD responden."""
    try:
        conn = engine.connect()
        conn.close()
        return {"message": "Backend OK + DB conectada"}
    except Exception:
        return {"error": "DB no conectada"}
