import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Выход. Метод POST: изменение состояния не выполняется по ссылке GET.
 * Код 303 предписывает браузеру перейти на страницу входа методом GET.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}