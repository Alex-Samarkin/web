import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  role: "Раздел недоступен для вашей роли.",
  profile: "Для учётной записи не задан профиль. Обратитесь к администратору.",
};

/**
 * Сообщение об отсутствии прав. Проверка requireRole здесь не применяется:
 * при отсутствии профиля это привело бы к бесконечному перенаправлению.
 *
 * В Next.js 15 параметр searchParams асинхронный.
 */
export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const context = await getAuthContext();
  if (!context) redirect("/login");

  const { reason } = await searchParams;
  const message = REASONS[reason ?? ""] ?? "Доступ к запрошенному разделу запрещён.";

  return (
    <main className="container">
      <div className="card auth-card">
        <h1>Недостаточно прав</h1>
        <div className="notice notice--error">{message}</div>

        <p>
          Пользователь: <strong>{context.displayName}</strong>
          <br />
          Роль:{" "}
          <span className="badge">
            {context.profile ? ROLE_LABELS[context.profile.role] : "не определена"}
          </span>
        </p>

        <div className="row">
          <Link className="btn btn--secondary" href="/">
            На главную
          </Link>
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}