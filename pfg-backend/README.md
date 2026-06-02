# Backend PFG - Monitorizacion Cognitiva

Backend REST para un prototipo de evaluacion cognitiva mediante juegos serios. Permite autenticar usuarios, crear sesiones de evaluacion, recibir eventos de juego, calcular scoring de atencion, generar una decision final y consultar periodos de espera.

## Stack Tecnologico

- Python 3.11
- FastAPI
- Uvicorn
- SQLAlchemy
- Alembic
- PostgreSQL
- Redis
- Pydantic
- python-dotenv
- python-jose para JWT
- passlib + bcrypt para passwords
- pytest + httpx para tests

## Requisitos Previos

- Python 3.11 o compatible.
- PostgreSQL instalado y una base de datos disponible, por defecto `pfg_db`.
- Entorno virtual de Python para aislar dependencias.

## Instalacion

Desde la raiz del backend (`pfg-backend`):

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

Opcionalmente puedes activar el entorno antes de instalar:

```powershell
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Si `Activate.ps1` no existe, vuelve a ejecutar `python -m venv venv` desde la carpeta `pfg-backend` y comprueba que se haya creado `venv\Scripts\python.exe`.

En Linux/macOS:

```bash
python -m venv venv
./venv/bin/python -m pip install -r requirements.txt
```

## Configuracion

La aplicacion lee variables desde `.env`. Usa `.env.example` como plantilla:

```powershell
Copy-Item .env.example .env
```

Variables principales:

- `DATABASE_URL`: URL de conexion a PostgreSQL. Ejemplo: `postgresql://postgres:postgres@localhost:5432/pfg_db`.
- `REDIS_URL`: URL de Redis para cache temporal de cooldown. Ejemplo: `redis://localhost:6379/0`.
- `ENABLE_REDIS`: activa Redis cuando vale `true`, `1`, `yes` u `on`. En local puede dejarse en `false`.
- `SECRET_KEY`: clave usada para firmar JWT. Cambiarla fuera de desarrollo.
- `ALGORITHM`: algoritmo JWT, por defecto `HS256`.
- `ACCESS_TOKEN_EXPIRE_MINUTES`: duracion del token de acceso.
- `DEFAULT_ATTENTION_THRESHOLD`: umbral de scoring para `ACCESO`, por defecto `60.0`.
- `DEFAULT_WAIT_MINUTES`: minutos de cooldown cuando la decision es `ESPERA`.
- `MAX_ATTEMPTS`: limite previsto de intentos.

## Ejecucion Local Sin Docker

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

El backend conserva una inicializacion automatica con SQLAlchemy para desarrollo rapido y compatibilidad con tests. Para PostgreSQL y Docker, la forma recomendada de crear o actualizar el esquema es usar Alembic.

Al arrancar, el backend crea un usuario de prueba si no existe:

- usuario: `testuser`
- password: `secret`

## Ejecucion Con Docker Compose

Desde la raiz del backend (`pfg-backend`):

```powershell
docker compose up -d --build
docker compose exec backend alembic upgrade head
```

Swagger queda disponible en:

```text
http://localhost:8000/docs
```

Para parar los contenedores:

```powershell
docker compose down
```

Para parar y borrar el volumen de PostgreSQL:

```powershell
docker compose down -v
```

## Migraciones Alembic

Alembic versiona el esquema de base de datos. Para crear o actualizar la BD local:

```powershell
.\venv\Scripts\python.exe -m alembic upgrade head
```

Crear una nueva migracion a partir de cambios en modelos:

```powershell
.\venv\Scripts\python.exe -m alembic revision --autogenerate -m "mensaje"
```

Usando Docker:

```powershell
docker compose up -d --build
docker compose exec backend alembic upgrade head
```

Para reiniciar PostgreSQL desde cero y aplicar migraciones:

```powershell
docker compose down -v
docker compose up -d --build
docker compose exec backend alembic upgrade head
```

Si el volumen de Docker ya contiene tablas creadas previamente con `Base.metadata.create_all`, `alembic upgrade head` puede fallar con `table already exists`. En ese caso, usa el reinicio limpio anterior o marca manualmente la revision solo si sabes que el esquema existente coincide.

## Swagger

Con el servidor arrancado:

```text
http://127.0.0.1:8000/docs
```

Desde Swagger puedes autenticarte en `/auth/token`, copiar el token Bearer y usar `Authorize` para probar endpoints protegidos.

## Endpoints Principales

