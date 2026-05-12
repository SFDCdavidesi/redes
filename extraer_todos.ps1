param(
    [string]$PythonBin = "",
    [string]$ExamsDir = "web/examenes",
    [string]$OutDir = "web/datasets"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$extractor = Join-Path $root "extractor/extraer_test_pdf.py"
$requirements = Join-Path $root "extractor/requirements.txt"
$examsPath = Join-Path $root $ExamsDir
$outPath = Join-Path $root $OutDir

if (-not (Test-Path $extractor)) {
    throw "No se encontro extractor: $extractor"
}

if (-not (Test-Path $examsPath)) {
    throw "No se encontro carpeta de examenes: $examsPath"
}

if ([string]::IsNullOrWhiteSpace($PythonBin)) {
    $candidates = @(
        (Join-Path $root ".venv/Scripts/python.exe"),
        (Join-Path (Split-Path -Parent $root) ".venv/Scripts/python.exe"),
        "python"
    )

    foreach ($candidate in $candidates) {
        try {
            if ($candidate -like "*python.exe" -and -not (Test-Path $candidate)) {
                continue
            }
            & $candidate -c "import sys; print(sys.executable)" *> $null
            if ($LASTEXITCODE -eq 0) {
                $PythonBin = $candidate
                break
            }
        } catch {
            continue
        }
    }
}

if ([string]::IsNullOrWhiteSpace($PythonBin)) {
    throw "No se encontro un Python valido. Pasa -PythonBin explícitamente."
}

Write-Host "[INFO] Usando Python: $PythonBin"

# Instala dependencias si faltan.
& $PythonBin -c "import pdfplumber" *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[INFO] Falta pdfplumber. Instalando requisitos..."
    if (Test-Path $requirements) {
        & $PythonBin -m pip install -r $requirements
    } else {
        & $PythonBin -m pip install pdfplumber
    }
}

New-Item -ItemType Directory -Path $outPath -Force | Out-Null

$pdfs = Get-ChildItem -Path $examsPath -File -Filter *.pdf | Sort-Object Name
if ($pdfs.Count -eq 0) {
    Write-Host "[INFO] No se encontraron PDFs en $examsPath"
    exit 0
}

$total = 0
$ok = 0

foreach ($pdf in $pdfs) {
    $total++
    Write-Host "[RUN] $($pdf.FullName)"
    & $PythonBin $extractor $pdf.FullName -o $outPath
    if ($LASTEXITCODE -eq 0) {
        $ok++
    } else {
        Write-Host "[WARN] Fallo procesando: $($pdf.FullName)"
    }
}

Write-Host "[DONE] Procesados: $ok/$total"
