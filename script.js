const TYPE_LABELS = {
  number: "число",
  categorical: "категория",
  date: "дата",
};

const MISSING_VALUE = /^(na|n\/a|null|none|nan|-|н\/д|н\.д\.)$/i;

const ui = {
  dropzone: document.querySelector("#dropzone"),
  fileInput: document.querySelector("#file-input"),
  fileName: document.querySelector("#file-name"),
  error: document.querySelector("#error"),
  rowCount: document.querySelector("#row-count"),
  colCount: document.querySelector("#col-count"),
  missingCount: document.querySelector("#missing-count"),
  columnList: document.querySelector("#column-list"),
  previewHead: document.querySelector("#preview-head"),
  previewBody: document.querySelector("#preview-body"),
  stats: document.querySelector("#stats"),
  histColumn: document.querySelector("#hist-column"),
  barColumn: document.querySelector("#bar-column"),
  barType: document.querySelector("#bar-type"),
  scatterX: document.querySelector("#scatter-x"),
  scatterY: document.querySelector("#scatter-y"),
  histMessage: document.querySelector("#hist-message"),
  barMessage: document.querySelector("#bar-message"),
  scatterMessage: document.querySelector("#scatter-message"),
  histCanvas: document.querySelector("#hist-chart"),
  barCanvas: document.querySelector("#bar-chart"),
  scatterCanvas: document.querySelector("#scatter-chart"),
  filters: document.querySelector("#filters"),
  filterColumn: document.querySelector("#filter-column"),
  filterValue: document.querySelector("#filter-value"),
  filterNote: document.querySelector("#filter-note"),
};

if (ui.fileInput && ui.dropzone) {
  ui.fileInput.addEventListener("change", () => {
    const file = ui.fileInput.files && ui.fileInput.files[0];
    ui.fileInput.value = "";
    readFile(file);
  });

  let dragDepth = 0;

  ui.dropzone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth += 1;
    ui.dropzone.classList.add("dragover");
  });

  ui.dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  ui.dropzone.addEventListener("dragleave", () => {
    dragDepth -= 1;
    if (dragDepth <= 0) {
      dragDepth = 0;
      ui.dropzone.classList.remove("dragover");
    }
  });

  ui.dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    ui.dropzone.classList.remove("dragover");
    const file = event.dataTransfer && event.dataTransfer.files[0];
    readFile(file);
  });

  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => event.preventDefault());
}

if (ui.histColumn && ui.barColumn && ui.scatterX && ui.scatterY) {
  ui.histColumn.addEventListener("change", () => renderHistogram());
  ui.barColumn.addEventListener("change", () => renderBar());
  if (ui.barType) {
    ui.barType.addEventListener("change", () => renderBar());
  }
  ui.scatterX.addEventListener("change", () => renderScatter());
  ui.scatterY.addEventListener("change", () => renderScatter());
}

if (ui.filterColumn && ui.filterValue) {
  ui.filterColumn.addEventListener("change", () => {
    fillFilterValues();
    applyFilter();
  });
  ui.filterValue.addEventListener("change", () => applyFilter());
}

const themeButton = document.querySelector("#theme-toggle");
if (themeButton) {
  syncThemeButton();
  themeButton.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    syncThemeButton();
    applyChartTheme();
    if (currentDataset) {
      renderHistogram();
      renderBar();
      renderScatter();
    }
  });
}

applyChartTheme();

function readFile(file) {
  if (!file) {
    fail("Перетащите CSV-файл.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const result = inspectCsvBytes(reader.result);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    render(result.dataset);
    ui.fileName.textContent = `Загружен файл: ${file.name}`;
    setMessage(result.warnings);
    setupFilter(result.dataset);
  };
  reader.onerror = () => fail("Не удалось прочитать файл.");
  reader.readAsArrayBuffer(file);
}

function inspectCsvBytes(bytes) {
  const buffer = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  if (!buffer || buffer.byteLength === 0) {
    return { ok: false, error: "Файл пустой." };
  }

  const text = new TextDecoder("utf-8").decode(buffer);
  try {
    const dataset = analyse(parseCsv(text));
    return {
      ok: true,
      error: "",
      warnings: warningsFor(dataset),
      rows: dataset.rows.length,
      columns: dataset.columns.length,
      missing: dataset.missing,
      types: dataset.columns.map((column) => ({ name: column.name, type: column.type })),
      dataset,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Не удалось прочитать файл.",
    };
  }
}

function fail(message) {
  clearView();
  setMessage(message);
}

function setMessage(message) {
  if (!ui.error) {
    return;
  }
  ui.error.textContent = message || "";
  ui.error.classList.toggle("visible", Boolean(message));
}

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  if (text.includes("\0")) {
    throw new Error("Файл не похож на CSV.");
  }
  if (text.trim() === "") {
    throw new Error("Файл пустой.");
  }

  const delimiter = detectDelimiter(text);
  const table = [];
  let cells = [];
  let field = "";
  let inQuotes = false;
  let line = 1;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
        if (char === "\n" || (char === "\r" && text[i + 1] !== "\n")) {
          line += 1;
        }
      }
      continue;
    }

    // Кавычка начинает поле только в его начале. Кавычки внутри значения, как в «Война и мир», остаются текстом.
    if (char === '"' && field === "") {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      cells.push(field);
      field = "";
      continue;
    }

    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      cells.push(field);
      table.push({ cells, line });
      cells = [];
      field = "";
      line += 1;
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error("Не удалось разобрать CSV: в файле не закрыта кавычка.");
  }

  if (field.length > 0 || cells.length > 0) {
    cells.push(field);
    table.push({ cells, line });
  }

  const filled = table.filter((row) => !row.cells.every((cell) => cell.trim() === ""));
  if (filled.length === 0) {
    throw new Error("Файл пустой.");
  }

  const header = uniqueHeader(filled[0].cells);
  const data = [];

  for (let index = 1; index < filled.length; index += 1) {
    const row = filled[index];
    if (row.cells.length !== header.length) {
      throw new Error(
        `Не удалось разобрать CSV: в строке ${row.line} ${row.cells.length} столбцов, в заголовке ${header.length}.`
      );
    }
    data.push(row.cells.map((cell) => cell.trim()));
  }

  if (data.length === 0) {
    throw new Error("В файле нет строк с данными.");
  }

  return { header, rows: data };
}

