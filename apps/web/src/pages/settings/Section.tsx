import type { ReactNode } from "react";

interface SectionProps {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  children: ReactNode;
}

/** One block of the settings page: a heading, a short text and the fields. */
export function Section({ id, eyebrow, title, text, children }: SectionProps) {
  return (
    <section className="settings-panel" id={id} aria-labelledby={`${id}-title`}>
      <header className="settings-panel-head">
        <span className="eyebrow eyebrow--cyan">{eyebrow}</span>
        <h2 id={`${id}-title`}>{title}</h2>
        <p>{text}</p>
      </header>
      <div className="settings-body">{children}</div>
    </section>
  );
}
