const SAMPLE_TYPES = [
  ["Идентификатор", "number"],
  ["Наименование продукта", "categorical"],
  ["Категория", "categorical"],
  ["Цена", "number"],
  ["Количество продано", "number"],
  ["Дата продажи", "date"],
  ["Регион", "categorical"],
  ["Рейтинг", "number"],
];

const cases = [
  {
    file: "csv/sample_data.csv",
    title: "Выборка открывается",
    check(result) {
      const problems = [];
      if (!result.ok) {
        return [result.error || "файл не разобран"];
      }
      if (result.rows !== 100) {
        problems.push(`строк ${result.rows}, ожидалось 100`);
      }
      if (result.columns !== 8) {
        problems.push(`столбцов ${result.columns}, ожидалось 8`);
      }
      if (result.missing !== 0) {
        problems.push(`пропусков ${result.missing}, ожидалось 0`);
      }
      if (result.warnings) {
        problems.push(result.warnings);
      }
      const actual = result.types.map((column) => `${column.name}: ${column.type}`).join(", ");
      const expected = SAMPLE_TYPES.map(([name, type]) => `${name}: ${type}`).join(", ");
      if (actual !== expected) {
        problems.push(`типы «${actual}», ожидалось «${expected}»`);
      }
      problems.push(...expectNumberSummary(result, "Цена", {
        mean: 179.33,
        median: 64.99,
        min: 14.99,
        max: 1299.99,
        stdev: 272.99,
        missing: 0,
      }));
      problems.push(...expectCategory(result, "Категория", 5, ["Электроника — 22"]));
      problems.push(...expectDate(result, "Дата продажи", "2023-01-15", "2023-04-25"));
      const priceColumn = result.dataset.columns.find((column) => column.name === "Цена");
      const bins = window.histogramBins(priceColumn.values);
      const binTotal = bins.counts.reduce((sum, count) => sum + count, 0);
      const lastLabel = bins.labels[bins.labels.length - 1] || "";
      if (binTotal !== 100 || !bins.labels[0].startsWith("15") || !lastLabel.endsWith("1300")) {
        problems.push(`гистограмма цены: ${bins.labels.join(", ")} / ${binTotal}`);
      }
      return problems;
    },
  },
  {
    file: "csv/пропуски.csv",
    title: "Пропуски считаются",
    check(result) {
      const problems = [];
      if (!result.ok) {
        return [result.error || "файл не разобран"];
      }
      if (result.rows !== 3) {
        problems.push(`строк ${result.rows}, ожидалось 3`);
      }
      if (result.missing !== 7) {
        problems.push(`пропусков ${result.missing}, ожидалось 7`);
      }
      const byColumn = Object.fromEntries(result.dataset.columns.map((column) => [column.name, column.missing]));
      const expectedMissing = {
        "Идентификатор": 0,
        "Наименование продукта": 1,
        "Категория": 0,
        "Цена": 1,
        "Количество продано": 1,
        "Дата продажи": 1,
        "Регион": 1,
        "Рейтинг": 2,
      };
      Object.entries(expectedMissing).forEach(([name, count]) => {
        if (byColumn[name] !== count) {
          problems.push(`в «${name}» пропусков ${byColumn[name]}, ожидалось ${count}`);
        }
      });
      const actual = result.types.map((column) => `${column.name}: ${column.type}`).join(", ");
      const expected = SAMPLE_TYPES.map(([name, type]) => `${name}: ${type}`).join(", ");
      if (actual !== expected) {
        problems.push(`типы «${actual}», ожидалось «${expected}»`);
      }
      if (result.warnings) {
        problems.push(result.warnings);
      }
      problems.push(...expectNumberSummary(result, "Цена", {
        mean: 514.99,
        median: 514.99,
        min: 129.99,
        max: 899.99,
        missing: 1,
      }));
      problems.push(...expectNumberSummary(result, "Рейтинг", {
        mean: 4.5,
        median: 4.5,
        min: 4.5,
        max: 4.5,
        stdev: null,
        missing: 2,
      }));
      return problems;
    },
  },
  {
    file: "csv/пустой.csv",
    title: "Пустой файл",
    check(result) {
      return result.ok || result.error !== "Файл пустой."
        ? [`сообщение «${result.error || "нет"}», ожидалось «Файл пустой.»`]
        : [];
    },
  },
  {
    file: "csv/незакрытая_кавычка.csv",
    title: "Незакрытая кавычка",
    check(result) {
      const expected = "Не удалось разобрать CSV: в файле не закрыта кавычка.";
      return result.error === expected
        ? []
        : [`сообщение «${result.error || "нет"}», ожидалось «${expected}»`];
    },
  },
  {
    file: "csv/картинка.png",
    title: "Картинка не считается CSV",
    check(result) {
      return result.ok || result.error !== "Файл не похож на CSV."
        ? [`сообщение «${result.error || "нет"}», ожидалось «Файл не похож на CSV.»`]
        : [];
    },
  },
  {
    file: "csv/битая_строка.csv",
    title: "Строка с лишним столбцом",
    check(result) {
      const expected = "Не удалось разобрать CSV: в строке 3 3 столбцов, в заголовке 2.";
      return result.error === expected
        ? []
        : [`сообщение «${result.error || "нет"}», ожидалось «${expected}»`];
    },
  },
  {
    file: "csv/текст_вместо_числа.csv",
    title: "Текст вместо числа",
    check(result) {
      const problems = [];
      if (!result.ok) {
        return [result.error || "файл не разобран"];
      }
      const price = result.dataset.columns.find((column) => column.name === "Цена");
      const count = result.dataset.columns.find((column) => column.name === "Количество");
      if (!price || price.type !== "categorical" || !price.mixed) {
        problems.push("столбец «Цена» должен стать категориальной из-за текста");
      }
      if (!count || count.type !== "number") {
        problems.push("столбец «Количество» должен остаться числовым");
      }
      const expected = "В столбце «Цена» есть текст вместо числа, поэтому он отмечен как категориальный.";
      if (result.warnings !== expected) {
        problems.push(`сообщение «${result.warnings || "нет"}», ожидалось «${expected}»`);
      }
      return problems;
    },
  },
  {
    file: "csv/только_категории.csv",
    title: "Файл без числовых столбцов",
    check(result) {
      const problems = [];
      if (!result.ok) {
        return [result.error || "файл не разобран"];
      }
      if (result.rows !== 2 || result.columns !== 2) {
        problems.push(`размер ${result.rows}×${result.columns}, ожидалось 2×2`);
      }
      if (result.types.some((column) => column.type === "number")) {
        problems.push("в файле не должно быть числовых столбцов");
      }
      const expected = "В файле нет числовых столбцов. Сводка и таблица показаны, графики по числам построить нельзя.";
      if (result.warnings !== expected) {
        problems.push(`сообщение «${result.warnings || "нет"}», ожидалось «${expected}»`);
      }
      return problems;
    },
  },
  {
    file: "csv/точка_с_запятой.csv",
    title: "Разделитель точка с запятой",
    check(result) {
      const problems = [];
      if (!result.ok) {
        return [result.error || "файл не разобран"];
      }
      if (result.rows !== 2 || result.columns !== 2) {
        problems.push(`размер ${result.rows}×${result.columns}, ожидалось 2×2`);
      }
      if (result.dataset.rows[1][0] !== "Париж") {
        problems.push(`город «${result.dataset.rows[1][0]}», ожидалось «Париж»`);
      }
      problems.push(...expectNumberSummary(result, "Жители", {
        mean: 150.25,
        median: 150.25,
        min: 100,
        max: 200.5,
        missing: 0,
      }));
      return problems;
    },
  },
  {
    file: "csv/кавычки.csv",
    title: "Запятая внутри кавычек",
    check(result) {
      const problems = [];
      if (!result.ok) {
        return [result.error || "файл не разобран"];
      }
      if (result.columns !== 3 || result.rows !== 2) {
        problems.push(`размер ${result.rows}×${result.columns}, ожидалось 2×3`);
      }
      if (result.dataset.rows[0][1] !== "чай, кофе") {
        problems.push(`описание «${result.dataset.rows[0][1]}», ожидалось «чай, кофе»`);
      }
      if (result.dataset.rows[1][1] !== "Война и мир") {
        problems.push(`описание «${result.dataset.rows[1][1]}», ожидалось «Война и мир»`);
      }
      if (result.warnings) {
        problems.push(result.warnings);
      }
      return problems;
    },
  },
];