function detectDelimiter(text) {
  const sample = firstLine(text);
  const counts = [",", ";", "\t"].map((delimiter) => ({
    delimiter,
    count: countOutsideQuotes(sample, delimiter),
  }));
  counts.sort((left, right) => right.count - left.count);
  return counts[0].count > 0 ? counts[0].delimiter : ",";
}

function firstLine(text) {
  let line = "";
  let fieldEmpty = true;
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      line += char;
      if (char === '"') {
        if (text[i + 1] === '"') {
          line += '"';
          i += 1;
          fieldEmpty = false;
        } else {
          inQuotes = false;
        }
      } else {
        fieldEmpty = false;
      }
      continue;
    }
    if (char === "\n" || char === "\r") {
      break;
    }
    line += char;
    if (char === '"' && fieldEmpty) {
      inQuotes = true;
      continue;
    }
    if (char === "," || char === ";" || char === "\t") {
      fieldEmpty = true;
      continue;
    }
    fieldEmpty = false;
  }
  return line;
}

function countOutsideQuotes(line, delimiter) {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

function uniqueHeader(cells) {
  const seen = new Map();
  return cells.map((cell, index) => {
    const name = cell.trim() || `Столбец ${index + 1}`;
    const used = seen.get(name) || 0;
    seen.set(name, used + 1);
    return used === 0 ? name : `${name} (${used + 1})`;
  });
}

function analyse(parsed) {
  const columns = parsed.header.map((name, index) => {
    const values = parsed.rows.map((row) => row[index]);
    const detected = detectType(values);
    const missing = values.filter(isMissing).length;
    return { name, type: detected.type, mixed: detected.mixed, missing, values };
  });

  return {
    columns,
    rows: parsed.rows,
    missing: columns.reduce((sum, column) => sum + column.missing, 0),
  };
}

function detectType(values) {
  const present = values.filter((value) => !isMissing(value));
  if (present.length === 0) {
    return { type: "categorical", mixed: false };
  }
  if (present.every(isDate)) {
    return { type: "date", mixed: false };
  }
  if (present.every(isNumber)) {
    return { type: "number", mixed: false };
  }
  const numericCount = present.filter(isNumber).length;
  return {
    type: "categorical",
    mixed: numericCount > 0 && numericCount / present.length >= 0.5,
  };
}

function isMissing(value) {
  const trimmed = value.trim();
  return trimmed === "" || MISSING_VALUE.test(trimmed);
}

function normalizeNumber(value) {
  const compact = value.trim().replace(/\s/g, "");
  return compact.includes(",") && !compact.includes(".")
    ? compact.replace(",", ".")
    : compact;
}

function isNumber(value) {
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalizeNumber(value));
}

function parseDate(value) {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const local = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (!iso && !local) {
    return null;
  }
  const year = Number(iso ? iso[1] : local[3]);
  const month = Number(iso ? iso[2] : local[2]);
  const day = Number(iso ? iso[3] : local[1]);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return { time, text: trimmed };
}

function isDate(value) {
  return parseDate(value) !== null;
}

function parseNumber(value) {
  return Number(normalizeNumber(value));
}

function formatBinEdge(value, width) {
  if (width >= 10) {
    return String(Math.round(value));
  }
  return formatNumber(value);
}

function formatNumber(value) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return String(rounded);
}

function summarizeColumn(column) {
  if (column.type === "number") {
    return { kind: "number", ...numericSummary(column.values) };
  }
  if (column.type === "date") {
    return { kind: "date", ...dateSummary(column.values) };
  }
  return { kind: "categorical", ...categoricalSummary(column.values) };
}

