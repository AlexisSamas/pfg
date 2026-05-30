# Backend PFG - Monitorizacion Cognitiva

Backend REST para un prototipo de evaluacion cognitiva mediante juegos serios. Permite autenticar usuarios, crear sesiones de evaluacion, recibir eventos de juego, calcular scoring de atencion, generar una decision final y consultar periodos de espera.

## Stack Tecnologico

- Python 3.11
- FastAPI
- Uvicorn
- SQLAlchemy
- PostgreSQL
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
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

En Linux/macOS:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Configuracion

La aplicacion lee variables desde `.env`. Usa `.env.example` como plantilla:

```powershell
Copy-Item .env.example .env
```

Variables principales:

- `DATABASE_URL`: URL de conexion a PostgreSQL. Ejemplo: `postgresql://postgres:postgres@localhost:5432/pfg_db`.
- `SECRET_KEY`: clave usada para firmar JWT. Cambiarla fuera de desarrollo.
- `ALGORITHM`: algoritmo JWT, por defecto `HS256`.
- `ACCESS_TOKEN_EXPIRE_MINUTES`: duracion del token de acceso.
- `DEFAULT_ATTENTION_THRESHOLD`: umbral de scoring para `ACCESO`, por defecto `60.0`.
- `DEFAULT_WAIT_MINUTES`: minutos de cooldown cuando la decision es `ESPERA`.
- `MAX_ATTEMPTS`: limite previsto de intentos.

## Ejecucion

```powershell
uvicorn app.main:app --reload
```

El backend crea las tablas con SQLAlchemy al arrancar y crea un usuario de prueba si no existe:

- usuario: `testuser`
- password: `secret`

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
pytest tests/ -v
```

Ejecutar unitarios:

```powershell
pytest tests/unit/ -v
```

Ejecutar integracion:

```powershell
pytest tests/integration/ -v
```

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
- Si el `wait_period` expiro, se permite crear un nuevo intento.
- El frontend y dashboard no forman parte de este backend en esta fase.