const summary = document.querySelector("#summary");
const results = document.querySelector("#results");

if (location.protocol === "file:") {
  summary.textContent = "Эти проверки читают файлы с сервера. Запустите py -3 -m http.server 8080 и откройте http://localhost:8080/tests.html";
} else {
  runCases();
}

async function runCases() {
  let passed = 0;
  for (const item of cases) {
    const outcome = await runCase(item);
    if (outcome.ok) {
      passed += 1;
    }
    results.append(renderCase(item, outcome));
  }
  summary.textContent = `${passed} из ${cases.length} пройдено`;
}

async function runCase(item) {
  try {
    const response = await fetch(item.file, { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, details: [`файл не найден: ${response.status}`] };
    }
    const bytes = await response.arrayBuffer();
    const problems = item.check(window.inspectCsvBytes(bytes));
    return { ok: problems.length === 0, details: problems };
  } catch (error) {
    return { ok: false, details: [error instanceof Error ? error.message : "Не удалось выполнить проверку."] };
  }
}

function expectNumberSummary(result, name, expected) {
  const column = result.dataset.columns.find((item) => item.name === name);
  if (!column) {
    return [`нет столбца «${name}»`];
  }
  const summary = window.summarizeColumn(column);
  return ["mean", "median", "min", "max", "stdev", "missing"].flatMap((key) => {
    if (!Object.prototype.hasOwnProperty.call(expected, key)) {
      return [];
    }
    const actual = key === "missing" ? summary.missing : round2(summary[key]);
    if (actual !== expected[key]) {
      return [`«${name}» ${key}: ${summary[key]}, ожидалось ${expected[key]}`];
    }
    return [];
  });
}

