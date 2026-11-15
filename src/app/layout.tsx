import type { Metadata } from "next";
import "./globals.css";

// Метаданные приложения. Язык документа — русский.
export const metadata: Metadata = {
  title: "Поликлиника: разграничение доступа",
  description:
    "Учебный стенд разграничения доступа: удалённый Supabase (RLS) и Next.js на Vercel.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}