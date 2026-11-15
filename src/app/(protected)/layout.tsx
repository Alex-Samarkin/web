import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";

export const dynamic = "force-dynamic";

/**
 * Общая оболочка разделов. Проверяется только факт входа;
 * соответствие роли проверяет каждая страница вызовом requireRole.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getAuthContext();
  if (!context) redirect("/login");

  return (
    <>
      <AppHeader />
      <main className="container">{children}</main>
    </>
  );
}