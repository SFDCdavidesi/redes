#!/usr/bin/env bash
set -euo pipefail

# Ejecuta el extractor para todos los PDF de web/examenes.
# Uso:
#   bash extraer_todos.sh
# Opcional:
#   PYTHON_BIN=python3 bash extraer_todos.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(cd "${ROOT_DIR}/.." && pwd)"
EXAMS_DIR="${ROOT_DIR}/web/examenes"
OUT_DIR="${ROOT_DIR}/web/datasets"
EXTRACTOR="${ROOT_DIR}/extractor/extraer_test_pdf.py"
REQUIREMENTS_FILE="${ROOT_DIR}/extractor/requirements.txt"

if [[ -n "${PYTHON_BIN:-}" ]]; then
  :
elif [[ -f "${ROOT_DIR}/.venv/Scripts/python.exe" ]]; then
  PYTHON_BIN="${ROOT_DIR}/.venv/Scripts/python.exe"
elif [[ -f "${ROOT_DIR}/.venv/bin/python" ]]; then
  PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
elif [[ -f "${PARENT_DIR}/.venv/Scripts/python.exe" ]]; then
  PYTHON_BIN="${PARENT_DIR}/.venv/Scripts/python.exe"
elif [[ -f "${PARENT_DIR}/.venv/bin/python" ]]; then
  PYTHON_BIN="${PARENT_DIR}/.venv/bin/python"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
else
  echo "[ERROR] No se encontro Python."
  echo "        Define PYTHON_BIN o crea un .venv en la raiz del repo."
  exit 1
fi

if [[ ! -f "${EXTRACTOR}" ]]; then
  echo "[ERROR] No se encontro el extractor en: ${EXTRACTOR}"
  exit 1
fi

if [[ ! -d "${EXAMS_DIR}" ]]; then
  echo "[ERROR] No se encontro el directorio de examenes en: ${EXAMS_DIR}"
  exit 1
fi

echo "[INFO] Usando Python: ${PYTHON_BIN}"

if ! "${PYTHON_BIN}" -c "import pdfplumber" >/dev/null 2>&1; then
  echo "[INFO] Falta pdfplumber en este Python. Instalando dependencias..."
  if ! "${PYTHON_BIN}" -m pip --version >/dev/null 2>&1; then
    echo "[ERROR] El Python seleccionado no tiene pip disponible."
    echo "        Recomendado en Windows:"
    echo "        PYTHON_BIN=\"C:/Users/david/python/.venv/Scripts/python.exe\" bash ./extraer_todos.sh"
    exit 1
  fi

  if [[ -f "${REQUIREMENTS_FILE}" ]]; then
    "${PYTHON_BIN}" -m pip install -r "${REQUIREMENTS_FILE}"
  else
    "${PYTHON_BIN}" -m pip install pdfplumber
  fi
fi

mkdir -p "${OUT_DIR}"

count_total=0
count_ok=0

while IFS= read -r -d '' pdf_file; do
  count_total=$((count_total + 1))
  echo "[RUN] ${pdf_file}"
  if "${PYTHON_BIN}" "${EXTRACTOR}" "${pdf_file}" -o "${OUT_DIR}"; then
    count_ok=$((count_ok + 1))
  else
    echo "[WARN] Fallo procesando: ${pdf_file}"
  fi
done < <(find "${EXAMS_DIR}" -maxdepth 1 -type f -iname "*.pdf" -print0 | sort -z)

if [[ "${count_total}" -eq 0 ]]; then
  echo "[INFO] No se encontraron PDFs en ${EXAMS_DIR}"
  exit 0
fi

echo "[DONE] Procesados: ${count_ok}/${count_total}"