function numericSummary(values) {
  const present = values.filter((value) => !isMissing(value)).map(parseNumber);
  const missing = values.length - present.length;
  if (present.length === 0) {
    return { missing, mean: null, median: null, min: null, max: null, stdev: null };
  }
  const sorted = [...present].sort((left, right) => left - right);
  const mean = present.reduce((sum, value) => sum + value, 0) / present.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  // Для одной цифры отклонение не определено. Для остальных — выборочное, со знаменателем n − 1.
  const stdev = present.length > 1
    ? Math.sqrt(present.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (present.length - 1))
    : null;
  return { missing, mean, median, min: sorted[0], max: sorted[sorted.length - 1], stdev };
}

function categoricalSummary(values, limit = 5) {
  const counts = new Map();
  let missing = 0;
  values.forEach((value) => {
    if (isMissing(value)) {
      missing += 1;
      return;
    }
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  const top = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ru"))
    .slice(0, limit);
  return { missing, unique: counts.size, top };
}

function dateSummary(values) {
  const present = [];
  let missing = 0;
  values.forEach((value) => {
    if (isMissing(value)) {
      missing += 1;
      return;
    }
    const parsed = parseDate(value);
    if (parsed) {
      present.push(parsed);
    }
  });
  present.sort((left, right) => left.time - right.time || left.text.localeCompare(right.text, "ru"));
  return {
    missing,
    unique: new Set(present.map((item) => item.text)).size,
    min: present.length ? present[0].text : null,
    max: present.length ? present[present.length - 1].text : null,
  };
}

function warningsFor(dataset) {
  const notes = [];
  const numeric = dataset.columns.filter((column) => column.type === "number");
  if (numeric.length === 0) {
    notes.push("В файле нет числовых столбцов. Сводка и таблица показаны, графики по числам построить нельзя.");
  }
  dataset.columns
    .filter((column) => column.mixed)
    .forEach((column) => {
      notes.push(`В столбце «${column.name}» есть текст вместо числа, поэтому он отмечен как категориальный.`);
    });
  return notes.join(" ");
}

function render(dataset, options = {}) {
  ui.rowCount.textContent = String(dataset.rows.length);
  ui.colCount.textContent = String(dataset.columns.length);
  ui.missingCount.textContent = String(dataset.missing);

  ui.columnList.replaceChildren();
  dataset.columns.forEach((column) => {
    const item = document.createElement("li");
    item.textContent = column.name;
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = TYPE_LABELS[column.type];
    item.append(pill);
    ui.columnList.append(item);
  });

  const headRow = document.createElement("tr");
  dataset.columns.forEach((column) => {
    const cell = document.createElement("th");
    cell.textContent = column.name;
    headRow.append(cell);
  });
  ui.previewHead.replaceChildren(headRow);

  if (dataset.rows.length === 0) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.className = "empty";
    emptyCell.textContent = "Нет строк с выбранным значением.";
    emptyRow.append(emptyCell);
    ui.previewBody.replaceChildren(emptyRow);
  } else {
    const body = document.createDocumentFragment();
    dataset.rows.slice(0, 20).forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = isMissing(value) ? "—" : value;
        tr.append(cell);
      });
      body.append(tr);
    });
    ui.previewBody.replaceChildren(body);
  }
  renderStats(dataset);
  renderCharts(dataset, options.resetCharts !== false);
}

function setupFilter(dataset) {
  sourceDataset = dataset;
  if (!ui.filterColumn) {
    return;
  }
  const categories = dataset.columns.filter((column) => column.type === "categorical");
  ui.filters.hidden = categories.length === 0;
  ui.filterNote.textContent = "";
  ui.filterColumn.replaceChildren(filterOption("", "Все строки"));
  categories.forEach((column) => {
    ui.filterColumn.append(filterOption(column.name, column.name));
  });
  ui.filterColumn.disabled = categories.length === 0;
  fillFilterValues();
}

function fillFilterValues() {
  if (!ui.filterValue) {
    return;
  }
  const columnName = ui.filterColumn.value;
  ui.filterValue.replaceChildren(filterOption("", "Все значения"));
  if (!sourceDataset || !columnName) {
    ui.filterValue.disabled = true;
    return;
  }
  const column = sourceDataset.columns.find((item) => item.name === columnName);
  const values = [...new Set(column.values.filter((value) => !isMissing(value)))]
    .sort((left, right) => left.localeCompare(right, "ru"));
  values.forEach((value) => ui.filterValue.append(filterOption(value, value)));
  ui.filterValue.disabled = false;
}

function applyFilter() {
  if (!sourceDataset) {
    return;
  }
  const view = filteredDataset();
  if (ui.filterNote) {
    const active = ui.filterColumn.value && ui.filterValue.value;
    if (!active) {
      ui.filterNote.textContent = "";
    } else if (view.rows.length === 0) {
      ui.filterNote.textContent = "Нет строк с таким значением.";
    } else {
      ui.filterNote.textContent = `Показано ${view.rows.length} из ${sourceDataset.rows.length} строк.`;
    }
  }
  render(view, { resetCharts: false });
}

