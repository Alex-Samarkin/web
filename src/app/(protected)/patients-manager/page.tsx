import { requireRole } from "@/lib/auth";
import { SectionStub } from "@/components/SectionStub";

export default async function PatientsManagerPage() {
  await requireRole(["patient_manager"]);

  return (
    <SectionStub
      title="Менеджер пациентов"
      description="Ведение личных данных пациентов: добавление, изменение и удаление записей."
      note="Политики для этой роли не созданы, данные недоступны. Заготовки правил находятся в supabase/sql/future/stub_crud_template.sql."
    />
  );
}