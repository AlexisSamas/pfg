# Frontend PFG - Monitorización cognitiva

Frontend del Trabajo Fin de Grado para una aplicación de evaluación cognitiva mediante juegos serios. Está construido con React, Vite y TypeScript, y se conecta con un backend FastAPI para crear sesiones, enviar eventos, obtener el resultado de scoring y mostrar la decisión final al usuario.

El frontend actúa como interfaz de usuario. No calcula el scoring: el `score`, la `decision`, la métrica más débil y las recomendaciones vienen del backend.

## Stack

- React
- Vite
- TypeScript
- Axios
- React Router
- Vitest
- React Testing Library

## Requisitos Previos

- Node.js LTS.
- Backend FastAPI arrancado en `http://127.0.0.1:8000`.

## Variables De Entorno

Crear un archivo `.env` a partir de `.env.example`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
# Opcional para demos o desarrollo. El valor final del prototipo es 60000.
# VITE_GAME_DURATION_MS=60000
```

`VITE_API_BASE_URL` define la URL base usada por el cliente Axios. `VITE_GAME_DURATION_MS` permite reducir temporalmente la duración de los juegos en demos o pruebas manuales; si no se define, el frontend usa `60000` ms por juego real.

## JWT Y Última Evaluación

Tras el login, la pantalla principal lee el claim `last_evaluation` del JWT para mostrar un resumen de la última evaluación del alumno. El frontend decodifica el payload solo para mostrar información de UI; no usa esa lectura para autorización ni seguridad. Los roles, permisos y decisiones reales siguen dependiendo del backend.

El resumen puede incluir `score`, `decision`, `context_id`, `recommendation_key`, `wait_until`, `requires_manual_grant` y `manual_grant`. No incluye eventos completos ni datos sensibles.

Cuando el alumno finaliza una evaluación, `GET /sessions/{id}/result` puede devolver `new_access_token`; el frontend lo guarda para que la pantalla principal muestre la evaluación recién calculada sin cerrar sesión.

La interfaz se adapta al rol incluido en el JWT:

- `student`: muestra acceso a evaluación y resumen de ultima evaluacion.
- `instructor`: muestra acceso a dashboard docente y oculta el resumen personal de evaluacion.

Si la ultima decision del alumno es `ESPERA`, la Home muestra countdown cuando `wait_until` esta en el futuro y un mensaje de espera finalizada cuando ya ha vencido. Si `wait_until` falta o no es parseable, se muestra un mensaje claro de estado anomalo.

## Comandos

```bash
npm install
npm run dev
npm run build
npm run test
npm run coverage
npm run lint
```

`npm run coverage` ejecuta Vitest con coverage V8 y genera el informe de cobertura del frontend.
`npm run lint` ejecuta ESLint sobre el código del frontend.

## Tests

Los tests usan Vitest, jsdom y React Testing Library. Cubren:

- Unitarios de utilidades/configuración: duración de evaluación, errores backend y recomendaciones.
- Componentes principales: `LoginPage`, `GameInstructions`, `FlowProgress`, `ResultPage`.
- Juegos: generación básica de eventos válidos en CPT, Stroop y Flanker, incluyendo `reaction_time_ms` positivo y `stimulus_type`.
- Práctica previa: 10 ensayos, feedback inmediato y no mezcla con scoring.
- Integración del flujo alumno: sesión, instrucciones, práctica, juegos reales mockeados, envío de eventos, resultado y recomendación.
- Dashboard docente: consulta por contexto, listado, vacío, error 403, grant manual y refresco.
- Home/JWT: roles, ultima evaluacion, `new_access_token`, `wait_until`, countdown y estados anomalos.

Los tests no dependen del backend real.

## Flujo Alumno

1. Login del usuario.
2. Creación de sesión de evaluación contra el backend.
3. Instrucciones CPT.
4. Práctica CPT de 10 ensayos.
5. Juego CPT real.
6. Instrucciones Stroop.
7. Práctica Stroop de 10 ensayos.
8. Juego Stroop real.
9. Instrucciones Flanker.
10. Práctica Flanker de 10 ensayos.
11. Juego Flanker real.
12. Envío de eventos acumulados al backend.
13. Consulta y visualización del resultado.
14. Visualización de espera y countdown si la decisión es `ESPERA`.

El flujo alumno consulta `GET /sessions/{id}/result` porque ese endpoint ya devuelve `score`, `decision`, `weakest_metric` y `recommendation_key`.

El API client del frontend también expone `GET /sessions/{id}/decision` como endpoint disponible para integración externa o futura.

Antes de cada juego aparece una práctica previa de 10 ensayos con feedback inmediato. Esta práctica no cuenta para la puntuación y sus eventos no se mezclan con los eventos reales ni se envían al backend.

Cada juego real dura 60 segundos en el flujo normal del prototipo. Durante la evaluación real no se muestra feedback inmediato, para no interferir con el scoring.

## Modo Daltónico En Stroop

La fase previa del Stroop incluye un ajuste opcional de accesibilidad visual. El alumno puede activar el modo daltónico y excluir la gama roja, verde o azul. Amarillo se mantiene como color de apoyo.

La selección solo afecta al juego Stroop: tanto la práctica de 10 ensayos como la evaluación real respetan la gama excluida. El color excluido no aparece como palabra, tinta ni opción de respuesta.

Este modo no modifica el scoring ni el contrato de eventos enviado al backend. Los eventos de Stroop siguen usando `game_type`, `event_type`, `timestamp_us`, `reaction_time_ms`, `is_correct` y `stimulus_type`.

## Dashboard Docente

La ruta `/dashboard` muestra el dashboard docente. Requiere estar autenticado y consumir endpoints protegidos por JWT de instructor en el backend. Si el usuario autenticado no tiene permisos, el backend devuelve `403` y el frontend muestra un mensaje claro.

Endpoints usados:

- `GET /dashboard/context/{ctx_id}`
- `POST /dashboard/grant-manual`

Ejemplo de `context_id`: `exam_test_01`.

El dashboard permite ver usuario, email, contexto, última sesión, intento, score, decisión, métrica débil, recomendación, espera y estado de grant manual. La seguridad real la aplica el backend.

## Decisiones Posibles

- `ACCESO`: el usuario puede continuar.
- `ESPERA`: el usuario debe esperar antes de reintentar la evaluación.
- `BLOQUEO`: el usuario no puede continuar y debe contactar con el docente.

## Scoring

El frontend no calcula puntuaciones ni decisiones. Los eventos generados por los juegos reales se envían al backend, y el backend devuelve:

- `score`
- `decision`
- `weakest_metric`
- `recommendation_key`

## Integración LMS/Moodle

No hay integración real con LMS/Moodle en esta versión. Queda como trabajo futuro.