function filteredDataset() {
  const columnName = ui.filterColumn && ui.filterColumn.value;
  const selected = ui.filterValue && ui.filterValue.value;
  if (!columnName || !selected) {
    return sourceDataset;
  }
  const index = sourceDataset.columns.findIndex((column) => column.name === columnName);
  const rows = sourceDataset.rows.filter((row) => row[index] === selected);
  const columns = sourceDataset.columns.map((column, columnIndex) => {
    const values = rows.map((row) => row[columnIndex]);
    return {
      ...column,
      values,
      missing: values.filter(isMissing).length,
    };
  });
  return {
    columns,
    rows,
    missing: columns.reduce((sum, column) => sum + column.missing, 0),
  };
}

function filterOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function renderStats(dataset) {
  if (!ui.stats) {
    return;
  }
  const fragment = document.createDocumentFragment();
  appendStatGroup(fragment, "Числовые столбцы", dataset.columns.filter((column) => column.type === "number"));
  appendStatGroup(fragment, "Категориальные столбцы", dataset.columns.filter((column) => column.type === "categorical"));
  appendStatGroup(fragment, "Даты", dataset.columns.filter((column) => column.type === "date"));
  ui.stats.replaceChildren(fragment);
}

function appendStatGroup(fragment, title, columns) {
  if (columns.length === 0) {
    return;
  }
  const heading = document.createElement("h3");
  heading.className = "stats-group";
  heading.textContent = title;
  fragment.append(heading);
  columns.forEach((column) => fragment.append(statCard(column)));
}

function statCard(column) {
  const card = document.createElement("article");
  const title = document.createElement("h3");
  title.textContent = column.name;
  const pill = document.createElement("span");
  pill.className = "pill";
  pill.textContent = TYPE_LABELS[column.type];
  title.append(pill);
  card.append(title);

  const summary = summarizeColumn(column);
  if (summary.kind === "number") {
    card.append(metricList([
      ["Среднее", formatNumber(summary.mean)],
      ["Медиана", formatNumber(summary.median)],
      ["Минимум", formatNumber(summary.min)],
      ["Максимум", formatNumber(summary.max)],
      ["Стандартное отклонение", formatNumber(summary.stdev)],
      ["Пропуски", String(summary.missing)],
    ]));
    return card;
  }

  if (summary.kind === "date") {
    card.append(metricList([
      ["Уникальных", String(summary.unique)],
      ["Минимум", summary.min || "—"],
      ["Максимум", summary.max || "—"],
      ["Пропуски", String(summary.missing)],
    ]));
    return card;
  }

  card.append(metricList([
    ["Уникальных", String(summary.unique)],
    ["Пропуски", String(summary.missing)],
  ]));
  const list = document.createElement("ol");
  list.className = "top-list";
  if (summary.top.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Нет значений";
    list.append(item);
  } else {
    summary.top.forEach(([value, count]) => {
      const item = document.createElement("li");
      item.textContent = `${value} — ${count}`;
      list.append(item);
    });
  }
  card.append(list);
  return card;
}

function metricList(rows) {
  const list = document.createElement("dl");
  rows.forEach(([name, value]) => {
    const row = document.createElement("div");
    row.className = "metric";
    const term = document.createElement("dt");
    term.textContent = name;
    const detail = document.createElement("dd");
    detail.textContent = value;
    row.append(term, detail);
    list.append(row);
  });
  return list;
}

function clearView() {
  ui.fileName.textContent = "";
  ui.rowCount.textContent = "—";
  ui.colCount.textContent = "—";
  ui.missingCount.textContent = "—";

  const emptyColumn = document.createElement("li");
  emptyColumn.className = "empty";
  emptyColumn.textContent = "Появятся после загрузки файла.";
  ui.columnList.replaceChildren(emptyColumn);

  ui.previewHead.replaceChildren();
  const emptyRow = document.createElement("tr");
  const emptyCell = document.createElement("td");
  emptyCell.className = "empty";
  emptyCell.textContent = "Таблица пуста, пока не выбран файл.";
  emptyRow.append(emptyCell);
  ui.previewBody.replaceChildren(emptyRow);
  resetStats();
  resetCharts();
  resetFilter();
}

function resetFilter() {
  sourceDataset = null;
  if (!ui.filters) {
    return;
  }
  ui.filters.hidden = true;
  ui.filterColumn.replaceChildren();
  ui.filterValue.replaceChildren();
  ui.filterColumn.disabled = true;
  ui.filterValue.disabled = true;
  ui.filterNote.textContent = "";
}

function resetStats() {
  if (!ui.stats) {
    return;
  }
  const empty = document.createElement("article");
  empty.className = "empty";
  empty.textContent = "Числовые и категориальные сводки появятся после загрузки.";
  ui.stats.replaceChildren(empty);
}

