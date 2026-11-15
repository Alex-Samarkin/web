import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { homeRouteForRole } from "@/lib/roles";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Уже вошедший пользователь направляется в свой раздел.
  const context = await getAuthContext();
  if (context) redirect(homeRouteForRole(context.profile?.role));

  return (
    <main className="container">
      <div className="card auth-card">
        <h1>Вход в систему</h1>
        <p className="muted">
          Учётные записи создаются администратором проекта. Самостоятельная
          регистрация отключена.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}