# Gestión en Pareja 💰

App web para el control de gastos de **dos personas (dos cuentas)**, con OCR de facturas y tickets.

## Funcionalidades

- **Gastos compartidos** (50/50 por defecto) y **gastos privados** de cada persona.
- **Dashboard mensual**: gasto compartido, gastos privados, equilibrio del mes y balance total.
- **Balance y pagos**: liquidación entre las dos personas + historial de transferencias.
- **OCR de facturas**: sube una foto → Tesseract 5 + OpenCV → parser → gasto creado.
- **Categorías** compartidas o privadas (con iconos).
- **Ajustes**: nombre, contraseña.

## Modelo de cuentas

- **Máximo 2 cuentas** (tú y tu pareja). El registro se cierra automáticamente al crear la segunda.
- Cada persona entra con su email y contraseña.

## Stack

Next.js 16 · React 19 · better-sqlite3 (SQLite) · NextAuth v5 (credentials) · Tailwind CSS v4 · Tesseract 5 + OpenCV (Python, venv en `~/ocr-venv`)

## Puesta en marcha

```bash
npm install
npm run dev        # desarrollo
npm run build      # producción
npm start          # servidor de producción
```

En el servidor corre como servicio systemd **`ocr-facturas.service`** (puerto 3456).
Tras un `npm run build`, reiniciar para servir el nuevo build:

```bash
systemctl status ocr-facturas                 # estado
sudo systemctl restart ocr-facturas           # reinicio (o matar el proceso: Restart=always lo relanza)
```

## Configuración (`.env.local`)

- `OCR_VENV_PYTHON` — python del venv con Tesseract/OpenCV (`~/ocr-venv/bin/python3`)
- `AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_URL` — NextAuth v5

## Estructura

- `app/app/*` — páginas (dashboard, gastos, categorías, OCR, ajustes, balance)
- `app/api/*` — API (data, dashboard, ocr, upload, files, user, register, auth)
- `lib/db.ts` — SQLite (usuarios, transacciones, transferencias, facturas)
- `lib/ocr.py` + `lib/parse.py` — pipeline OCR (Python)
- `data/invoices.db` — base de datos (ignorada por git)
- `uploads/` — imágenes subidas (ignorada por git)

## Repo

`git@github.com:satiros12/stan-manejo-gastos-ocr.git`