let sourceDataset = null;
let currentDataset = null;
const charts = { hist: null, bar: null, scatter: null };
const BAR_LIMIT = 12;
const BAR_LABEL_LIMIT = 18;
const BAR_TYPES = {
  "bar-h": { chart: "bar", axis: "y" },
  bar: { chart: "bar", axis: "x" },
  line: { chart: "line" },
  area: { chart: "line", fill: true },
  pie: { chart: "pie", legend: true, multi: true },
  doughnut: { chart: "doughnut", legend: true, multi: true },
  polarArea: { chart: "polarArea", legend: true, multi: true, radial: true },
  radar: { chart: "radar", radial: true },
  scatter: { chart: "scatter", points: true },
  bubble: { chart: "bubble", points: true },
};
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function syncThemeButton() {
  if (!themeButton) {
    return;
  }
  const dark = document.documentElement.dataset.theme !== "light";
  themeButton.textContent = dark ? "Светлая тема" : "Тёмная тема";
  themeButton.setAttribute("aria-pressed", dark ? "true" : "false");
}

function applyChartTheme() {
  if (typeof Chart === "undefined") {
    return;
  }
  if (typeof ChartDataLabels !== "undefined") {
    Chart.unregister(ChartDataLabels);
  }
  Chart.defaults.font.family = '"Segoe UI", system-ui, sans-serif';
  Chart.defaults.color = cssVar("--muted");
}

function renderCharts(dataset, resetSelections) {
  currentDataset = dataset;
  if (!ui.histColumn) {
    return;
  }
  const numbers = dataset.columns.filter((column) => column.type === "number");
  const categories = dataset.columns.filter((column) => column.type === "categorical");
  const previous = {
    hist: ui.histColumn.value,
    bar: ui.barColumn.value,
    x: ui.scatterX.value,
    y: ui.scatterY.value,
  };
  fillSelect(ui.histColumn, numbers, "Нет числовых столбцов");
  fillSelect(ui.barColumn, categories, "Нет категориальных столбцов");
  fillSelect(ui.scatterX, numbers, "Нет числовых столбцов");
  fillSelect(ui.scatterY, numbers, "Нет числовых столбцов");
  if (resetSelections) {
    preferOption(ui.histColumn, "Цена");
    preferOption(ui.barColumn, "Категория");
    preferOption(ui.scatterX, "Цена");
    preferOption(ui.scatterY, "Количество продано");
    if (ui.scatterY.value === ui.scatterX.value && numbers.length > 1) {
      ui.scatterY.selectedIndex = ui.scatterX.selectedIndex === 0 ? 1 : 0;
    }
  } else {
    preferOption(ui.histColumn, previous.hist);
    preferOption(ui.barColumn, previous.bar);
    preferOption(ui.scatterX, previous.x);
    preferOption(ui.scatterY, previous.y);
  }
  renderHistogram();
  renderBar();
  renderScatter();
}

function resetCharts() {
  currentDataset = null;
  destroyChart("hist");
  destroyChart("bar");
  destroyChart("scatter");
  if (!ui.histColumn) {
    return;
  }
  fillSelect(ui.histColumn, [], "Нет числовых столбцов");
  fillSelect(ui.barColumn, [], "Нет категориальных столбцов");
  fillSelect(ui.scatterX, [], "Нет числовых столбцов");
  fillSelect(ui.scatterY, [], "Нет числовых столбцов");
  showChartMessage(ui.histMessage, ui.histCanvas, "Гистограмма появится после загрузки числового столбца.");
  showChartMessage(ui.barMessage, ui.barCanvas, "Столбчатая диаграмма появится после загрузки категориального столбца.");
  showChartMessage(ui.scatterMessage, ui.scatterCanvas, "Диаграмма рассеяния появится после загрузки числовых столбцов.");
}

function fillSelect(select, columns, emptyLabel) {
  select.replaceChildren();
  if (columns.length === 0) {
    const option = document.createElement("option");
    option.textContent = emptyLabel;
    select.append(option);
    select.disabled = true;
    return;
  }
  columns.forEach((column) => {
    const option = document.createElement("option");
    option.value = column.name;
    option.textContent = column.name;
    select.append(option);
  });
  select.disabled = false;
}

function preferOption(select, name) {
  if ([...select.options].some((option) => option.value === name)) {
    select.value = name;
  }
}

function renderHistogram() {
  if (!ui.histCanvas) {
    return;
  }
  const column = currentDataset && columnByName(ui.histColumn.value);
  if (!column || ui.histColumn.disabled) {
    destroyChart("hist");
    showChartMessage(ui.histMessage, ui.histCanvas, "Нет числового столбца для гистограммы.");
    return;
  }
  const bins = histogramBins(column.values);
  if (bins.counts.length === 0) {
    destroyChart("hist");
    showChartMessage(ui.histMessage, ui.histCanvas, "В столбце нет числовых значений.");
    return;
  }
  if (!showChartCanvas(ui.histMessage, ui.histCanvas)) {
    return;
  }
  const histogram = chartOptions(`Распределение: ${column.name}`, column.name, "Количество", "y");
  histogram.scales.x.ticks = {
    maxRotation: 0,
    autoSkip: true,
    maxTicksLimit: 6,
    color: cssVar("--muted"),
  };
  mountChart("hist", ui.histCanvas, {
    type: "bar",
    data: {
      labels: bins.labels,
      datasets: [{
        data: bins.counts,
        backgroundColor: cssVar("--chart-fill"),
        borderColor: cssVar("--chart-border"),
        borderWidth: 1,
      }],
    },
    options: histogram,
  });
}

