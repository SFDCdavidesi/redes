@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem Ejecuta el extractor para todos los PDF en web\examenes
rem Uso:
rem   extraer_todos.bat
rem   set PYTHON_BIN=C:\ruta\python.exe && extraer_todos.bat

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "EXAMS_DIR=%ROOT%\web\examenes"
set "OUT_DIR=%ROOT%\web\datasets"
set "EXTRACTOR=%ROOT%\extractor\extraer_test_pdf.py"
set "REQUIREMENTS=%ROOT%\extractor\requirements.txt"

if not exist "%EXTRACTOR%" (
  echo [ERROR] No se encontro el extractor: %EXTRACTOR%
  exit /b 1
)

if not exist "%EXAMS_DIR%" (
  echo [ERROR] No se encontro el directorio de examenes: %EXAMS_DIR%
  exit /b 1
)

if not defined PYTHON_BIN (
  if exist "%ROOT%\.venv\Scripts\python.exe" (
    set "PYTHON_BIN=%ROOT%\.venv\Scripts\python.exe"
  ) else if exist "%ROOT%\..\.venv\Scripts\python.exe" (
    set "PYTHON_BIN=%ROOT%\..\.venv\Scripts\python.exe"
  ) else (
    set "PYTHON_BIN=python"
  )
)

echo [INFO] Usando Python: %PYTHON_BIN%

"%PYTHON_BIN%" -c "import pdfplumber" >nul 2>&1
if errorlevel 1 (
  echo [INFO] Falta pdfplumber. Instalando dependencias...
  if exist "%REQUIREMENTS%" (
    "%PYTHON_BIN%" -m pip install -r "%REQUIREMENTS%"
  ) else (
    "%PYTHON_BIN%" -m pip install pdfplumber
  )
  if errorlevel 1 (
    echo [ERROR] No se pudieron instalar dependencias.
    echo         Prueba: set PYTHON_BIN=C:\Users\david\python\.venv\Scripts\python.exe
    exit /b 1
  )
)

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

set /a total=0
set /a ok=0

for /f "delims=" %%F in ('dir /b /a:-d "%EXAMS_DIR%\*.pdf" 2^>nul') do (
  set /a total+=1
  echo [RUN] %EXAMS_DIR%\%%F
  "%PYTHON_BIN%" "%EXTRACTOR%" "%EXAMS_DIR%\%%F" -o "%OUT_DIR%"
  if !errorlevel! equ 0 (
    set /a ok+=1
  ) else (
    echo [WARN] Fallo procesando: %EXAMS_DIR%\%%F
  )
)

if %total% equ 0 (
  echo [INFO] No se encontraron PDFs en %EXAMS_DIR%
  exit /b 0
)

echo [DONE] Procesados: %ok%/%total%
exit /b 0
