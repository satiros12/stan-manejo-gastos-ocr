# 🎮 TV Launcher

**App nativa para Windows** que convierte tu portátil conectado a la TV en un centro de entretenimiento controlado por mando.

## 🎯 Cómo funciona

```
Portátil → HDMI → TV
   └── TV Launcher.exe (pantalla completa)
        └── Mando Xbox/PS → D-pad navega + A abre
```

## 📦 Instalación (usuario final)

1. Descarga `TV_Launcher_Setup_1.0.0.exe` de la sección Releases
2. Ejecuta el instalador
3. Conecta el mando por USB/Bluetooth
4. Abre TV Launcher desde el menú inicio

Sin configuración, sin cuentas, sin navegador.

## 🛠️ Compilar desde código

Necesitas Windows con Python 3.10+ y [Inno Setup](https://jrsoftware.org/isdl.php):

```batch
git clone https://github.com/satiros12/stan-manejo-gastos-ocr.git
cd tv-launcher
build.bat
```

Esto genera:
- `dist/TV Launcher.exe` — ejecutable portable
- `installer/TV_Launcher_Setup_1.0.0.exe` — instalador

## 🎮 Controles

| Mando | Teclado | Acción |
|---|---|---|
| D-pad / Stick | ← → ↑ ↓ | Navegar entre apps |
| **A** | Enter | Abrir servicio |
| **B** | Backspace | Volver |
| **START** | ESC | Salir (confirmación) |

## 📺 Servicios incluidos

| Servicio | Icono | Cómo abre |
|---|---|---|
| Netflix | 🎬 | Navegador predeterminado |
| HBO Max | 🟣 | Navegador predeterminado |
| Disney+ | ✨ | Navegador predeterminado |
| Prime Video | 🎥 | Navegador predeterminado |
| YouTube | ▶️ | Navegador predeterminado |
| Twitch | 📺 | Navegador predeterminado |
| Spotify | 🎵 | Navegador predeterminado |
| Steam | 🎮 | Protocolo `steam://` → app nativa |
| Plex | 📀 | Navegador predeterminado |

## ⚙️ Configuración

Edita `apps.json` para añadir, quitar o modificar servicios:

```json
{
  "id": "mi-app",
  "name": "Mi App",
  "icon": "⭐",
  "color": "#FF6600",
  "type": "url",
  "url": "https://miapp.com",
  "desc": "Descripción"
}
```

## 🖥️ Requisitos

- Windows 10/11
- 50MB espacio en disco
- Mando Xbox One/Series X|S, PlayStation 4/5, o cualquier mando compatible con Windows

## 🏗️ Tecnología

- Python 3.11 + Pygame
- PyInstaller (empaquetado)
- Inno Setup (instalador)