function renderBar() {
  if (!ui.barCanvas) {
    return;
  }
  const column = currentDataset && columnByName(ui.barColumn.value);
  if (!column || ui.barColumn.disabled) {
    destroyChart("bar");
    showChartMessage(ui.barMessage, ui.barCanvas, "Нет категориального столбца для диаграммы.");
    return;
  }
  const summary = categoricalSummary(column.values, BAR_LIMIT);
  if (summary.top.length === 0) {
    destroyChart("bar");
    showChartMessage(ui.barMessage, ui.barCanvas, "В столбце нет значений.");
    return;
  }
  if (!showChartCanvas(ui.barMessage, ui.barCanvas)) {
    return;
  }
  const labels = summary.top.map(([value]) => value);
  const counts = summary.top.map(([, count]) => count);
  const kind = barChartKind();
  const title = summary.unique > summary.top.length
    ? `Частоты: ${column.name} (топ-${summary.top.length} из ${summary.unique})`
    : `Частоты: ${column.name}`;
  const frame = ui.barCanvas.parentElement;
  frame.classList.toggle("with-legend", Boolean(kind.legend));
  frame.style.height = kind.legend ? `${200 + labels.length * 22}px` : "";
  mountChart("bar", ui.barCanvas, {
    type: kind.chart,
    plugins: typeof ChartDataLabels === "undefined" ? [] : [ChartDataLabels],
    data: categoryChartData(kind, labels, counts),
    options: categoryChartOptions(kind, title, column.name, labels),
  });
}

function barChartKind() {
  const value = ui.barType && ui.barType.value;
  return BAR_TYPES[value] || BAR_TYPES["bar-h"];
}

function categoryChartData(kind, labels, counts) {
  const percentText = percentTexts(counts);
  if (kind.points) {
    const max = Math.max(...counts);
    const room = Math.max(5, Math.min(14, 72 / Math.max(counts.length, 1)));
    return {
      datasets: [{
        data: counts.map((count, index) => {
          const point = { x: index, y: count, label: labels[index] };
          if (kind.chart === "bubble") {
            point.r = 3 + (count / max) * room;
          }
          return point;
        }),
        percentText,
        backgroundColor: cssVar("--chart-fill"),
        borderColor: cssVar("--chart-border"),
        borderWidth: 1,
      }],
    };
  }
  return {
    labels,
    datasets: [{
      data: counts,
      percentText,
      backgroundColor: kind.multi ? sliceColors(counts.length) : cssVar("--chart-fill"),
      borderColor: kind.multi ? cssVar("--surface") : cssVar("--chart-border"),
      borderWidth: kind.chart === "line" ? 2 : 1,
      pointBackgroundColor: cssVar("--chart-border"),
      pointRadius: kind.chart === "line" ? 3 : undefined,
      fill: Boolean(kind.fill),
      tension: kind.chart === "line" ? 0.3 : 0,
    }],
  };
}

function percentTexts(counts) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) {
    return counts.map(() => "0%");
  }
  const exact = counts.map((count) => (count * 100) / total);
  const whole = exact.map((value) => Math.floor(value));
  let left = 100 - whole.reduce((sum, value) => sum + value, 0);
  exact
    .map((value, index) => ({ index, rest: value - whole[index] }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index)
    .forEach((item) => {
      if (left > 0) {
        whole[item.index] += 1;
        left -= 1;
      }
    });
  return whole.map((value, index) => (value === 0 && exact[index] > 0 ? "<1%" : `${value}%`));
}

function percentLayout(kind) {
  if (kind.chart === "pie" || kind.chart === "doughnut") {
    return { padding: 8 };
  }
  if (kind.chart === "radar") {
    return { padding: 18 };
  }
  if (kind.chart === "polarArea") {
    return { padding: 8 };
  }
  if (kind.axis === "y") {
    return { padding: { right: 40 } };
  }
  return { padding: { top: 18 } };
}

function percentLabelOptions(kind) {
  let anchor = "end";
  let align = "end";
  let offset = 4;
  if (kind.chart === "pie" || kind.chart === "doughnut" || kind.chart === "polarArea") {
    anchor = "center";
    align = "center";
    offset = 0;
  } else if (kind.axis === "y") {
    align = "right";
    offset = 6;
  } else if (kind.chart === "bar") {
    align = "top";
    offset = 2;
  } else if (kind.chart === "radar") {
    anchor = "center";
    align = "start";
    offset = 16;
  } else if (kind.chart === "line" || kind.points) {
    anchor = "center";
    align = "top";
    offset = kind.points ? 10 : 8;
  }
  return {
    color: cssVar("--ink"),
    backgroundColor: cssVar("--surface"),
    borderRadius: 4,
    padding: { top: 2, right: 4, bottom: 2, left: 4 },
    font: { size: 11, weight: 600 },
    display: kind.chart !== "radar",
    clamp: true,
    clip: false,
    anchor,
    align,
    offset,
    formatter(_value, context) {
      const texts = context.dataset.percentText || [];
      return texts[context.dataIndex] || "";
    },
  };
}

