import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from "@/lib/env";

/**
 * Клиент для серверных компонентов, серверных действий и обработчиков маршрутов.
 *
 * Сеанс хранится в cookie, поэтому каждый запрос к базе данных выполняется
 * с токеном пользователя, и политики RLS применяются на стороне базы данных.
 *
 * В Next.js 15 функция cookies() асинхронная — отсюда await.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      // Чтение всех cookie сеанса.
      getAll() {
        return cookieStore.getAll();
      },

      // Запись cookie возможна в серверных действиях и обработчиках маршрутов.
      // В серверных компонентах она запрещена — исключение подавляется:
      // продление сеанса выполняет промежуточный слой (этап 3.3).
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Намеренно пусто: компонент только читает данные.
        }
      },
    },
  });
}