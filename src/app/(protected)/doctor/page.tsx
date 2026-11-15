import { requireRole } from "@/lib/auth";
import { SectionStub } from "@/components/SectionStub";

export default async function DoctorPage() {
  await requireRole(["doctor"]);

  return (
    <SectionStub
      title="Врач"
      description="Список назначенных пациентов, полные карточки и результаты анализов. Только чтение."
      notice="Раздел реализуется на этапе 3.6."
    />
  );
}