function categoryChartOptions(kind, title, columnName, labels) {
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: percentLayout(kind),
    plugins: {
      legend: legendConfig(kind),
      datalabels: percentLabelOptions(kind),
      title: {
        display: true,
        text: title,
        color: cssVar("--ink"),
        font: { size: 14, weight: 600 },
        padding: { bottom: kind.chart === "bubble" ? 20 : 10 },
      },
      tooltip: {
        callbacks: {
          title(items) {
            const item = items[0];
            if (!item) {
              return "";
            }
            return item.raw && item.raw.label ? item.raw.label : item.label;
          },
          label(item) {
            const count = categoryCount(item, kind);
            const percent = item.dataset.percentText && item.dataset.percentText[item.dataIndex];
            return percent ? `Количество: ${count} (${percent})` : `Количество: ${count}`;
          },
        },
      },
    },
  };
  if (kind.legend && !kind.radial) {
    return options;
  }
  if (kind.radial) {
    options.scales = {
      r: {
        beginAtZero: true,
        grid: { color: cssVar("--line") },
        angleLines: { color: cssVar("--line") },
        ticks: {
          color: cssVar("--muted"),
          backdropColor: "transparent",
          precision: 0,
        },
      },
    };
    if (kind.chart === "radar") {
      options.scales.r.pointLabels = {
        color: cssVar("--muted"),
        callback(value, index) {
          const dataset = this.chart.data.datasets[0] || {};
          const percent = (dataset.percentText || [])[index] || "";
          return `${shortenLabel(value, BAR_LABEL_LIMIT)} ${percent}`.trim();
        },
      };
    }
    return options;
  }
  const countOnX = kind.axis === "y";
  options.scales = {
    x: axisScale(countOnX ? "Количество" : columnName, countOnX),
    y: axisScale(countOnX ? columnName : "Количество", !countOnX),
  };
  if (countOnX) {
    options.indexAxis = "y";
    options.scales.y.ticks.callback = function shortenTick(value) {
      return shortenLabel(this.getLabelForValue(value), BAR_LABEL_LIMIT);
    };
    // Подпись оси рисуется слева от названий. Без запаса длинные подписи заходят на неё.
    options.scales.y.afterFit = (scale) => {
      scale.width += 28;
    };
    return options;
  }
  if (kind.chart === "bubble") {
    options.scales.y.grace = "20%";
    options.scales.x.grace = "18%";
  }
  if (kind.points) {
    options.scales.x.beginAtZero = false;
    options.scales.x.ticks.precision = 0;
    options.scales.x.ticks.stepSize = 1;
    options.scales.x.ticks.callback = (value) => {
      const label = labels[value];
      return label ? shortenLabel(label, BAR_LABEL_LIMIT) : "";
    };
  } else {
    options.scales.x.ticks.callback = function shortenTick(value) {
      return shortenLabel(this.getLabelForValue(value), BAR_LABEL_LIMIT);
    };
  }
  options.scales.x.ticks.maxRotation = 0;
  options.scales.x.ticks.autoSkip = true;
  return options;
}

function categoryCount(item, kind) {
  if (kind.points) {
    return item.parsed.y;
  }
  if (kind.radial) {
    return item.parsed.r;
  }
  if (kind.legend) {
    return item.raw;
  }
  return kind.axis === "y" ? item.parsed.x : item.parsed.y;
}

function legendConfig(kind) {
  if (!kind.legend) {
    return { display: false };
  }
  return {
    display: true,
    position: "bottom",
    labels: {
      color: cssVar("--muted"),
      boxWidth: 10,
      padding: 8,
      font: { size: 11 },
      generateLabels(chart) {
        const dataset = chart.data.datasets[0] || {};
        const colors = dataset.backgroundColor;
        const percents = dataset.percentText || [];
        return (chart.data.labels || []).map((label, index) => ({
          text: `${shortenLabel(label, BAR_LABEL_LIMIT)} ${percents[index] || ""}`.trim(),
          fillStyle: Array.isArray(colors) ? colors[index] : colors,
          strokeStyle: Array.isArray(dataset.borderColor) ? dataset.borderColor[index] : dataset.borderColor,
          fontColor: cssVar("--muted"),
          hidden: chart.getDataVisibility(index) === false,
          index,
          datasetIndex: 0,
        }));
      },
    },
  };
}