- `POST /auth/token`: autentica usuario y devuelve JWT.
- `POST /sessions`: crea una sesion de evaluacion para un `context_id`.
- `POST /sessions/{id}/events`: guarda un lote de eventos de juegos cognitivos.
- `GET /sessions/{id}/result`: calcula o devuelve el resultado de scoring.
- `GET /sessions/{id}/decision`: consulta la decision final persistida.
- `GET /sessions/{id}/wait`: consulta el periodo de espera asociado si existe.
- `GET /dashboard/context/{ctx_id}`: consulta el estado de usuarios de un contexto. Requiere rol `instructor`.
- `POST /dashboard/grant-manual`: concede acceso manual a un usuario. Requiere rol `instructor`.

Ejemplo de concesion manual:

```json
{
  "user_id": 123,
  "context_id": "exam_test_01",
  "reason": "Acceso concedido manualmente por el docente"
}
```

## Modelo Funcional

El flujo evalua atencion sostenida, atencion selectiva e inhibicion de respuesta con tres tareas:

- `cpt`: tarea de respuesta ante diana. Usa hits, misses, false alarms, correct rejections, tiempo de reaccion y `d_prime`.
- `stroop`: tarea de color/palabra. Usa tiempos congruentes e incongruentes y tasa de error.
- `flanker`: tarea de flecha central con distractores. Usa efecto incongruente y precision.

Entidades principales persistidas:

- `users`: usuarios autenticables.
- `exam_sessions`: intentos de evaluacion por usuario y `context_id`.
- `game_events`: eventos enviados por el frontend durante los juegos.
- `scoring_results`: metricas, score global, decision y recomendacion.
- `wait_periods`: cooldown cuando la decision es `ESPERA`.
- `access_decisions`: registro consultable de la decision final.

Redis se usa como cache temporal para cooldowns activos con claves:

```text
cooldown:{user_id}:{context_id}
```

El valor guardado incluye `wait_until`, `recommendation_key` y `reason`, con TTL calculado hasta `wait_until`. PostgreSQL mantiene `wait_periods` como fuente persistente y auditable. Si Redis no esta disponible, el backend sigue funcionando con PostgreSQL.

## Scoring Y Decisiones

El score global se calcula entre 0 y 100 a partir de:

- `d_prime`
- `stroop_effect_ms`
- `flanker_effect_ms`
- `flanker_accuracy`
- `stroop_error_rate`

Reglas de decision:

- `score >= 60`: `ACCESO`.
- `40 <= score < 60`: `ESPERA`.
- `score < 40`: `BLOQUEO`.

Si la decision es `ESPERA` o `BLOQUEO`, el backend identifica `weakest_metric` y asigna una `recommendation_key` adaptativa.

## Tests

Ejecutar toda la suite:

```powershell
.\venv\Scripts\python.exe -m pytest tests/ -v
```

Ejecutar unitarios:

```powershell
.\venv\Scripts\python.exe -m pytest tests/unit/ -v
```

Ejecutar integracion:

```powershell
.\venv\Scripts\python.exe -m pytest tests/integration/ -v
```

Estructura principal:

- `tests/unit/test_scoring.py`: unitarios de scoring segun la memoria.
- `tests/unit/test_cooldown.py`: unitarios del servicio de cooldown Redis/fallback PostgreSQL. Existe porque Redis forma parte del stack tecnologico del backend.
- `tests/integration/test_session_flow.py`: integracion del flujo API principal segun la memoria.

Los tests de integracion usan SQLite en memoria y no modifican la base PostgreSQL local.

## Flujo Basico De Uso

1. Hacer login en `POST /auth/token` con `testuser` / `secret`.
2. Crear una sesion con `POST /sessions` enviando `context_id`.
3. Enviar eventos con `POST /sessions/{id}/events`.
4. Obtener resultado con `GET /sessions/{id}/result`.
5. Consultar decision final con `GET /sessions/{id}/decision`.
6. Si la decision fue `ESPERA`, consultar cooldown con `GET /sessions/{id}/wait`.

## Notas

- Si existe un `wait_period` activo para el mismo usuario y `context_id`, `POST /sessions` devuelve `429 Too Many Requests`.
- Si Redis esta activo, `POST /sessions` consulta primero la clave `cooldown:{user_id}:{context_id}` y usa PostgreSQL como fallback.
- Si el `wait_period` expiro, se permite crear un nuevo intento.
- `MAX_ATTEMPTS` limita el numero de sesiones que un usuario puede crear para el mismo `context_id`.
- Si se alcanza `MAX_ATTEMPTS`, `POST /sessions` devuelve `403 Forbidden` e indica que se requiere concesion manual docente.
- `POST /dashboard/grant-manual` concede acceso directamente mediante `access_decisions`; no reinicia el contador de intentos.
- El frontend no forma parte de este backend en esta fase.
