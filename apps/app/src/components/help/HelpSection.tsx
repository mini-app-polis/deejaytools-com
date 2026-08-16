import { Link } from "react-router-dom";

export type HelpSectionMeta = {
  id: string;
  eyebrow: string;
  title: string;
};

export function HelpSection({
  section,
  children,
}: {
  section: HelpSectionMeta;
  children: React.ReactNode;
}) {
  return (
    <section id={section.id} className="scroll-mt-24">
      <div className="flex items-baseline gap-3 mb-4">
        <span
          className="text-xs text-primary/60 tabular-nums"
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          {section.eyebrow}
        </span>
        <h2 className="text-xl sm:text-2xl font-light tracking-tight text-foreground">
          {section.title}
        </h2>
      </div>
      <div className="space-y-3 text-sm text-foreground/75 leading-relaxed">{children}</div>
    </section>
  );
}

export function HelpSubheading({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-lg font-light tracking-tight text-foreground mt-8 mb-3 scroll-mt-24">
      {children}
    </h3>
  );
}

export function HelpActionLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <p className="pt-1">
      <Link to={to} className="text-sm font-medium text-primary hover:underline">
        {children}
      </Link>
    </p>
  );
}
