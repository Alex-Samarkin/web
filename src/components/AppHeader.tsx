import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { ROLE_LABELS, homeRouteForRole } from "@/lib/roles";
import { SignOutButton } from "@/components/SignOutButton";

/**
 * Шапка. Серверный компонент: роль и имя берутся из контекста запроса,
 * клиентский код не используется. Обращение к контексту повторно не
 * выполняется благодаря кэшированию (шаг 3.4.2).
 */
export async function AppHeader() {
  const context = await getAuthContext();

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link href="/" className="app-header__title">
          Поликлиника: разграничение доступа
        </Link>

        {context ? (
          <div className="app-header__nav">
            <span className="app-header__user">{context.displayName}</span>
            <span className="badge">
              {context.profile ? ROLE_LABELS[context.profile.role] : "роль не определена"}
            </span>
            <Link href={homeRouteForRole(context.profile?.role)}>Мой раздел</Link>
            <SignOutButton />
          </div>
        ) : (
          <div className="app-header__nav">
            <span className="app-header__user">Вход не выполнен</span>
            <Link className="btn btn--secondary" href="/login">
              Войти
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}