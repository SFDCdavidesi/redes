#!/usr/bin/env python3
"""Extrae preguntas tipo test desde uno o varios PDF y genera JSON.

Uso:
  python extraer_test_pdf.py "C:\\ruta\\examen.pdf"
  python extraer_test_pdf.py "a.pdf" "b.pdf" -o repaso-ingles-web/datasets
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pdfplumber


DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "web" / "datasets"



# Adaptar patrones para formato "Pregunta N" y opciones "a)", "b)", ...
QUESTION_PATTERNS = [
    re.compile(r"^\s*Pregunta\s+(\d{1,4})\s*$", re.IGNORECASE),  # "Pregunta 1"
    re.compile(r"^\s*(?:pregunta\s+)?(\d{1,4})\s*[\)\].:\-]+\s*(.+)$", re.IGNORECASE),
    re.compile(r"^\s*(\d{1,4})\s*[-]\s*(.+)$"),
]

OPTION_PATTERNS = [
    re.compile(r"^\s*([a-hA-H])\)\s*(.+)$"),  # "a) texto"
    re.compile(r"^\s*[\(\[]?([A-Ha-h]|[1-8])[\)\].:\-]+\s*(.+)$"),
    re.compile(r"^\s*([A-Ha-h])\s+[\-]\s*(.+)$"),
]

ANSWER_KEY_TOKEN_RE = re.compile(r"(\d{1,4})\s*[\)\.:\-]?\s*([A-Ha-h]|[1-8])\b")
ANSWER_KEY_ONLY_LINE_RE = re.compile(
    r"^\s*(?:\d{1,4}\s*[\)\.:\-]?\s*(?:[A-Ha-h]|[1-8])\s*[;,\s]*){2,}\s*$"
)
ANSWER_KEY_HEADER_RE = re.compile(
    r"\b(respuestas?|soluciones?|answer\s*key|clave\s*de\s*respuestas?)\b",
    re.IGNORECASE,
)
CORRECT_HINT_RE = re.compile(
    r"\b(correcta?|verdader[oa]|ok|x|✔|true|right)\b",
    re.IGNORECASE,
)

NOISE_LINE_RE = re.compile(
    r"^(pagina\s+\d+|page\s+\d+|tema\s+\d+(?:\.\d+)?|unidad\s+\d+|\d+\s*/\s*\d+)$",
    re.IGNORECASE,
)


def normalize_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def looks_like_answer_key_line(line: str) -> bool:
    line = line.strip()
    if not line:
        return False
    if ANSWER_KEY_HEADER_RE.search(line):
        return True
    # Evita falsos positivos en preguntas con numeros tecnicos (p.ej. TIA-568).
    return bool(ANSWER_KEY_ONLY_LINE_RE.match(line))



# Modificar para soportar "Pregunta N" en una línea y el enunciado en la siguiente
def match_question_line(line: str) -> Optional[Tuple[int, str]]:
    for pattern in QUESTION_PATTERNS:
        m = pattern.match(line)
        if not m:
            continue
        number = int(m.group(1))
        # Si el patrón solo captura el número ("Pregunta N"), el texto va en la siguiente línea
        if m.lastindex == 1:
            return number, None
        text = normalize_spaces(m.group(2))
        if text:
            return number, text
    return None


def match_option_line(line: str) -> Optional[Tuple[str, str]]:
    for pattern in OPTION_PATTERNS:
        m = pattern.match(line)
        if not m:
            continue
        label = m.group(1)
        text = normalize_spaces(m.group(2))
        if text:
            return label, text
    return None


def clean_option_text(raw_text: str) -> Tuple[str, bool]:
    text = normalize_spaces(raw_text)
    selected = False

    # Ejemplos: "(correcta)", "[x]", "*", "✔"
    if re.search(r"\[(x|X|✔)\]", text):
        selected = True
        text = re.sub(r"\[(x|X|✔)\]", "", text)

    if re.search(r"\((correcta?|verdader[oa]|ok)\)", text, re.IGNORECASE):
        selected = True
        text = re.sub(r"\((correcta?|verdader[oa]|ok)\)", "", text, flags=re.IGNORECASE)

    if text.startswith("*"):
        selected = True
        text = text.lstrip("* ")

    if "✔" in text:
        selected = True
        text = text.replace("✔", "")

    text = normalize_spaces(text)
    return text, selected


def label_to_index(label: str) -> Optional[int]:
    label = label.strip().upper()
    if not label:
        return None
    if label.isdigit():
        idx = int(label) - 1
        return idx if idx >= 0 else None
    return ord(label) - ord("A")


@dataclass
class OptionDraft:
    label: str
    text_parts: List[str] = field(default_factory=list)
    selected_hint: bool = False

    def append(self, text: str) -> None:
        value = normalize_spaces(text)
        if value:
            self.text_parts.append(value)

    @property
    def text(self) -> str:
        return normalize_spaces(" ".join(self.text_parts))


@dataclass
class QuestionDraft:
    number: int
    page: int
    question_parts: List[str] = field(default_factory=list)
    options: List[OptionDraft] = field(default_factory=list)
    last_option: Optional[OptionDraft] = None

    def append_question(self, text: str) -> None:
        value = normalize_spaces(text)
        if value:
            self.question_parts.append(value)

    def add_option(self, label: str, text: str) -> None:
        clean_text, selected_hint = clean_option_text(text)
        option = OptionDraft(label=label, selected_hint=selected_hint)
        option.append(clean_text)
        self.options.append(option)
        self.last_option = option

    @property
    def question(self) -> str:
        return normalize_spaces(" ".join(self.question_parts))


def parse_answer_key_from_text(full_text: str) -> Dict[int, str]:
    key_map: Dict[int, str] = {}
    lines = full_text.splitlines()
    in_answer_key_block = False
    for line in lines:
        clean = normalize_spaces(line)
        if not clean:
            if in_answer_key_block:
                in_answer_key_block = False
            continue

        if ANSWER_KEY_HEADER_RE.search(clean):
            in_answer_key_block = True
            continue

        if in_answer_key_block or looks_like_answer_key_line(clean):
            for num_str, label in ANSWER_KEY_TOKEN_RE.findall(clean):
                key_map[int(num_str)] = label.upper()

    return key_map


def finalize_question(
    draft: Optional[QuestionDraft],
    output: List[dict],
    answer_key: Dict[int, str],
    warnings: List[str],
) -> None:
    if draft is None:
        return
    if not draft.question or len(draft.options) < 2:
        return

    answers = []
    selected_count = 0

    key_label = answer_key.get(draft.number)
    key_idx = label_to_index(key_label) if key_label else None

    for idx, opt in enumerate(draft.options):
        text = opt.text
        if not text:
            continue

        selected = opt.selected_hint
        if key_idx is not None:
            selected = idx == key_idx

        if selected:
            selected_count += 1

        answers.append({"text": text, "selected": selected})

    if len(answers) < 2:
        return

    if selected_count != 1:
        warnings.append(
            f"Pregunta {draft.number} (pagina {draft.page}): se detectaron {selected_count} respuestas correctas."
        )

    output.append(
        {
            "page": draft.page,
            "questionNumber": draft.number,
            "question": draft.question,
            "answers": answers,
        }
    )


def parse_pdf_questions(pdf_path: Path) -> dict:
    pages_text: List[str] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            pages_text.append(page.extract_text() or "")

    full_text = "\n".join(pages_text)
    answer_key = parse_answer_key_from_text(full_text)

    warnings: List[str] = []
    items: List[dict] = []

    current: Optional[QuestionDraft] = None
    empty_pages = 0


    for page_index, page_text in enumerate(pages_text, start=1):
        if not normalize_spaces(page_text):
            empty_pages += 1
        lines = [normalize_spaces(line) for line in page_text.splitlines()]

        prev_question_pending = False
        pending_question_number = None

        for idx, line in enumerate(lines):
            if not line:
                continue

            if NOISE_LINE_RE.match(line):
                continue

            if looks_like_answer_key_line(line):
                continue

            q_data = match_question_line(line)
            if q_data:
                finalize_question(current, items, answer_key, warnings)
                number, q_text = q_data
                if q_text is None:
                    # "Pregunta N" en una línea, enunciado en la siguiente
                    prev_question_pending = True
                    pending_question_number = number
                    continue
                current = QuestionDraft(number=number, page=page_index)
                current.append_question(q_text)
                prev_question_pending = False
                pending_question_number = None
                continue

            if prev_question_pending and pending_question_number is not None:
                # La línea actual es el enunciado de la pregunta
                current = QuestionDraft(number=pending_question_number, page=page_index)
                current.append_question(line)
                prev_question_pending = False
                pending_question_number = None
                continue

            o_data = match_option_line(line)
            if o_data and current is not None:
                label, opt_text = o_data
                current.add_option(label, opt_text)
                continue

            if current is None:
                continue

            # Continuacion de texto para opcion o para enunciado.
            if current.last_option is not None:
                if CORRECT_HINT_RE.search(line):
                    current.last_option.selected_hint = True
                current.last_option.append(line)
            else:
                current.append_question(line)

    finalize_question(current, items, answer_key, warnings)

    if empty_pages:
        warnings.append(
            f"Se detectaron {empty_pages} pagina(s) sin texto extraible. Si el PDF es escaneado, usa OCR antes de extraer."
        )

    return {
        "sourcePdf": str(pdf_path),
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "totalQuestions": len(items),
        "items": items,
        "warnings": warnings,
    }


def make_output_path(pdf_path: Path, output_dir: Path) -> Path:
    safe_name = re.sub(r"[^a-zA-Z0-9._-]+", "_", pdf_path.stem).strip("_")
    if not safe_name:
        safe_name = "examen"
    return output_dir / f"{safe_name}.json"


def normalize_pdf_args(raw_pdfs: List[str]) -> List[str]:
    """Recupera el caso comun de una sola ruta con espacios sin comillas.

        Ejemplo roto en shell:
            python extraer_test_pdf.py C:\\ruta\\Examen Tipo Test.pdf
    Se recibe como varios argumentos; intentamos recomponerlos en uno.
    """
    if len(raw_pdfs) <= 1:
        return raw_pdfs

    if any(Path(p).exists() for p in raw_pdfs):
        return raw_pdfs

    joined = " ".join(raw_pdfs).strip()
    if joined and Path(joined).exists():
        print("[INFO] Ruta con espacios detectada sin comillas; se recompuso automaticamente.")
        return [joined]

    return raw_pdfs


def run() -> int:
    parser = argparse.ArgumentParser(
        description="Extrae preguntas y respuestas de PDFs tipo test y genera JSON."
    )
    parser.add_argument(
        "pdfs",
        nargs="+",
        help="Uno o varios PDFs de entrada.",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Carpeta de salida para los JSON (por defecto: <repo>/web/datasets).",
    )

    args = parser.parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    normalized_pdfs = normalize_pdf_args(args.pdfs)

    generated = 0
    for raw_pdf in normalized_pdfs:
        pdf_path = Path(raw_pdf)
        if not pdf_path.exists() or not pdf_path.is_file():
            print(f"[ERROR] No existe el archivo: {pdf_path}")
            continue

        try:
            payload = parse_pdf_questions(pdf_path)
            out_path = make_output_path(pdf_path, output_dir)
            out_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            generated += 1
            print(
                f"[OK] {pdf_path.name} -> {out_path} | preguntas={payload['totalQuestions']} | warnings={len(payload['warnings'])}"
            )
        except Exception as exc:  # noqa: BLE001
            print(f"[ERROR] Fallo procesando {pdf_path}: {exc}")

    if generated == 0:
        if len(args.pdfs) > 1 and len(normalized_pdfs) == len(args.pdfs):
            print("Sugerencia: si una ruta tiene espacios, envuelvela entre comillas.")
        print("No se generaron JSON.")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(run())
