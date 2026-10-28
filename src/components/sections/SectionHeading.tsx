export function SectionHeading({ id, title, text, eyebrow }: { id?: string; title: string; text?: string; eyebrow?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow && <p className="text-xs font-bold tracking-[0.18em] text-slate-500 uppercase">{eyebrow}</p>}
      <h2 id={id} className={`${eyebrow ? "mt-3 " : ""}text-3xl font-extrabold tracking-tight text-navy sm:text-4xl`}>{title}</h2>
      {text && <p className="mt-3 text-lg text-slate-600">{text}</p>}
    </div>
  );
}
