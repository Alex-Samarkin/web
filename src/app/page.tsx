import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { getAuthContext } from "@/lib/auth";
import {
  APP_ROLES,
  ROLE_ACCESS_SUMMARY,
  ROLE_LABELS,
  homeRouteForRole,
} from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * Главная страница. Вошедшему пользователю показываются его роль и переход
 * в собственный раздел; остальным — описание стенда и вход.
 * Ссылок на чужие разделы нет.
 */
export default async function HomePage() {
  const context = await getAuthContext();

  return (
    <>
      <AppHeader />
      <main className="container">
        <h1>Поликлиника: разграничение доступа</h1>

        {context ? (
          <section className="card">
            <h2>Ваш раздел</h2>
            <p>
              Пользователь: <strong>{context.displayName}</strong>
              <br />
              Роль:{" "}
              <span className="badge">
                {context.profile ? ROLE_LABELS[context.profile.role] : "не определена"}
              </span>
            </p>
            <p>
              {context.profile
                ? ROLE_ACCESS_SUMMARY[context.profile.role]
                : "Профиль учётной записи не задан. Обратитесь к администратору."}
            </p>
            <Link className="btn" href={homeRouteForRole(context.profile?.role)}>
              Перейти в раздел
            </Link>
          </section>
        ) : (
          <section className="card">
            <h2>Вход</h2>
            <p>
              Учебный стенд. Права задаются в базе данных политиками построчного
              доступа; интерфейс отображает только разрешённые данные.
            </p>
            <p className="muted">
              Учётные записи создаются администратором проекта, самостоятельная
              регистрация отключена.
            </p>
            <Link className="btn" href="/login">
              Войти
            </Link>
          </section>
        )}

        <section className="card">
          <h2>Роли и доступные данные</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Роль</th>
                  <th>Доступные данные</th>
                </tr>
              </thead>
              <tbody>
                {APP_ROLES.map((role) => (
                  <tr key={role}>
                    <td>{ROLE_LABELS[role]}</td>
                    <td>{ROLE_ACCESS_SUMMARY[role]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}