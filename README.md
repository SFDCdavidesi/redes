# Redes Study Kit

Proyecto completo para preparar examenes tipo test con dos bloques:

- `extractor/`: script Python para extraer preguntas/respuestas desde PDF y generar JSON.
- `web/`: app web dinamica y responsive para estudiar con 1..n JSON, modo simulacro, nota oficial y guardado de progreso.

## Estructura

- `extractor/extraer_test_pdf.py`
- `extractor/requirements.txt`
- `web/index.html`
- `web/js/script.js`
- `web/css/styles.css`
- `web/datasets/`

## 1) Extraer preguntas desde PDF

Desde la raiz del repo:

```bash
python -m pip install -r extractor/requirements.txt
python extractor/extraer_test_pdf.py "C:\\ruta\\examen.pdf" -o web/datasets
```

## 2) Ejecutar web en local

```bash
cd web
python -m http.server 8000
```

Abrir:

`http://localhost:8000`

## 3) Despliegue en Vercel

- Root Directory recomendado: `web`
- Es un sitio estatico, sin build complejo.