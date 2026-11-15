import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SUPABASE_HOST } from "@/lib/env";
import { isAuthSessionMissingError } from "@supabase/supabase-js";

// Страница читает cookie и не должна кэшироваться или prerender-иться.
export const dynamic = "force-dynamic";

/** Объекты, видимость которых проверяется. Порядок соответствует ТЗ. */
const CHECKED_OBJECTS = [
  "patients",
  "doctors",
  "analyses",
  "assignments",
  "app_users",
  "admin_patients",
  "admin_doctors",
  "admin_assignments",
] as const;

type ObjectCheck = {
  name: string;
  count: number | null;
  comment: string;
};

export default async function DiagnosticsPage() {
  const supabase = await createSupabaseServerClient();

  // getUser() проверяет токен на сервере аутентификации.
  // getSession() для серверных проверок не применяется.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  // Подсчёт строк без передачи самих данных: head = true.
  const checks: ObjectCheck[] = [];
  for (const name of CHECKED_OBJECTS) {
    const { count, error } = await supabase
      .from(name)
      .select("*", { count: "exact", head: true });

    checks.push({
      name,
      count: error ? null : count,
      comment: error ? `${error.code ?? "—"}: ${error.message}` : "запрос выполнен",
    });
  }

  // Роль читается из профиля; для анонимной роли профиль недоступен.
  let roleLabel = "сеанс отсутствует";
  if (user) {
    const { data: profile } = await supabase
      .from("app_users")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    roleLabel = profile?.role ?? "профиль не найден";
  }

  return (
    <main className="container">
      <h1>Диагностика подключения</h1>
      <p className="muted">
        Служебная страница этапа 3.2. Будет удалена на этапе 3.8.
      </p>

      {userError && !isAuthSessionMissingError(userError) && (
        <div className="notice notice--error">
          Ошибка проверки сеанса: {userError.message}
        </div>
      )}

      <section className="card">
        <h2>Состояние</h2>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <tr>
                <th>Проект Supabase</th>
                <td>{SUPABASE_HOST}</td>
              </tr>
              <tr>
                <th>Пользователь</th>
                <td>{user ? user.email : "не выполнен вход"}</td>
              </tr>
              <tr>
                <th>Роль</th>
                <td>
                  <span className="badge">{roleLabel}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Видимость объектов</h2>
        <p className="muted">
          Запросы выполняются от имени текущего сеанса. Для анонимной роли
          ожидается отказ по каждому объекту: права не выданы (этап 2.4).
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Объект</th>
                <th>Доступно строк</th>
                <th>Примечание</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => (
                <tr key={check.name}>
                  <td>{check.name}</td>
                  <td>{check.count ?? "—"}</td>
                  <td>{check.comment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
