/**
 * Кнопка выхода. Обычная форма без клиентского кода:
 * обращение уходит в обработчик маршрута /auth/signout.
 */
export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button className="btn btn--secondary" type="submit">
        Выйти
      </button>
    </form>
  );
}