import { requireRole } from "@/lib/auth";
import { SectionStub } from "@/components/SectionStub";

export default async function HrPage() {
  await requireRole(["hr_manager"]);

  return (
    <SectionStub
      title="Менеджер персонала"
      description="Ведение справочника врачей: добавление, изменение и удаление записей."
      note="Политики для этой роли не созданы, данные недоступны. Заготовки правил находятся в supabase/sql/future/stub_crud_template.sql."
    />
  );
}
