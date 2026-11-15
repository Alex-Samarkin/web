"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LoginState } from "./types";

/**
 * Вход по адресу и паролю.
 *
 * Cookie сеанса записываются на сервере. Сообщение об ошибке общее:
 * оно не раскрывает, существует ли указанный адрес.
 */
export async function signInAction(
  _previousState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Укажите адрес электронной почты и пароль." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Неверный адрес или пароль. Проверьте данные и повторите вход." };
  }

  // ВРЕМЕННО (этап 3.3): разделы по ролям появятся на этапе 3.4,
  // поэтому переход выполняется на диагностическую страницу.
  // На этапе 3.4 эта строка заменяется переходом по ROLE_HOME.
  redirect("/diag");
}