import { requireRole } from "@/lib/auth";
import { SectionStub } from "@/components/SectionStub";

export default async function AdminPage() {
  await requireRole(["admin"]);

  return (
    <SectionStub
      title="Администратор"
      description="Сопоставление врачей и пациентов. Доступны только фамилии; персональные данные и анализы закрыты."
      notice="Раздел реализуется на этапе 3.5."
    />
  );
}