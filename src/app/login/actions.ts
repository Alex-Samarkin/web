"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { homeRouteForRole, isAppRole } from "@/lib/roles";
import type { LoginState } from "./types";

/**
 * Вход по адресу и паролю. Cookie сеанса записываются на сервере.
 * Сообщение об ошибке общее: оно не раскрывает, существует ли адрес.
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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Неверный адрес или пароль. Проверьте данные и повторите вход." };
  }

  // Роль читается из профиля тем же клиентом: сеанс уже установлен.
  const { data: profileRow } = await supabase
    .from("app_users")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  const role = profileRow?.role;
  redirect(homeRouteForRole(isAppRole(role) ? role : null));
}