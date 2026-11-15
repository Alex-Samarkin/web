type SectionStubProps = {
  title: string;
  description: string;
  notice?: string;
  note?: string;
};

/**
 * Единое оформление раздела, содержимое которого ещё не реализовано.
 * Обращений к данным компонент не выполняет.
 */
export function SectionStub({
  title,
  description,
  notice = "Раздел в разработке.",
  note,
}: SectionStubProps) {
  return (
    <>
      <h1>{title}</h1>
      <div className="notice">{notice}</div>
      <section className="card">
        <h2>Назначение раздела</h2>
        <p>{description}</p>
        {note && <p className="muted">{note}</p>}
      </section>
    </>
  );
}