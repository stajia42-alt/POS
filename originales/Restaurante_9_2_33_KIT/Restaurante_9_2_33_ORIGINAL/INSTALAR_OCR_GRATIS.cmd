@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
echo Instalando OCR con Python 3.11 para Restaurante 9.2...
if exist "ocr-env\Scripts\python.exe" (
 "ocr-env\Scripts\python.exe" ocr_local.py --diagnostico
 if not errorlevel 1 goto comprobar_opencv
 goto preparar
)
py -3.11 --version
if errorlevel 1 goto falta_python
py -3.11 ocr_local.py --diagnostico
if not errorlevel 1 goto comprobar_opencv
:preparar
py -3.11 --version
if errorlevel 1 goto falta_python
echo.
echo Comprobando componentes de Microsoft Visual C++ x64...
reg query "HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" /v Installed 2>nul | find "0x1" >nul
if errorlevel 1 (
 echo No se pudo confirmar Visual C++ x64.
 echo Instala o repara el redistribuible oficial si aparece un error de DLL:
 echo https://aka.ms/vs/17/release/vc_redist.x64.exe
 echo El instalador final podra incorporar este requisito automaticamente.
) else (
 echo Visual C++ x64 detectado.
)
echo.
if not exist "ocr-env\Scripts\python.exe" (
 py -3.11 -m venv ocr-env
 if errorlevel 1 goto error
)
"ocr-env\Scripts\python.exe" -m pip install "paddlepaddle>=3.0,<4" "paddleocr>=3.0,<4"
if errorlevel 1 goto error
echo Comprobando que PaddleOCR carga correctamente...
"ocr-env\Scripts\python.exe" ocr_local.py --diagnostico
if errorlevel 1 goto error
"ocr-env\Scripts\python.exe" -m pip freeze > "ocr-versiones-instaladas.txt"
if errorlevel 1 goto error
"ocr-env\Scripts\python.exe" -c "import cv2" >nul 2>nul
if errorlevel 1 "ocr-env\Scripts\python.exe" -m pip install opencv-python-headless
if errorlevel 1 goto error
echo OCR y detector de colores instalados con Python 3.11.
pause
exit /b 0

:comprobar_opencv
if exist "ocr-env\Scripts\python.exe" (
 "ocr-env\Scripts\python.exe" -c "import cv2" >nul 2>nul
 if errorlevel 1 "ocr-env\Scripts\python.exe" -m pip install opencv-python-headless
) else (
 py -3.11 -c "import cv2" >nul 2>nul
 if errorlevel 1 py -3.11 -m pip install opencv-python-headless
)
if errorlevel 1 goto error
goto listo_existente
:listo_existente
echo El OCR existente carga correctamente. No se cambiaron paquetes.
pause
exit /b 0
:falta_python
echo ERROR: No se encontro Python 3.11.
pause
exit /b 1
:error
echo ERROR: OCR no quedo listo. Revisa los mensajes anteriores.
pause
exit /b 1