function sliceColors(count) {
  const green = parseCssColor(cssVar("--chart-border"));
  const ink = parseCssColor(cssVar("--ink"));
  const muted = parseCssColor(cssVar("--muted"));
  const line = parseCssColor(cssVar("--line"));
  const mixes = [
    [green, ink, 0],
    [green, ink, 0.42],
    [green, muted, 0.35],
    [green, ink, 0.7],
    [muted, green, 0.3],
    [green, line, 0.45],
    [ink, green, 0.32],
    [green, muted, 0.62],
    [muted, ink, 0.15],
    [green, ink, 0.18],
    [line, green, 0.5],
    [ink, muted, 0.2],
  ];
  return Array.from({ length: count }, (_, index) => {
    const [from, to, amount] = mixes[index % mixes.length];
    const rgb = from.map((channel, channelIndex) => Math.round(channel + (to[channelIndex] - channel) * amount));
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  });
}

function parseCssColor(value) {
  const hex = String(value).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }
  return [15, 110, 86];
}

function shortenLabel(text, limit) {
  const value = String(text);
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit).trimEnd()}…`;
}

function renderScatter() {
  if (!ui.scatterCanvas) {
    return;
  }
  const xColumn = currentDataset && columnByName(ui.scatterX.value);
  const yColumn = currentDataset && columnByName(ui.scatterY.value);
  if (!xColumn || !yColumn || ui.scatterX.disabled) {
    destroyChart("scatter");
    showChartMessage(ui.scatterMessage, ui.scatterCanvas, "Нет числовых столбцов для диаграммы рассеяния.");
    return;
  }
  const xIndex = currentDataset.columns.indexOf(xColumn);
  const yIndex = currentDataset.columns.indexOf(yColumn);
  const points = currentDataset.rows.flatMap((row) => {
    if (isMissing(row[xIndex]) || isMissing(row[yIndex])) {
      return [];
    }
    return [{ x: parseNumber(row[xIndex]), y: parseNumber(row[yIndex]) }];
  });
  if (points.length === 0) {
    destroyChart("scatter");
    showChartMessage(ui.scatterMessage, ui.scatterCanvas, "Нет пар чисел для диаграммы рассеяния.");
    return;
  }
  if (!showChartCanvas(ui.scatterMessage, ui.scatterCanvas)) {
    return;
  }
  mountChart("scatter", ui.scatterCanvas, {
    type: "scatter",
    data: {
      datasets: [{
        data: points,
        backgroundColor: cssVar("--chart-fill"),
      }],
    },
    options: chartOptions(`${yColumn.name} и ${xColumn.name}`, xColumn.name, yColumn.name),
  });
}

function chartOptions(title, xTitle, yTitle, countAxis) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: title,
        color: cssVar("--ink"),
        font: { size: 14, weight: 600 },
      },
    },
    scales: {
      x: axisScale(xTitle, countAxis === "x"),
      y: axisScale(yTitle, countAxis === "y"),
    },
  };
}

function axisScale(title, fromZero) {
  return {
    title: { display: true, text: title, color: cssVar("--ink") },
    beginAtZero: fromZero,
    grid: { color: cssVar("--line") },
    ticks: fromZero ? { precision: 0, color: cssVar("--muted") } : { color: cssVar("--muted") },
  };
}

function showChartMessage(message, canvas, text) {
  if (!message || !canvas) {
    return;
  }
  message.hidden = false;
  message.textContent = text;
  canvas.parentElement.hidden = true;
  canvas.parentElement.classList.remove("with-legend");
  canvas.parentElement.style.height = "";
}

function showChartCanvas(message, canvas) {
  if (typeof Chart === "undefined") {
    showChartMessage(message, canvas, "Не удалось загрузить библиотеку графиков.");
    return false;
  }
  message.hidden = true;
  canvas.parentElement.hidden = false;
  return true;
}

function mountChart(key, canvas, config) {
  destroyChart(key);
  charts[key] = new Chart(canvas, config);
}

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

function columnByName(name) {
  return currentDataset.columns.find((column) => column.name === name);
}

// Chart.js не рисует гистограмму сам: интервалы считаются здесь и показываются столбцами.
function histogramBins(values) {
  const numbers = values.filter((value) => !isMissing(value)).map(parseNumber);
  if (numbers.length === 0) {
    return { labels: [], counts: [] };
  }
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  if (min === max) {
    return { labels: [formatNumber(min)], counts: [numbers.length] };
  }
  const binCount = Math.min(10, Math.max(4, Math.ceil(Math.log2(numbers.length)) + 1));
  const width = (max - min) / binCount;
  const counts = Array(binCount).fill(0);
  numbers.forEach((value) => {
    let index = Math.floor((value - min) / width);
    if (index >= binCount) {
      index = binCount - 1;
    }
    counts[index] += 1;
  });
  const labels = counts.map((_, index) => {
    const start = min + index * width;
    const end = index === binCount - 1 ? max : min + (index + 1) * width;
    return `${formatBinEdge(start, width)}–${formatBinEdge(end, width)}`;
  });
  return { labels, counts };
}

window.inspectCsvBytes = inspectCsvBytes;
window.summarizeColumn = summarizeColumn;
window.histogramBins = histogramBins;
