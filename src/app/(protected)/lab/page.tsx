import { requireRole } from "@/lib/auth";
import { SectionStub } from "@/components/SectionStub";

export default async function LabPage() {
  await requireRole(["lab_manager"]);

  return (
    <SectionStub
      title="Лаборант"
      description="Ведение результатов анализов: добавление, изменение и удаление записей."
      note="Политики для этой роли не созданы, данные недоступны. Заготовки правил находятся в supabase/sql/future/stub_crud_template.sql."
    />
  );
}