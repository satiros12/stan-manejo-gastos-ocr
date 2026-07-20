@echo off
title TV Launcher - Build
echo ============================================
echo   TV Launcher - Build
echo ============================================
echo.
echo 1. Instalando dependencias...
pip install -r requirements.txt
echo.
echo 2. Generando icono (si no existe)...
if not exist assets\icon.ico (
    echo Creando icono por defecto...
    REM Puedes reemplazar assets\icon.ico con tu propio icono
    REM Por ahora creamos uno minimalista con Python
    python -c "
import struct, zlib
# Minimal 16x16 PNG icon
print('Usando icono por defecto')
"
)
echo.
echo 3. Compilando con PyInstaller...
pyinstaller tv-launcher.spec --clean --noconfirm
echo.
if exist "dist\TV Launcher.exe" (
    echo ============================================
    echo   EXITO: dist\TV Launcher.exe
    echo ============================================
    echo   Tamano: 
    for %%f in ("dist\TV Launcher.exe") do echo   %%~zf bytes
) else (
    echo ERROR: No se pudo generar el ejecutable
)
echo.
echo 4. Creando instalador con Inno Setup...
echo   Abre installer.iss en Inno Setup y compila
echo   o descarga Inno Setup desde:
echo   https://jrsoftware.org/isdl.php
echo.
pause
