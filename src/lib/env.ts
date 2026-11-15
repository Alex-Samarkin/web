/**
 * Проверка параметров подключения к удалённому Supabase.
 *
 * Значения задаются в web/.env.local (локально) и в настройках Vercel (этап 4).
 * Здесь допускаются только публичные переменные: они попадают в браузер.
 * Секретный ключ в приложении не используется (ТЗ, S4).
 */

// Обращения записаны буквально: сборщик подставляет значения по имени.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublicKey) {
  throw new Error(
    "Не заданы NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Заполните web/.env.local (этап 3.1, шаг 3.1.7) и перезапустите сервер."
  );
}

// Стенд работает только с облачным проектом: локальный стек не предусмотрен.
if (/localhost|127\.0\.0\.1|:54321/i.test(supabaseUrl)) {
  throw new Error(
    "Указан локальный адрес Supabase. Требуется адрес облачного проекта вида https://<ref>.supabase.co."
  );
}

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_PUBLIC_KEY = supabasePublicKey;

/** Хост проекта для отображения в диагностике; ключ не выводится. */
export const SUPABASE_HOST = new URL(supabaseUrl).host;