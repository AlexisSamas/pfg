# PFG - Monitorizacion Cognitiva

Repositorio principal del Proyecto Fin de Grado. Contiene una aplicacion completa para evaluacion cognitiva mediante juegos serios, con backend FastAPI y frontend React.

El sistema permite autenticar usuarios, ejecutar una evaluacion cognitiva con CPT, Stroop y Flanker, enviar eventos al backend, calcular una puntuacion, devolver una decision final y ofrecer un dashboard docente con concesion manual de acceso.

## Estructura

- `pfg-backend`: API REST FastAPI, persistencia, scoring, JWT, cooldowns, dashboard docente y tests backend.
- `pfg-frontend`: aplicacion React + Vite + TypeScript para alumno y docente, juegos, resultados, countdown y tests frontend.

## Stack

Backend:

- Python 3.11
- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL
- Redis
- JWT
- pytest

Frontend:

- React
- Vite
- TypeScript
- Axios
- React Router
- Vitest
- React Testing Library
- ESLint

## Ejecucion Rapida

Backend con Docker:

```powershell
cd pfg-backend
docker compose up -d --build
docker compose exec backend alembic upgrade head
```

Frontend:

```powershell
cd pfg-frontend
npm install
npm run dev
```

URLs habituales:

- Backend: `http://127.0.0.1:8000`
- Swagger: `http://127.0.0.1:8000/docs`
- Frontend: `http://localhost:5173`

## Credenciales Demo

Alumno:

- usuario: `alexis.samas.contreras@alumnos.upm.es`
- password: `secret`

Docente:

- usuario: `mario.vega@upm.es`
- password: `secret`

## Funcionalidades Principales

- Login con JWT.
- Roles `student` e `instructor`.
- Flujo alumno completo: login, sesion, practica previa, CPT, Stroop, Flanker, envio de eventos, resultado y espera.
- Practica previa de 10 ensayos antes de cada juego.
- Evaluacion real de 60 segundos por juego.
- Modo daltonico opcional en Stroop.
- Dashboard docente por `context_id`.
- Grant manual docente.
- Decisiones `ACCESO`, `ESPERA` y `BLOQUEO`.
- Countdown de espera cuando aplica.
- JWT con resumen `last_evaluation` para actualizar la Home tras login o resultado.

## Tests

Backend:

```powershell
cd pfg-backend
docker compose run --rm backend python -m pytest tests/ -v
```

Frontend:

```powershell
cd pfg-frontend
npm run test
npm run coverage
npm run build
npm run lint
```

## Notas De Seguridad Y Repositorio

- No se versionan `.env` reales.
- No se versionan `venv`, `node_modules`, `dist`, `coverage`, `__pycache__` ni caches temporales.
- El frontend adapta la UI segun el rol del JWT, pero la seguridad real la aplica siempre el backend.
- No existe integracion real con LMS/Moodle en esta version; queda como trabajo futuro.