function expectCategory(result, name, unique, topStarts) {
  const column = result.dataset.columns.find((item) => item.name === name);
  const summary = window.summarizeColumn(column);
  const problems = [];
  if (summary.unique !== unique) {
    problems.push(`«${name}»: уникальных ${summary.unique}, ожидалось ${unique}`);
  }
  const labels = summary.top.map(([value, count]) => `${value} — ${count}`);
  topStarts.forEach((label, index) => {
    if (labels[index] !== label) {
      problems.push(`«${name}»: на месте ${index + 1} «${labels[index] || "пусто"}», ожидалось «${label}»`);
    }
  });
  return problems;
}

function expectDate(result, name, min, max) {
  const column = result.dataset.columns.find((item) => item.name === name);
  const summary = window.summarizeColumn(column);
  const problems = [];
  if (summary.min !== min) {
    problems.push(`«${name}»: минимум ${summary.min}, ожидалось ${min}`);
  }
  if (summary.max !== max) {
    problems.push(`«${name}»: максимум ${summary.max}, ожидалось ${max}`);
  }
  return problems;
}

function round2(value) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function renderCase(item, outcome) {
  const row = document.createElement("li");
  row.className = outcome.ok ? "pass" : "fail";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = `${outcome.ok ? "Пройден" : "Не пройден"}: ${item.title}`;
  row.append(title);
  const file = document.createElement("p");
  file.className = "hint";
  file.textContent = item.file;
  row.append(file);
  outcome.details.forEach((detail) => {
    const note = document.createElement("p");
    note.textContent = detail;
    row.append(note);
  });
  return row;
}
