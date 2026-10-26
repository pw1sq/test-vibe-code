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
      if (result.rows !== 20) {
        problems.push(`строк ${result.rows}, ожидалось 20`);
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
      const population = result.dataset.columns.find((column) => column.name === "Жители");
      if (!population || population.type !== "number") {
        problems.push("столбец «Жители» должен быть числовым");
      }
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
