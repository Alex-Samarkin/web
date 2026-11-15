/**
 * Роли приложения. Перечень соответствует перечислению public.user_role в БД.
 * Модуль используется и сервером, и браузером, поэтому не содержит
 * серверных зависимостей.
 */

export const APP_ROLES = [
  "admin",
  "doctor",
  "patient",
  "hr_manager",
  "patient_manager",
  "lab_manager",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Проверка значения, полученного из базы данных. */
export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

/** Наименования ролей для интерфейса. */
export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Администратор",
  doctor: "Врач",
  patient: "Пациент",
  hr_manager: "Менеджер персонала",
  patient_manager: "Менеджер пациентов",
  lab_manager: "Лаборант",
};

/** Раздел по умолчанию для каждой роли. */
export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/admin",
  doctor: "/doctor",
  patient: "/patient",
  hr_manager: "/hr",
  patient_manager: "/patients-manager",
  lab_manager: "/lab",
};

/** Краткое описание доступных данных. Соответствует матрице доступа ТЗ. */
export const ROLE_ACCESS_SUMMARY: Record<AppRole, string> = {
  admin:
    "Сопоставление врачей и пациентов. Доступны только фамилии; персональные данные и анализы закрыты.",
  doctor:
    "Полные карточки назначенных пациентов и их анализы. Только чтение.",
  patient:
    "Собственные личные данные. Анализы и сведения о лечащем враче недоступны.",
  hr_manager: "Управление справочником врачей. Раздел в разработке.",
  patient_manager: "Управление данными пациентов. Раздел в разработке.",
  lab_manager: "Управление результатами анализов. Раздел в разработке.",
};

/**
 * Маршрут раздела по роли. При отсутствии профиля пользователь направляется
 * на страницу отказа с указанием причины.
 */
export function homeRouteForRole(role: AppRole | null | undefined): string {
  return role ? ROLE_HOME[role] : "/denied?reason=profile";
}