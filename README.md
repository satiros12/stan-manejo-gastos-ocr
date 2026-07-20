# 🎮 TV Launcher — App nativa Windows

**Un solo `.exe`.** Arrancas el portátil conectado a la TV, abres TV Launcher y controlas todo con el mando.

## 📥 Descarga

Ve a **Releases** y descarga `TV Launcher.exe` — funciona directo, no necesita instalación.

O si prefieres compilarlo tú mismo, sigue los pasos abajo.

## 🎮 Controles

| Mando Xbox/PS | Teclado | Acción |
|---|---|---|
| Stick izquierdo / D-Pad | ← → ↑ ↓ | Navegar entre apps |
| **A** (cara inferior) | Enter | Abrir servicio |
| **B** (cara derecha) | — | Volver |
| **START** | ESC | Salir (con confirmación) |

## 📺 Servicios

Netflix · HBO Max · Disney+ · Prime Video · YouTube · Twitch · Spotify · Steam · Plex

## 🔧 Compilar tú mismo

Necesitas **Go 1.23+** y **MinGW-w64** en Linux, o solo Go en Windows:

```bash
# Linux → Windows cross-compile
CGO_ENABLED=1 GOOS=windows GOARCH=amd64 CC=x86_64-w64-mingw32-gcc \
  go build -o "TV Launcher.exe" -ldflags="-H windowsgui -s -w" .

# O en Windows directamente
go build -o "TV Launcher.exe" -ldflags="-H windowsgui -s -w" .
```

## 🏗️ Stack

```
Go 1.23 + Ebitengine v2.9 → .exe nativo (PE64, sin dependencias)
├── Rendering: DirectX (Windows)
├── Gamepad: XInput / DirectInput
└── Launch: cmd /c start (Windows nativo)
```
