# Campus Test Studio

Web estatica para estudiar preguntas tipo test desde 1..n JSON. Esta preparada para desplegarse en Vercel y adaptarse a movil/desktop.

## Flujo completo

1) Extraes preguntas desde PDF con el script Python.
2) Obtienes uno o varios JSON.
3) Abres esta web y cargas los JSON.

## 1. Extraer PDF a JSON

Script en la raiz del workspace:

extraer_test_pdf.py

Instalacion de dependencias:

```bash
pip install -r requirements.txt
```

Ejemplos:

```bash
python extraer_test_pdf.py "C:\\Users\\david\\Downloads\\Examen Tipo Test_tema 1.2 (1).pdf"
python extraer_test_pdf.py "C:\\ruta\\examen1.pdf" "C:\\ruta\\examen2.pdf" -o repaso-ingles-web/datasets
```

Salida JSON por cada PDF (por defecto en repaso-ingles-web/datasets):

```json
{
	"sourcePdf": "...",
	"exportedAt": "...",
	"totalQuestions": 120,
	"items": [
		{
			"page": 1,
			"questionNumber": 1,
			"question": "...",
			"answers": [
				{ "text": "...", "selected": true },
				{ "text": "...", "selected": false }
			]
		}
	],
	"warnings": []
}
```

## 2. Ejecutar la web en local

Desde esta carpeta:

```bash
npm run dev
```

Abre:

http://localhost:8000

Puedes cargar uno o varios JSON usando el boton Cargar 1..n JSON.

## Funciones de estudio incluidas

- Carga 1..n JSON y mezcla preguntas entre bancos.
- Selector por banco o modo "Todos".
- Modo simulacro con:
	- tiempo en minutos,
	- formula de nota configurable: `+puntos_acierto` y `-penalizacion_fallo`,
	- cierre automatico al agotar tiempo.
- Guardar progreso en JSON y cargarlo despues para continuar.

## 3. Despliegue en Vercel

Opciones:

1. Importar este repositorio en Vercel y usar como Root Directory: repaso-ingles-web
2. O desplegar por CLI desde esta carpeta:

```bash
npx vercel
```

No necesita build complejo, es sitio estatico.
