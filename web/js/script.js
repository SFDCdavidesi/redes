const DEFAULT_DATASET = "data.json";
const DATASET_INDEX_PATH = "datasets/index.json";

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
  timerId: null
};

const el = {
  statusLine: document.getElementById("statusLine"),
  filesInput: document.getElementById("jsonFilesInput"),
  loadProgressInput: document.getElementById("loadProgressInput"),
  saveProgressBtn: document.getElementById("saveProgressBtn"),
  serverDatasetSelect: document.getElementById("serverDatasetSelect"),
  loadServerDatasetBtn: document.getElementById("loadServerDatasetBtn"),
  refreshServerDatasetsBtn: document.getElementById("refreshServerDatasetsBtn"),
  resetBtn: document.getElementById("resetBtn"),
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

  const payload = {
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
      penaltyWrong: state.penaltyWrong
    }
  };

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

async function importProgress(file) {
  const text = await file.text();
  const data = JSON.parse(text);
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
  el.statusLine.textContent = "Progreso cargado correctamente.";
  renderAll();
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

  el.optionsBox.innerHTML = "";
  question.answers.forEach((answer, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option";
    btn.textContent = answer.text;
    btn.disabled = state.examLocked;
    btn.addEventListener("click", () => {
      if (state.examLocked) return;
      state.answers[state.currentIndex] = index;
      renderAll();
    });

    if (hasAnswer) {
      if (index === selected) btn.classList.add("selected");
      if (index === correct) btn.classList.add("correct");
      if (index === selected && selected !== correct) btn.classList.add("wrong");
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
      el.feedbackBox.textContent = `Respuesta incorrecta. Correcta: ${question.answers[correct].text}`;
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
}

function addBank(name, questions) {
  if (!questions.length) return;
  state.banks = state.banks.concat([
    {
      id: `${name}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name,
      questions
    }
  ]);
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

async function refreshServerDatasets() {
  if (!el.serverDatasetSelect) return;
  try {
    const resp = await fetch(DATASET_INDEX_PATH, { cache: "no-store" });
    if (!resp.ok) {
      setServerDatasetOptions([]);
      return;
    }

    const payload = await resp.json();
    const names = Array.isArray(payload?.files)
      ? payload.files.filter((item) => typeof item === "string" && item.toLowerCase().endsWith(".json"))
      : [];
    setServerDatasetOptions(names);
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

    addBank(selected, questions);
    state.activeBankId = "all";
    el.statusLine.textContent = `Cargado ${selected} desde datasets con ${questions.length} preguntas.`;
    recomputeQuestions();
  } catch (_err) {
    el.statusLine.textContent = `Error leyendo ${selected} desde datasets.`;
  }
}

async function loadDefaultJsonIfExists() {
  try {
    const resp = await fetch(DEFAULT_DATASET, { cache: "no-store" });
    if (!resp.ok) return;
    const payload = await resp.json();
    const questions = normalizeJson(payload, DEFAULT_DATASET);
    if (questions.length === 0) return;
    state.banks = [{ id: "default", name: DEFAULT_DATASET, questions }];
    state.activeBankId = "all";
    el.statusLine.textContent = `Cargado ${DEFAULT_DATASET} con ${questions.length} preguntas.`;
    recomputeQuestions();
  } catch (_err) {
    // Si no existe data.json no bloquea la app.
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

  loadedBanks.forEach((bank) => addBank(bank.name, bank.questions));
  state.activeBankId = "all";
  const total = loadedBanks.reduce((sum, bank) => sum + bank.questions.length, 0);
  el.statusLine.textContent = `Cargados ${loadedBanks.length} JSON con ${total} preguntas nuevas.`;
  recomputeQuestions();
}

function wireEvents() {
  el.filesInput.addEventListener("change", async (event) => {
    await loadFiles(event.target.files);
    event.target.value = "";
  });

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

  el.shuffleBtn.addEventListener("click", () => {
    state.shuffle = !state.shuffle;
    el.shuffleBtn.textContent = `Mezclar preguntas: ${state.shuffle ? "ON" : "OFF"}`;
    recomputeQuestions();
  });

  el.navigatorToggle.addEventListener("click", () => {
    el.navigator.hidden = !el.navigator.hidden;
  });

  el.closeNavigator.addEventListener("click", () => {
    el.navigator.hidden = true;
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
}

async function init() {
  wireEvents();
  renderAll();
  await refreshServerDatasets();
  await loadDefaultJsonIfExists();
}

init();
