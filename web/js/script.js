const DATASET_INDEX_PATH = "datasets/index.json";
const DATASET_API_PATH = "/api/datasets";
const BROWSER_PROGRESS_KEY = "campus-test-progress-v1";

const state = {
  banks: [],
  activeBankId: "all",
  questions: [],
  answers: [],
  currentIndex: 0,
  startedAt: 0,
  shuffle: false,
  examMode: false,
  examLocked: false,
  durationSec: 0,
  examEndsAt: 0,
  pointsCorrect: 1,
  penaltyWrong: 0.33,
  answerOrderByQuestionId: {},
  timerId: null,
  mobileControlsExpanded: false
};

const mobileQuery = window.matchMedia("(max-width: 900px), (hover: none) and (pointer: coarse)");

const el = {
  statusLine: document.getElementById("statusLine"),
  mobileControlsToggle: document.getElementById("mobileControlsToggle"),
  filesInput: document.getElementById("jsonFilesInput"),
  loadProgressInput: document.getElementById("loadProgressInput"),
  saveProgressBtn: document.getElementById("saveProgressBtn"),
  exportPdfBtn: document.getElementById("exportPdfBtn"),
  exportExcelBtn: document.getElementById("exportExcelBtn"),
  saveBrowserProgressBtn: document.getElementById("saveBrowserProgressBtn"),
  loadBrowserProgressBtn: document.getElementById("loadBrowserProgressBtn"),
  clearBrowserProgressBtn: document.getElementById("clearBrowserProgressBtn"),
  serverDatasetSelect: document.getElementById("serverDatasetSelect"),
  loadServerDatasetBtn: document.getElementById("loadServerDatasetBtn"),
  refreshServerDatasetsBtn: document.getElementById("refreshServerDatasetsBtn"),
  resetBtn: document.getElementById("resetBtn"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  shuffleBtn: document.getElementById("shuffleBtn"),
  simMinutes: document.getElementById("simMinutes"),
  scoreOk: document.getElementById("scoreOk"),
  scoreFail: document.getElementById("scoreFail"),
  presetOfficialBtn: document.getElementById("presetOfficialBtn"),
  startSimBtn: document.getElementById("startSimBtn"),
  timerChip: document.getElementById("timerChip"),
  datasetTabs: document.getElementById("datasetTabs"),
  metricAnswered: document.getElementById("metricAnswered"),
  metricCorrect: document.getElementById("metricCorrect"),
  metricWrong: document.getElementById("metricWrong"),
  metricPercent: document.getElementById("metricPercent"),
  metricOfficial: document.getElementById("metricOfficial"),
  quizPanel: document.getElementById("quizPanel"),
  questionCounter: document.getElementById("questionCounter"),
  questionPage: document.getElementById("questionPage"),
  questionSource: document.getElementById("questionSource"),
  progressLabel: document.getElementById("progressLabel"),
  progressBar: document.getElementById("progressBar"),
  questionText: document.getElementById("questionText"),
  optionsBox: document.getElementById("optionsBox"),
  feedbackBox: document.getElementById("feedbackBox"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  summaryPanel: document.getElementById("summaryPanel"),
  summaryText: document.getElementById("summaryText"),
  navigator: document.getElementById("navigator"),
  navigatorToggle: document.getElementById("navigatorToggle"),
  closeNavigator: document.getElementById("closeNavigator"),
  navigatorGrid: document.getElementById("navigatorGrid")
};

function updateMobileQuizLayout() {
  const mobileQuizActive = mobileQuery.matches && !el.quizPanel.hidden && state.questions.length > 0;

  el.quizPanel.classList.toggle("mobile-docked", mobileQuizActive);
  document.body.classList.toggle("quiz-mobile-active", mobileQuizActive);

  if (mobileQuizActive) {
    el.prevBtn.textContent = "◀ Ant";
    el.nextBtn.textContent = "Sig ▶";
    el.prevBtn.classList.add("mobile-icon-btn");
    el.nextBtn.classList.add("mobile-icon-btn");
  } else {
    el.prevBtn.textContent = "Anterior";
    el.nextBtn.textContent = "Siguiente";
    el.prevBtn.classList.remove("mobile-icon-btn");
    el.nextBtn.classList.remove("mobile-icon-btn");
  }

  el.prevBtn.setAttribute("aria-label", "Pregunta anterior");
  el.nextBtn.setAttribute("aria-label", "Pregunta siguiente");
}

function updateMobileControlsState() {
  const hero = document.querySelector(".hero");
  if (!hero || !el.mobileControlsToggle) return;

  const isMobile = mobileQuery.matches;
  const shouldCollapse = isMobile && !state.mobileControlsExpanded;
  hero.classList.toggle("mobile-collapsed", shouldCollapse);

  if (!isMobile) {
    el.mobileControlsToggle.setAttribute("aria-expanded", "true");
    el.mobileControlsToggle.textContent = "Mostrar controles";
    return;
  }

  el.mobileControlsToggle.setAttribute("aria-expanded", String(!shouldCollapse));
  el.mobileControlsToggle.textContent = shouldCollapse ? "Mostrar controles" : "Ocultar controles";
}

function updateNavigatorUi() {
  const isOpen = !el.navigator.hidden;
  el.navigator.classList.toggle("mobile-open", isOpen && mobileQuery.matches);
  el.navigatorToggle.setAttribute("aria-expanded", String(isOpen));
  el.navigatorToggle.textContent = isOpen ? "Ocultar navegador" : "Ver navegador";
}

function openNavigator() {
  el.navigator.hidden = false;
  updateNavigatorUi();
}

function closeNavigator() {
  el.navigator.hidden = true;
  updateNavigatorUi();
}

function toggleNavigator() {
  if (el.navigator.hidden) {
    openNavigator();
    return;
  }
  closeNavigator();
}

function isSelectedValue(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function getCorrectIndex(question) {
  if (!question || !Array.isArray(question.answers)) return -1;
  return question.answers.findIndex((answer) => Boolean(answer.selected));
}

function parseQuestion(raw, index, sourceName) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const question = String(raw.question || raw.qtext || raw.text || "").trim();
  const page = Number.isInteger(Number(raw.page)) ? Number(raw.page) : index + 1;
  const answersRaw = Array.isArray(raw.answers) ? raw.answers : [];
  const answers = answersRaw
    .map((answer) => {
      if (typeof answer === "string") {
        return { text: answer.trim(), selected: false };
      }
      return {
        text: String(answer.text || answer.answer || "").trim(),
        selected: isSelectedValue(answer.selected)
      };
    })
    .filter((answer) => answer.text.length > 0);

  if (!question || answers.length < 2) {
    return null;
  }

  return {
    id: `${sourceName}_${index}`,
    page,
    question,
    answers,
    source: sourceName
  };
}

function normalizeJson(payload, sourceName) {
  const base = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload)
      ? payload
      : [];

  return base
    .map((item, index) => parseQuestion(item, index, sourceName))
    .filter((item) => item !== null);
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getAnswerOrder(question) {
  if (!question || !Array.isArray(question.answers)) return [];

  const answerCount = question.answers.length;
  const cached = state.answerOrderByQuestionId[question.id];
  if (Array.isArray(cached) && cached.length === answerCount) {
    return cached;
  }

  const order = shuffleArray(Array.from({ length: answerCount }, (_, index) => index));
  state.answerOrderByQuestionId[question.id] = order;
  return order;
}

function getShuffledAnswers(question) {
  const order = getAnswerOrder(question);
  return order.map((originalIndex) => ({
    originalIndex,
    answer: question.answers[originalIndex]
  }));
}

function recomputeQuestions() {
  stopTimer();
  const selectedBanks = state.activeBankId === "all"
    ? state.banks
    : state.banks.filter((bank) => bank.id === state.activeBankId);

  let questions = selectedBanks.flatMap((bank) => bank.questions);
  if (state.shuffle) {
    questions = shuffleArray(questions);
  }

  state.questions = questions;
  state.answers = questions.map(() => null);
  state.currentIndex = 0;
  state.startedAt = Date.now();
  state.examLocked = false;
  if (state.examMode) {
    state.examMode = false;
    state.durationSec = 0;
    state.examEndsAt = 0;
    el.timerChip.textContent = "Sin simulacro";
    el.timerChip.className = "timer-chip";
  }
  renderAll();
}

function getStats() {
  const total = state.questions.length;
  let answered = 0;
  let correct = 0;

  state.answers.forEach((answerIndex, index) => {
    if (answerIndex === null || answerIndex === undefined) return;
    answered += 1;
    const cIdx = getCorrectIndex(state.questions[index]);
    if (cIdx >= 0 && cIdx === answerIndex) correct += 1;
  });

  const wrong = answered - correct;
  const percent = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  return { total, answered, correct, wrong, percent };
}

function computeOfficialScore(stats) {
  const maxRaw = stats.total * state.pointsCorrect;
  if (maxRaw <= 0) {
    return { raw: 0, grade10: 0 };
  }

  const raw = (stats.correct * state.pointsCorrect) - (stats.wrong * state.penaltyWrong);
  const grade10 = Math.max(0, Math.min(10, (raw / maxRaw) * 10));
  return { raw, grade10 };
}

function formatRemaining(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function stopTimer() {
  if (state.timerId !== null) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function buildProgressPayload() {
  return {
    kind: "campus-test-progress",
    version: 1,
    savedAt: new Date().toISOString(),
    state: {
      banks: state.banks,
      activeBankId: state.activeBankId,
      questions: state.questions,
      answers: state.answers,
      currentIndex: state.currentIndex,
      startedAt: state.startedAt,
      shuffle: state.shuffle,
      examMode: state.examMode,
      examLocked: state.examLocked,
      durationSec: state.durationSec,
      remainingSec: state.examMode && state.examEndsAt ? Math.max(0, Math.round((state.examEndsAt - Date.now()) / 1000)) : 0,
      pointsCorrect: state.pointsCorrect,
      penaltyWrong: state.penaltyWrong,
      answerOrderByQuestionId: state.answerOrderByQuestionId
    }
  };
}

function buildGoogleSearchUrl(questionText, correctText) {
  const query = `${questionText} ${correctText}`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getBanksToExport() {
  const banksToExport = Array.isArray(state.banks) && state.banks.length
    ? state.banks.filter((bank) => Array.isArray(bank.questions) && bank.questions.length > 0)
    : [];

  if (banksToExport.length > 0) {
    return banksToExport;
  }

  if (state.questions.length > 0) {
    return [{ name: "Seleccion actual", questions: state.questions }];
  }

  return [];
}

function buildUniqueSheetName(baseName, usedNames) {
  const normalized = String(baseName || "Bateria")
    .replace(/[\\/?*\[\]:]/g, " ")
    .trim() || "Bateria";
  const maxLen = 31;

  let candidate = normalized.slice(0, maxLen);
  let suffix = 2;

  while (usedNames.has(candidate)) {
    const tail = ` (${suffix})`;
    candidate = normalized.slice(0, Math.max(1, maxLen - tail.length)) + tail;
    suffix += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function exportQuestionsToExcel() {
  const banksToExport = getBanksToExport();
  if (!banksToExport.length) {
    el.statusLine.textContent = "No hay preguntas cargadas para exportar.";
    return;
  }

  const xlsx = window.XLSX;
  if (!xlsx || !xlsx.utils) {
    el.statusLine.textContent = "No se pudo cargar el motor Excel (SheetJS). Recarga la pagina e intentalo de nuevo.";
    return;
  }

  const workbook = xlsx.utils.book_new();
  const usedSheetNames = new Set();

  banksToExport.forEach((bank, bankIndex) => {
    const rows = [];
    rows.push([`Bateria ${bankIndex + 1}`, bank.name]);
    rows.push(["Preguntas", bank.questions.length]);
    rows.push([]);
    rows.push(["Numero", "Pregunta", "A", "B", "C", "D", "E", "F"]);

    bank.questions.forEach((question, qIndex) => {
      const optionTexts = getShuffledAnswers(question).map(({ answer }) => String(answer.text || ""));
      rows.push([
        qIndex + 1,
        String(question.question || ""),
        optionTexts[0] || "",
        optionTexts[1] || "",
        optionTexts[2] || "",
        optionTexts[3] || "",
        optionTexts[4] || "",
        optionTexts[5] || ""
      ]);
    });

    rows.push([]);
    rows.push(["Respuestas correctas"]);
    rows.push(["Numero", "Letra", "Respuesta"]);

    bank.questions.forEach((question, qIndex) => {
      const correctIdx = getCorrectIndex(question);
      const shuffledAnswers = getShuffledAnswers(question);
      const correctDisplayIndex = shuffledAnswers.findIndex((item) => item.originalIndex === correctIdx);
      const correctLetter = correctDisplayIndex >= 0 ? String.fromCharCode(65 + correctDisplayIndex) : "-";
      const correctText = correctIdx >= 0 && question.answers?.[correctIdx]
        ? question.answers[correctIdx].text
        : "No definida";
      rows.push([qIndex + 1, correctLetter, correctText]);
    });

    const sheet = xlsx.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [
      { wch: 10 },
      { wch: 60 },
      { wch: 30 },
      { wch: 30 },
      { wch: 30 },
      { wch: 30 },
      { wch: 30 },
      { wch: 30 }
    ];

    const sheetName = buildUniqueSheetName(bank.name || `Bateria ${bankIndex + 1}`, usedSheetNames);
    xlsx.utils.book_append_sheet(workbook, sheet, sheetName);
  });

  const timestamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
  xlsx.writeFile(workbook, `test_${timestamp}.xlsx`);
  el.statusLine.textContent = `Excel exportado correctamente (${banksToExport.length} bateria(s)).`;
}

function buildPrintableHtml() {
  const createdAt = new Date().toLocaleString("es-ES");
  const questionsHtml = state.questions.map((question, idx) => {
    const answersHtml = getShuffledAnswers(question).map(({ answer }, answerIdx) => {
      const letter = String.fromCharCode(97 + answerIdx);
      return `<li><strong>${letter})</strong> ${escapeHtml(answer.text)}</li>`;
    }).join("");

    return `
      <article class="question-block">
        <h3>${idx + 1}. ${escapeHtml(question.question)}</h3>
        <ul class="answers-list">${answersHtml}</ul>
      </article>
    `;
  }).join("");

  const keyHtml = state.questions.map((question, idx) => {
    const correctIdx = getCorrectIndex(question);
    const shuffledAnswers = getShuffledAnswers(question);
    const correctDisplayIndex = shuffledAnswers.findIndex((item) => item.originalIndex === correctIdx);
    const answerText = correctIdx >= 0 && question.answers?.[correctIdx]
      ? question.answers[correctIdx].text
      : "No definida";
    const letter = correctDisplayIndex >= 0 ? String.fromCharCode(65 + correctDisplayIndex) : "-";
    return `<div><strong>${idx + 1}) ${letter}</strong> - ${escapeHtml(answerText)}</div>`;
  }).join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Campus Test Studio - Exportacion</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Tahoma, sans-serif; color: #121212; line-height: 1.35; }
    h1, h2, h3 { margin: 0 0 8px; }
    .meta { margin: 6px 0 18px; color: #444; font-size: 12px; }
    .question-block { break-inside: avoid; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #ddd; }
    .question-block h3 { font-size: 14px; font-weight: 700; margin-bottom: 6px; }
    .answers-list { margin: 0; padding-left: 18px; }
    .answers-list li { margin: 2px 0; font-size: 12px; }
    .page-break { page-break-before: always; }
    .answer-key { column-count: 2; column-gap: 24px; font-size: 12px; }
    .answer-key div { break-inside: avoid; margin: 0 0 6px; }
  </style>
</head>
<body>
  <h1>Campus Test Studio</h1>
  <div class="meta">Preguntas exportadas: ${state.questions.length} | Generado: ${escapeHtml(createdAt)}</div>
  <section>
    <h2>Preguntas</h2>
    ${questionsHtml}
  </section>
  <section class="page-break">
    <h2>Respuestas correctas</h2>
    <div class="answer-key">${keyHtml}</div>
  </section>
</body>
</html>`;
}

function exportQuestionsToPdf() {
  const banksToExport = getBanksToExport();
  if (!banksToExport.length) {
    el.statusLine.textContent = "No hay preguntas cargadas para exportar.";
    return;
  }

  const jsPdfApi = window.jspdf?.jsPDF;
  if (!jsPdfApi) {
    el.statusLine.textContent = "No se pudo cargar el motor PDF (jsPDF). Recarga la pagina e intentalo de nuevo.";
    return;
  }

  const doc = new jsPdfApi({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - (margin * 2);
  const lineH = 5;
  const colGap = 8;
  const colW = (contentW - colGap) / 2;

  let y = margin;

  const ensureSpace = (needed = lineH) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Campus Test Studio", margin, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const generatedAt = new Date().toLocaleString("es-ES");
  const bankLabel = banksToExport.length === 1
    ? banksToExport[0].name
    : `${banksToExport.length} baterias`;
  doc.text(`Baterias: ${bankLabel}`, margin, y);
  y += 5;
  const totalQuestions = banksToExport.reduce((acc, bank) => acc + bank.questions.length, 0);
  doc.text(`Preguntas: ${totalQuestions} | Generado: ${generatedAt}`, margin, y);
  y += 8;

  banksToExport.forEach((bank, bankIndex) => {
    if (bankIndex > 0) {
      doc.addPage();
      y = margin;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`Bateria ${bankIndex + 1}: ${bank.name}`, margin, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Preguntas: ${bank.questions.length}`, margin, y);
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Preguntas", margin, y);
    y += 6;

    bank.questions.forEach((question, qIndex) => {
      const qLines = doc.splitTextToSize(`${qIndex + 1}. ${question.question}`, contentW);
      ensureSpace((qLines.length * lineH) + 3);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(qLines, margin, y);
      y += qLines.length * lineH;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      getShuffledAnswers(question).forEach(({ answer }, aIndex) => {
        const letter = String.fromCharCode(97 + aIndex);
        const aLines = doc.splitTextToSize(`${letter}) ${answer.text}`, contentW - 3);
        ensureSpace((aLines.length * lineH) + 1);
        doc.text(aLines, margin + 3, y);
        y += aLines.length * lineH;
      });

      y += 3;
    });

    doc.addPage();
    y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`Respuestas correctas - Bateria ${bankIndex + 1}: ${bank.name}`, margin, y);
    y += 8;

    const colX = [margin, margin + colW + colGap];
    const colY = [y, y];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    bank.questions.forEach((question, idx) => {
      const cIdx = getCorrectIndex(question);
      const shuffledAnswers = getShuffledAnswers(question);
      const displayCorrectIndex = shuffledAnswers.findIndex((item) => item.originalIndex === cIdx);
      const letter = displayCorrectIndex >= 0 ? String.fromCharCode(65 + displayCorrectIndex) : "-";
      const answerText = cIdx >= 0 && question.answers?.[cIdx]
        ? question.answers[cIdx].text
        : "No definida";

      const entryLines = doc.splitTextToSize(`${idx + 1}) ${letter} - ${answerText}`, colW);
      const entryHeight = entryLines.length * lineH;

      let chosenCol = colY[0] <= colY[1] ? 0 : 1;
      if (colY[chosenCol] + entryHeight > pageH - margin) {
        const otherCol = chosenCol === 0 ? 1 : 0;
        if (colY[otherCol] + entryHeight <= pageH - margin) {
          chosenCol = otherCol;
        } else {
          doc.addPage();
          colY[0] = margin;
          colY[1] = margin;
          chosenCol = 0;
        }
      }

      doc.text(entryLines, colX[chosenCol], colY[chosenCol]);
      colY[chosenCol] += entryHeight + 1;
    });
  });

  const timestamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
  doc.save(`test_${timestamp}.pdf`);
  el.statusLine.textContent = `PDF exportado correctamente (${banksToExport.length} bateria(s)).`;
}

function lockExam(message) {
  state.examLocked = true;
  stopTimer();
  el.statusLine.textContent = message;
  renderAll();
}

function updateTimerChip() {
  if (!state.examMode || !state.examEndsAt) {
    el.timerChip.textContent = "Sin simulacro";
    el.timerChip.className = "timer-chip";
    return;
  }

  const secLeft = Math.max(0, Math.round((state.examEndsAt - Date.now()) / 1000));
  el.timerChip.textContent = `Tiempo restante ${formatRemaining(secLeft)}`;
  el.timerChip.className = secLeft <= 60 ? "timer-chip danger" : "timer-chip active";

  if (secLeft <= 0 && !state.examLocked) {
    lockExam("Tiempo agotado. Simulacro cerrado.");
  }
}

function startTimer() {
  stopTimer();
  updateTimerChip();
  state.timerId = window.setInterval(updateTimerChip, 1000);
}

function startMockExam() {
  if (!state.questions.length) {
    el.statusLine.textContent = "Carga preguntas antes de iniciar simulacro.";
    return;
  }

  const minutes = Number(el.simMinutes.value);
  const pointsCorrect = Number(el.scoreOk.value);
  const penaltyWrong = Number(el.scoreFail.value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    el.statusLine.textContent = "Los minutos del simulacro deben ser mayores que 0.";
    return;
  }
  if (!Number.isFinite(pointsCorrect) || pointsCorrect <= 0) {
    el.statusLine.textContent = "Los puntos por acierto deben ser mayores que 0.";
    return;
  }
  if (!Number.isFinite(penaltyWrong) || penaltyWrong < 0) {
    el.statusLine.textContent = "La penalizacion por fallo no puede ser negativa.";
    return;
  }

  state.examMode = true;
  state.examLocked = false;
  state.durationSec = Math.round(minutes * 60);
  state.examEndsAt = Date.now() + (state.durationSec * 1000);
  state.pointsCorrect = pointsCorrect;
  state.penaltyWrong = penaltyWrong;
  state.answers = state.questions.map(() => null);
  state.currentIndex = 0;
  state.startedAt = Date.now();
  el.statusLine.textContent = "Simulacro iniciado.";
  startTimer();
  renderAll();
}

function exportProgress() {
  if (!state.questions.length && !state.banks.length) {
    el.statusLine.textContent = "No hay progreso para guardar.";
    return;
  }

  const payload = buildProgressPayload();

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `progreso_test_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  el.statusLine.textContent = "Progreso exportado en JSON.";
}

function saveBrowserProgress() {
  if (!state.questions.length && !state.banks.length) {
    el.statusLine.textContent = "No hay progreso para guardar en el navegador.";
    return;
  }

  const payload = buildProgressPayload();
  try {
    window.localStorage.setItem(BROWSER_PROGRESS_KEY, JSON.stringify(payload));
    el.statusLine.textContent = "Progreso guardado en este navegador.";
  } catch (_err) {
    el.statusLine.textContent = "No se pudo guardar en el navegador (espacio insuficiente o bloqueo).";
  }
}

function loadBrowserProgress() {
  try {
    const raw = window.localStorage.getItem(BROWSER_PROGRESS_KEY);
    if (!raw) {
      el.statusLine.textContent = "No hay progreso guardado en este navegador.";
      return;
    }
    const data = JSON.parse(raw);
    importProgressData(data);
    el.statusLine.textContent = "Progreso cargado desde este navegador.";
  } catch (_err) {
    el.statusLine.textContent = "No se pudo cargar el progreso local del navegador.";
  }
}

function clearBrowserProgress() {
  window.localStorage.removeItem(BROWSER_PROGRESS_KEY);
  el.statusLine.textContent = "Guardado local eliminado del navegador.";
}

function importProgressData(data) {
  if (!data || data.kind !== "campus-test-progress" || !data.state) {
    throw new Error("El archivo no es un progreso valido de Campus Test Studio.");
  }

  stopTimer();
  state.banks = Array.isArray(data.state.banks) ? data.state.banks : [];
  state.activeBankId = String(data.state.activeBankId || "all");
  state.questions = Array.isArray(data.state.questions) ? data.state.questions : [];
  state.answers = Array.isArray(data.state.answers) ? data.state.answers : state.questions.map(() => null);
  state.currentIndex = Number.isInteger(data.state.currentIndex) ? data.state.currentIndex : 0;
  state.startedAt = Number(data.state.startedAt) || Date.now();
  state.shuffle = Boolean(data.state.shuffle);
  state.examMode = Boolean(data.state.examMode);
  state.examLocked = Boolean(data.state.examLocked);
  state.durationSec = Number(data.state.durationSec) || 0;
  state.pointsCorrect = Number(data.state.pointsCorrect) || 1;
  state.penaltyWrong = Number(data.state.penaltyWrong) || 0;
  state.answerOrderByQuestionId = data.state.answerOrderByQuestionId && typeof data.state.answerOrderByQuestionId === "object"
    ? data.state.answerOrderByQuestionId
    : {};

  const remainingSec = Number(data.state.remainingSec) || 0;
  if (state.examMode && !state.examLocked && remainingSec > 0) {
    state.examEndsAt = Date.now() + (remainingSec * 1000);
    startTimer();
  } else {
    state.examEndsAt = 0;
    stopTimer();
  }

  el.scoreOk.value = String(state.pointsCorrect);
  el.scoreFail.value = String(state.penaltyWrong);
  el.shuffleBtn.textContent = `Mezclar preguntas: ${state.shuffle ? "ON" : "OFF"}`;
  renderAll();
}

async function importProgress(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  importProgressData(data);
  el.statusLine.textContent = "Progreso cargado correctamente.";
}

function renderStats() {
  const stats = getStats();
  const score = computeOfficialScore(stats);
  el.metricAnswered.textContent = `${stats.answered}/${stats.total}`;
  el.metricCorrect.textContent = String(stats.correct);
  el.metricWrong.textContent = String(stats.wrong);
  el.metricPercent.textContent = `${stats.percent}%`;
  el.metricOfficial.textContent = score.grade10.toFixed(2);

  const progress = stats.total > 0 ? Math.round((stats.answered / stats.total) * 100) : 0;
  el.progressBar.style.width = `${progress}%`;
  el.progressLabel.textContent = `${progress}% completado (${stats.answered}/${stats.total})`;

  const finished = (stats.total > 0 && stats.answered === stats.total) || (state.examMode && state.examLocked);
  el.summaryPanel.hidden = !finished;
  if (finished) {
    const sec = Math.max(1, Math.round((Date.now() - state.startedAt) / 1000));
    el.summaryText.textContent = `Completado en ${sec}s. Aciertos ${stats.correct}/${stats.total} (${stats.percent}%). Nota oficial ${score.grade10.toFixed(2)}/10 (formula: +${state.pointsCorrect} acierto, -${state.penaltyWrong} fallo).`;
    if (!state.examLocked) {
      el.statusLine.textContent = "Test finalizado.";
    }
  }

  updateTimerChip();
}

function renderQuestion() {
  const question = state.questions[state.currentIndex];
  if (!question) {
    el.quizPanel.hidden = true;
    renderStats();
    return;
  }

  el.quizPanel.hidden = false;
  el.questionCounter.textContent = `Pregunta ${state.currentIndex + 1} de ${state.questions.length}`;
  el.questionPage.textContent = `Pagina original: ${question.page}`;
  el.questionSource.textContent = `Fuente: ${question.source}`;
  el.questionText.textContent = question.question;

  const selected = state.answers[state.currentIndex];
  const correct = getCorrectIndex(question);
  const hasAnswer = selected !== null && selected !== undefined;
  const shuffledAnswers = getShuffledAnswers(question);

  el.optionsBox.innerHTML = "";
  shuffledAnswers.forEach(({ answer, originalIndex }, displayIndex) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option";
    btn.textContent = answer.text;
    btn.disabled = state.examLocked;
    btn.addEventListener("click", () => {
      if (state.examLocked) return;
      state.answers[state.currentIndex] = originalIndex;
      renderAll();
    });

    if (hasAnswer) {
      if (originalIndex === selected) btn.classList.add("selected");
      if (originalIndex === correct) btn.classList.add("correct");
      if (originalIndex === selected && selected !== correct) btn.classList.add("wrong");
    }

    el.optionsBox.appendChild(btn);
  });

  if (!hasAnswer) {
    el.feedbackBox.hidden = true;
  } else {
    el.feedbackBox.hidden = false;
    if (correct < 0) {
      el.feedbackBox.textContent = "Esta pregunta no tiene respuesta correcta marcada en el JSON.";
    } else if (selected === correct) {
      el.feedbackBox.textContent = "Respuesta correcta.";
    } else {
      const correctText = question.answers[correct].text;
      const googleUrl = buildGoogleSearchUrl(question.question, correctText);

      el.feedbackBox.textContent = `Respuesta incorrecta. Correcta: ${correctText} `;
      const link = document.createElement("a");
      link.href = googleUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "feedback-link";
      link.textContent = "Buscar concepto en Google";
      el.feedbackBox.appendChild(link);
    }
  }

  el.prevBtn.disabled = state.currentIndex === 0;
  el.nextBtn.disabled = state.currentIndex === state.questions.length - 1;
}

function renderDatasetTabs() {
  el.datasetTabs.innerHTML = "";
  const items = [{ id: "all", label: `Todos (${state.banks.length})` }]
    .concat(state.banks.map((bank) => ({ id: bank.id, label: `${bank.name} (${bank.questions.length})` })));

  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dataset-chip";
    if (item.id === state.activeBankId) btn.classList.add("active");
    btn.textContent = item.label;
    btn.addEventListener("click", () => {
      state.activeBankId = item.id;
      recomputeQuestions();
    });
    el.datasetTabs.appendChild(btn);
  });
}

function renderNavigator() {
  el.navigatorGrid.innerHTML = "";
  state.questions.forEach((_, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-item";
    btn.textContent = String(index + 1);
    if (index === state.currentIndex) btn.classList.add("current");
    if (state.answers[index] !== null && state.answers[index] !== undefined) btn.classList.add("answered");
    btn.addEventListener("click", () => {
      state.currentIndex = index;
      renderAll();
      el.navigator.hidden = true;
    });
    el.navigatorGrid.appendChild(btn);
  });
}

function renderAll() {
  renderDatasetTabs();
  renderQuestion();
  renderNavigator();
  renderStats();
  updateMobileQuizLayout();
  updateMobileControlsState();
  updateNavigatorUi();
}

function questionFingerprint(question) {
  if (!question || typeof question !== "object") return "";
  const qText = String(question.question || "").trim().toLowerCase();
  const answers = Array.isArray(question.answers)
    ? question.answers.map((ans) => String(ans?.text || "").trim().toLowerCase()).join("||")
    : "";
  const correctIdx = getCorrectIndex(question);
  return `${qText}__${answers}__${correctIdx}`;
}

function collectLoadedFingerprints() {
  const fingerprints = new Set();
  state.banks.forEach((bank) => {
    bank.questions.forEach((question) => {
      const fp = questionFingerprint(question);
      if (fp) fingerprints.add(fp);
    });
  });
  return fingerprints;
}

function addBank(name, questions) {
  if (!questions.length) {
    return { addedBank: false, addedQuestions: 0, skippedDuplicates: 0, alreadyLoaded: false };
  }

  if (state.banks.some((bank) => bank.name === name)) {
    return {
      addedBank: false,
      addedQuestions: 0,
      skippedDuplicates: questions.length,
      alreadyLoaded: true
    };
  }

  const fingerprints = collectLoadedFingerprints();
  const uniqueQuestions = [];
  let skippedDuplicates = 0;

  questions.forEach((question) => {
    const fp = questionFingerprint(question);
    if (!fp) return;
    if (fingerprints.has(fp)) {
      skippedDuplicates += 1;
      return;
    }
    fingerprints.add(fp);
    uniqueQuestions.push(question);
  });

  if (!uniqueQuestions.length) {
    return { addedBank: false, addedQuestions: 0, skippedDuplicates, alreadyLoaded: false };
  }

  state.banks = state.banks.concat([
    {
      id: `${name}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name,
      questions: uniqueQuestions
    }
  ]);

  return {
    addedBank: true,
    addedQuestions: uniqueQuestions.length,
    skippedDuplicates,
    alreadyLoaded: false
  };
}

function setServerDatasetOptions(names) {
  if (!el.serverDatasetSelect) return;
  el.serverDatasetSelect.innerHTML = "";

  if (!names.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Sin JSON en datasets";
    el.serverDatasetSelect.appendChild(option);
    return;
  }

  names.forEach((name, idx) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    if (idx === 0) option.selected = true;
    el.serverDatasetSelect.appendChild(option);
  });
}

function parseDatasetsFromDirectoryHtml(htmlText) {
  if (typeof htmlText !== "string" || !htmlText.trim()) return [];
  const names = [];
  const re = /href=["']([^"']+\.json)["']/gi;
  let m;
  while ((m = re.exec(htmlText)) !== null) {
    const href = decodeURIComponent(m[1]);
    const fileName = href.split("/").pop();
    if (!fileName) continue;
    if (fileName.toLowerCase() === "index.json") continue;
    if (!names.includes(fileName)) names.push(fileName);
  }
  return names;
}

async function refreshServerDatasets() {
  if (!el.serverDatasetSelect) return;
  try {
    let apiNames = [];
    try {
      const apiResp = await fetch(DATASET_API_PATH, { cache: "no-store" });
      if (apiResp.ok) {
        const payload = await apiResp.json();
        apiNames = Array.isArray(payload?.files)
          ? payload.files.filter((item) => typeof item === "string" && item.toLowerCase().endsWith(".json"))
          : [];
      }
    } catch (_err) {
      // En local sin backend de Vercel, seguimos con fallback.
    }

    let indexNames = [];
    try {
      const resp = await fetch(DATASET_INDEX_PATH, { cache: "no-store" });
      if (resp.ok) {
        const payload = await resp.json();
        indexNames = Array.isArray(payload?.files)
          ? payload.files.filter((item) => typeof item === "string" && item.toLowerCase().endsWith(".json"))
          : [];
      }
    } catch (_err) {
      // Si no existe index.json en un entorno concreto, seguimos con el resto.
    }

    let directoryNames = [];
    try {
      const dirResp = await fetch("datasets/", { cache: "no-store" });
      if (dirResp.ok) {
        const htmlText = await dirResp.text();
        directoryNames = parseDatasetsFromDirectoryHtml(htmlText);
      }
    } catch (_err) {
      // Sin listado de directorio en hosting estatico: se usa index.json.
    }

    const unique = [];
    [...apiNames, ...indexNames, ...directoryNames].forEach((name) => {
      if (!unique.includes(name)) unique.push(name);
    });
    setServerDatasetOptions(unique);
  } catch (_err) {
    setServerDatasetOptions([]);
  }
}

async function loadSelectedServerDataset() {
  if (!el.serverDatasetSelect) return;
  const selected = el.serverDatasetSelect.value;
  if (!selected) {
    el.statusLine.textContent = "No hay JSON seleccionado en datasets.";
    return;
  }

  const path = `datasets/${selected}`;
  try {
    const resp = await fetch(path, { cache: "no-store" });
    if (!resp.ok) {
      el.statusLine.textContent = `No se pudo cargar ${selected}.`;
      return;
    }

    const payload = await resp.json();
    const questions = normalizeJson(payload, selected);
    if (!questions.length) {
      el.statusLine.textContent = `El archivo ${selected} no contiene preguntas validas.`;
      return;
    }

    const result = addBank(selected, questions);
    if (result.alreadyLoaded) {
      el.statusLine.textContent = `${selected} ya estaba cargado. No se anadieron preguntas duplicadas.`;
      return;
    }
    if (!result.addedBank) {
      el.statusLine.textContent = `${selected} no se cargo porque todas sus preguntas ya estaban en memoria.`;
      return;
    }

    state.activeBankId = "all";
    const dupText = result.skippedDuplicates > 0
      ? ` (${result.skippedDuplicates} duplicadas omitidas)`
      : "";
    el.statusLine.textContent = `Cargado ${selected} desde datasets con ${result.addedQuestions} preguntas nuevas${dupText}.`;
    recomputeQuestions();
  } catch (_err) {
    el.statusLine.textContent = `Error leyendo ${selected} desde datasets.`;
  }
}

async function loadFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const loadedBanks = [];
  for (const file of files) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const questions = normalizeJson(payload, file.name);
      if (questions.length === 0) continue;
      loadedBanks.push({ name: file.name, questions });
    } catch (_err) {
      // Ignora archivos con formato no valido.
    }
  }

  if (!loadedBanks.length) {
    el.statusLine.textContent = "No se detectaron preguntas validas en los archivos seleccionados.";
    return;
  }

  let totalNew = 0;
  let totalDuplicates = 0;
  loadedBanks.forEach((bank) => {
    const result = addBank(bank.name, bank.questions);
    totalNew += result.addedQuestions;
    totalDuplicates += result.skippedDuplicates;
  });

  if (totalNew === 0) {
    el.statusLine.textContent = "No se anadieron preguntas: todos los JSON ya estaban cargados o eran duplicados.";
    return;
  }

  state.activeBankId = "all";
  const dupText = totalDuplicates > 0 ? ` (${totalDuplicates} duplicadas omitidas)` : "";
  el.statusLine.textContent = `Cargados ${loadedBanks.length} JSON con ${totalNew} preguntas nuevas${dupText}.`;
  recomputeQuestions();
}

