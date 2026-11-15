import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from "@/lib/env";

/**
 * Продление сеанса.
 *
 * Токен доступа живёт ограниченное время; при обращении к серверу он
 * обновляется, и новые значения cookie записываются в ответ. Без этого слоя
 * серверные компоненты не смогут сохранять обновлённый сеанс.
 *
 * Проверка прав здесь не выполняется: она сосредоточена в страницах.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Сначала значения передаются дальше по цепочке запроса...
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        // ...затем закрепляются в ответе браузера.
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Обращение к серверу аутентификации инициирует обновление токена.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Служебные файлы и изображения исключаются: продление сеанса для них не нужно.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};