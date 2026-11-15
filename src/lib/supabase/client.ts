import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from "@/lib/env";

/**
 * Клиент для клиентских компонентов ("use client").
 *
 * Использует тот же публичный ключ и тот же cookie-сеанс, что и серверный
 * клиент, поэтому права пользователя совпадают на сервере и в браузере.
 * Секретных значений здесь нет: публичный ключ не является секретом (ТЗ, S5).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
}