function wireEvents() {
  if (el.filesInput) {
    el.filesInput.disabled = true;
    el.filesInput.title = "Deshabilitado: la app solo carga JSON de datasets/.";
  }

  if (el.mobileControlsToggle) {
    el.mobileControlsToggle.addEventListener("click", () => {
      state.mobileControlsExpanded = !state.mobileControlsExpanded;
      updateMobileControlsState();
    });
  }

  el.prevBtn.addEventListener("click", () => {
    if (state.currentIndex > 0) {
      state.currentIndex -= 1;
      renderAll();
    }
  });

  el.nextBtn.addEventListener("click", () => {
    if (state.currentIndex < state.questions.length - 1) {
      state.currentIndex += 1;
      renderAll();
    }
  });

  el.resetBtn.addEventListener("click", () => {
    if (!state.questions.length) return;
    stopTimer();
    state.answers = state.questions.map(() => null);
    state.currentIndex = 0;
    state.startedAt = Date.now();
    state.examLocked = false;
    if (state.examMode && state.durationSec > 0) {
      state.examEndsAt = Date.now() + (state.durationSec * 1000);
      startTimer();
    }
    el.statusLine.textContent = "Progreso reiniciado.";
    renderAll();
  });

  if (el.clearAllBtn) {
    el.clearAllBtn.addEventListener("click", () => {
      stopTimer();
      state.banks = [];
      state.activeBankId = "all";
      state.questions = [];
      state.answers = [];
      state.answerOrderByQuestionId = {};
      state.currentIndex = 0;
      state.startedAt = 0;
      state.examMode = false;
      state.examLocked = false;
      state.durationSec = 0;
      state.examEndsAt = 0;
      el.timerChip.textContent = "Sin simulacro";
      el.timerChip.className = "timer-chip";
      el.statusLine.textContent = "Todo borrado. Carga un JSON para empezar.";
      renderAll();
    });
  }

  el.shuffleBtn.addEventListener("click", () => {
    state.shuffle = !state.shuffle;
    el.shuffleBtn.textContent = `Mezclar preguntas: ${state.shuffle ? "ON" : "OFF"}`;
    recomputeQuestions();
  });

  el.navigatorToggle.addEventListener("click", () => {
    toggleNavigator();
  });

  el.closeNavigator.addEventListener("click", () => {
    closeNavigator();
  });

  if (el.refreshServerDatasetsBtn) {
    el.refreshServerDatasetsBtn.addEventListener("click", refreshServerDatasets);
  }

  if (el.loadServerDatasetBtn) {
    el.loadServerDatasetBtn.addEventListener("click", loadSelectedServerDataset);
  }

  el.startSimBtn.addEventListener("click", startMockExam);
  el.presetOfficialBtn.addEventListener("click", () => {
    el.scoreOk.value = "1";
    el.scoreFail.value = "0.33";
    state.pointsCorrect = 1;
    state.penaltyWrong = 0.33;
    el.statusLine.textContent = "Preset oficial aplicado (+1 acierto, -0.33 fallo).";
    renderAll();
  });
  el.saveProgressBtn.addEventListener("click", exportProgress);
  if (el.exportPdfBtn) {
    el.exportPdfBtn.addEventListener("click", exportQuestionsToPdf);
  }
  if (el.exportExcelBtn) {
    el.exportExcelBtn.addEventListener("click", exportQuestionsToExcel);
  }
  if (el.saveBrowserProgressBtn) {
    el.saveBrowserProgressBtn.addEventListener("click", saveBrowserProgress);
  }
  if (el.loadBrowserProgressBtn) {
    el.loadBrowserProgressBtn.addEventListener("click", loadBrowserProgress);
  }
  if (el.clearBrowserProgressBtn) {
    el.clearBrowserProgressBtn.addEventListener("click", clearBrowserProgress);
  }

  el.loadProgressInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importProgress(file);
    } catch (err) {
      el.statusLine.textContent = `No se pudo cargar progreso: ${err.message}`;
    } finally {
      event.target.value = "";
    }
  });

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", () => {
      if (!mobileQuery.matches) {
        state.mobileControlsExpanded = false;
      }
      updateMobileQuizLayout();
      updateMobileControlsState();
      updateNavigatorUi();
    });
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(() => {
      if (!mobileQuery.matches) {
        state.mobileControlsExpanded = false;
      }
      updateMobileQuizLayout();
      updateMobileControlsState();
      updateNavigatorUi();
    });
  }
}

async function init() {
  wireEvents();
  renderAll();
  await refreshServerDatasets();
  el.statusLine.textContent = "Selecciona un JSON de datasets para empezar.";
}

init();
