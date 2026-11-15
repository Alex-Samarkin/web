import { requireRole } from "@/lib/auth";
import { SectionStub } from "@/components/SectionStub";

export default async function PatientPage() {
  await requireRole(["patient"]);

  return (
    <SectionStub
      title="Пациент"
      description="Собственные личные данные. Анализы и сведения о лечащем враче недоступны."
      notice="Раздел реализуется на этапе 3.7."
    />
  );
}