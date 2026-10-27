export function SectionHeading({ id, title, text }: { id?: string; title: string; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 id={id} className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-lg text-slate-600">{text}</p>}
    </div>
  );
}
