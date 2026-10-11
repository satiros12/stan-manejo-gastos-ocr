# API de agente — Gestión en Pareja (facturas-ocr)

API REST para que un agente (asistente IA, script, automatización) cargue datos y administre el estado de la app **sin navegador y sin cuenta de usuario**. Las dos cuentas de la app son para las personas; el agente entra por esta API con un token.

## Autenticación

Cabecera `Authorization: Bearer <AGENT_API_TOKEN>` o `X-Agent-Token: <token>`.

- El token vive en `.env.local` (clave `AGENT_API_TOKEN`) y en la unidad systemd.
- Copia de uso local para el asistente: `~/.hermes/secrets/facturas-ocr-agent-token`.
- Todas las respuestas son JSON. Errores: `{"error": "...", "hint": "..."}`.

## Base

- `http://localhost:3456/api/agent` (local)
- `http://148.113.46.119:3456/api/agent` (red)

## Documentación viva

`GET /api/agent` (o `/api/agent/docs`) devuelve esta misma documentación en markdown — pensada para que un agente **sin contexto** pueda descubrir la API.

## Lectura

- `GET /overview` — usuarios, contadores, mes actual, últimos movimientos.
- `GET /users` — cuentas (id, nombre, email, color).
- `GET /transactions?month=YYYY-MM&from=&to=&type=shared|private&user_id=&category_id=&q=&limit=&offset=` — lista de gastos.
- `GET /transactions/<id>` — un gasto.
- `GET /categories` — categorías (compartidas y privadas).
- `GET /invoices` — facturas OCR (resumen).
- `GET /balance` — liquidación del mes + transferencias netas.
- `GET /transfers` — transferencias entre las dos personas.
- `GET /import/<id>` — estado de una importación.

## Escritura

- `POST /transactions` — crear un gasto:
  ```json
  {"user_email": "stanislav.vakaruk@gmail.com", "type": "shared", "amount": 45.20,
   "date": "2026-10-11", "description": "Cena", "category_name": "Restaurantes", "create_category": true}
  ```
  (`user_id`, `user_email` o `user_name`; `amount` acepta número o texto español "1.234,56".)
- `POST /transactions/bulk` — `{"transactions": [ ... ]}` (mismo formato; responde `created`, `ids` y `errors`).
- `PATCH /transactions/<id>` — `{amount?, date?, description?, category_id?, type?}`.
- `DELETE /transactions/<id>`.
- `POST /categories` — `{"name": "...", "type"?: "shared|private", "icon"?, "color"?}`.
- `DELETE /categories/<id>`.
- `POST /transfers` — `{"from_user_id", "to_user_id", "amount", "date", "description"?}` (liquidaciones).

## Importación de extractos

- `POST /import` — subir un extracto bancario:
  - `multipart/form-data` con campo `file` (.xlsx, .xlsm, .csv, .txt, .pdf — máx 20 MB), o
  - JSON `{"file_path": "/ruta/absoluta"}` (el fichero se copia a `data/imports/files/`).
  - Respuesta: vista previa con `import.id` y filas normalizadas (`date`, `description`, `amount`, `category`, `include`, `note`, `duplicate`).
- `POST /import/<id>/confirm` — `{"user_id": 1, "type": "shared", "create_categories": true, "rows"?: [...]}` — inserta los movimientos confirmados. Devuelve `imported`, `ids` y `categories_created`.

Reglas del pipeline: gastos negativos (signo banco); ingresos no se importan; duplicados (fecha + importe + descripción similar) se excluyen por defecto; las categorías sugeridas por la IA se crean si `create_categories`.

## Ejemplos

```bash
T=$(cat ~/.hermes/secrets/facturas-ocr-agent-token)

# Resumen
curl -s -H "Authorization: Bearer $T" http://localhost:3456/api/agent/overview

# Apuntar un gasto
curl -s -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"user_name":"Stan","type":"shared","amount":45.20,"date":"2026-10-11","description":"Cena","category_name":"Restaurantes","create_category":true}' \
  http://localhost:3456/api/agent/transactions

# Importar un extracto y confirmarlo
curl -s -H "Authorization: Bearer $T" -F "file=@extracto.pdf" http://localhost:3456/api/agent/import
curl -s -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"user_id":1,"type":"shared","create_categories":true}' \
  http://localhost:3456/api/agent/import/<ID>/confirm
```

## Notas

- La app solo registra **gastos** (no ingresos); los abonos del banco se marcan y excluyen.
- `amount` se guarda en positivo; `type` decide el reparto (compartido 50/50 o privado).
- La web (`/app/import`) puede reabrir una vista previa creada por el agente con `?id=<import_id>` para revisarla y confirmarla desde la interfaz.
