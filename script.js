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
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    }
    if (!inQuotes && (char === "\n" || char === "\r")) {
      break;
    }
    line += char;
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

function isNumber(value) {
  const compact = value.trim().replace(/\s/g, "");
  const normalized = compact.includes(",") && !compact.includes(".")
    ? compact.replace(",", ".")
    : compact;
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized);
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
  const compact = value.trim().replace(/\s/g, "");
  const normalized = compact.includes(",") && !compact.includes(".")
    ? compact.replace(",", ".")
    : compact;
  return Number(normalized);
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

function render(dataset) {
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
  renderStats(dataset);
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

window.inspectCsvBytes = inspectCsvBytes;
window.summarizeColumn = summarizeColumn;
