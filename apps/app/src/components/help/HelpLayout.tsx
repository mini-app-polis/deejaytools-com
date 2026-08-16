import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import HelpStillStuck from "@/components/help/HelpStillStuck";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  helpTopicById,
  helpTopicNeighbors,
  type HelpTopicId,
} from "@/components/help/helpTopics";

type HelpLayoutProps = {
  topicId: HelpTopicId;
  /** Override the topic title when the page headline differs slightly. */
  title?: string;
  description?: string;
  children: React.ReactNode;
};

function hashScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export default function HelpLayout({
  topicId,
  title,
  description,
  children,
}: HelpLayoutProps) {
  const { hash, pathname } = useLocation();
  const topic = helpTopicById(topicId);
  const { prev, next } = helpTopicNeighbors(topicId);
  const headline = title ?? topic.title;
  const blurb = description ?? topic.description;

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }

    const id = hash.startsWith("#") ? hash.slice(1) : hash;
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: hashScrollBehavior(), block: "start" });
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [hash, pathname]);

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        to="/how-it-works"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
      >
        ← Back to help
      </Link>

      <header className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline" className="border-primary/40 text-primary font-normal">
            Guide
          </Badge>
          <span
            className="text-[10px] font-medium tracking-[0.18em] uppercase text-primary/60 tabular-nums"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            {topic.eyebrow}
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-light tracking-tight mb-2 text-foreground">
          {headline}
        </h1>
        <p className="text-sm text-foreground/70 max-w-xl">{blurb}</p>
      </header>

      <div className="space-y-10">{children}</div>

      <Separator className="my-10 bg-white/[0.07]" />

      <nav className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm">
        {prev ? (
          <Link to={prev.path} className="text-muted-foreground hover:text-primary transition-colors">
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            to={next.path}
            className="text-muted-foreground hover:text-primary transition-colors sm:text-right"
          >
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <HelpStillStuck />
    </div>
  );
}
