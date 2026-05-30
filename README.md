# PFG

Repositorio principal del Proyecto Fin de Grado.

Este repositorio contiene los proyectos de backend y frontend en una unica estructura para facilitar su consulta, clonacion y presentacion.

## Estructura

- `pfg-backend`: backend FastAPI.
- `pfg-frontend`: carpeta reservada para el frontend.

## Clonar

```bash
git clone https://github.com/AlexisSamas/pfg.git
```

## Backend

```bash
cd pfg-backend
python -m venv venv
pip install -r requirements.txt
uvicorn app.main:app --reload
```
