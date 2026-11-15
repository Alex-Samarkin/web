/**
 * Проверка доступности удалённого проекта Supabase.
 * Запуск: npm run check:supabase   (из каталога web)
 *
 * Проверяется:
 *   1) доступность службы аутентификации по HTTPS;
 *   2) доступность REST-интерфейса и корректность запрета для анонимной роли.
 *
 * Ожидаемый результат: служба отвечает, данные анонимной роли недоступны.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(scriptDir, "..", ".env.local");

/** Простое чтение файла переменных окружения: строки вида КЛЮЧ=ЗНАЧЕНИЕ. */
function readEnvFile(path) {
  if (!existsSync(path)) {
    console.error(`[ОШИБКА] Не найден файл ${path}. Выполните шаг 3.1.7.`);
    process.exit(1);
  }
  const values = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const env = readEnvFile(envPath);
const projectUrl = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!projectUrl) {
  console.error("[ОШИБКА] В .env.local не задан NEXT_PUBLIC_SUPABASE_URL.");
  process.exit(1);
}
if (!publicKey) {
  console.error("[ОШИБКА] В .env.local не задан NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY или NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

if (/localhost|127\.0\.0\.1|:54321/i.test(projectUrl)) {
  console.error("[ОШИБКА] Указан локальный адрес. Стенд работает только с облачным проектом.");
  process.exit(1);
}

/** Обращение с ограничением времени ожидания. */
async function request(url) {
  return fetch(url, {
    headers: { apikey: publicKey },
    signal: AbortSignal.timeout(10000),
  });
}

async function main() {
  console.log(`Проект: ${new URL(projectUrl).host}`);

  // 1. Служба аутентификации.
  try {
    const response = await request(`${projectUrl}/auth/v1/health`);
    if (!response.ok) {
      console.error(`[ОШИБКА] Служба аутентификации ответила кодом ${response.status}.`);
      console.error("        Проверьте публичный ключ (шаг 3.1.7).");
      process.exit(1);
    }
    console.log("[ОК] Служба аутентификации доступна.");
  } catch (error) {
    console.error(`[ОШИБКА] Соединение не установлено: ${error.message}`);
    console.error("        Проверьте адрес проекта, доступ к сети и настройки прокси.");
    process.exit(1);
  }

  // 2. REST-интерфейс и закрытость данных для анонимной роли.
  try {
    const response = await request(`${projectUrl}/rest/v1/patients?select=id&limit=1`);
    if (response.status === 401 || response.status === 403) {
      console.log("[ОК] REST-интерфейс доступен, анонимной роли данные не выдаются.");
    } else if (response.ok) {
      console.error("[ОШИБКА] Анонимная роль получила данные. Проверьте этап 2.4 (привилегии и RLS).");
      process.exit(1);
    } else {
      console.error(`[ОШИБКА] Неожиданный ответ REST: ${response.status}.`);
      console.error(await response.text());
      process.exit(1);
    }
  } catch (error) {
    console.error(`[ОШИБКА] REST-интерфейс недоступен: ${error.message}`);
    process.exit(1);
  }

  console.log("\nИтог: удалённый проект доступен, параметры подключения заданы верно.");
}

main();
