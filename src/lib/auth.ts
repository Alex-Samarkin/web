import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAppRole, type AppRole } from "@/lib/roles";

/** Профиль из таблицы app_users. */
export type UserProfile = {
  role: AppRole;
  doctorId: string | null;
  patientId: string | null;
};

export type AuthContext = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  email: string;
  profile: UserProfile | null;
  displayName: string;
};

/** Фамилия и инициалы; отчество может отсутствовать. */
function shortName(last: string, first: string, middle: string | null): string {
  const initials = [first, middle]
    .filter((part): part is string => Boolean(part))
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(" ");
  return `${last} ${initials}`.trim();
}

/**
 * Текущий сеанс и профиль. Возвращает null, если вход не выполнен.
 *
 * cache() обеспечивает однократное выполнение в пределах одного запроса:
 * макет, шапка и страница получают один и тот же результат.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createSupabaseServerClient();

  // getUser() проверяет токен на сервере аутентификации.
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const email = user.email ?? "";

  // Профиль читается политикой «собственная строка» (этап 2.4).
  const { data: profileRow } = await supabase
    .from("app_users")
    .select("role, doctor_id, patient_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile: UserProfile | null =
    profileRow && isAppRole(profileRow.role)
      ? {
          role: profileRow.role,
          doctorId: profileRow.doctor_id ?? null,
          patientId: profileRow.patient_id ?? null,
        }
      : null;

  // Врач и пациент читают собственную запись справочника.
  // Для остальных ролей справочники закрыты, поэтому показывается адрес.
  let displayName = email || "пользователь";

  if (profile?.role === "doctor" && profile.doctorId) {
    const { data } = await supabase
      .from("doctors")
      .select("last_name, first_name, middle_name")
      .eq("id", profile.doctorId)
      .maybeSingle();
    if (data) displayName = shortName(data.last_name, data.first_name, data.middle_name);
  }

  if (profile?.role === "patient" && profile.patientId) {
    const { data } = await supabase
      .from("patients")
      .select("last_name, first_name, middle_name")
      .eq("id", profile.patientId)
      .maybeSingle();
    if (data) displayName = shortName(data.last_name, data.first_name, data.middle_name);
  }

  return { supabase, userId: user.id, email, profile, displayName };
});

/**
 * Допуск к разделу. Применяется в серверных компонентах страниц.
 * redirect() прерывает выполнение, поэтому вызов не помещается в try/catch.
 */
export async function requireRole(
  allowedRoles: readonly AppRole[]
): Promise<AuthContext & { profile: UserProfile }> {
  const context = await getAuthContext();

  if (!context) redirect("/login");
  if (!context.profile) redirect("/denied?reason=profile");
  if (!allowedRoles.includes(context.profile.role)) redirect("/denied?reason=role");

  return { ...context, profile: context.profile };
}