import { Link, Navigate, useLocation } from "react-router-dom";
import { HELP_TOPICS, LEGACY_HASH_REDIRECTS } from "@/components/help/helpTopics";
import HelpStillStuck from "@/components/help/HelpStillStuck";
import { Badge } from "@/components/ui/badge";

/**
 * Help hub for the floor-trial guide.
 *
 * This page used to be the entire guide — one long scrolling document with nine
 * anchored sections. It is now a hub linking to the topic pages under
 * /how-it-works/*, which are the real content.
 *
 * The old anchors are still live all over the internet and in older copies of the
 * competitor information document, so any request carrying one is redirected to the
 * topic page that absorbed it, hash intact. HelpLayout scrolls to the matching
 * section on arrival.
 */
export default function HowItWorksPage() {
  const { hash } = useLocation();
  const anchor = hash.startsWith("#") ? hash.slice(1) : hash;
  const redirect = anchor ? LEGACY_HASH_REDIRECTS[anchor] : undefined;

  if (redirect) {
    return <Navigate to={`${redirect}${hash}`} replace />;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-10">
        <Badge variant="outline" className="border-primary/40 text-primary font-normal mb-3">
          Guide
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-light tracking-tight mb-2 text-foreground">
          How floor trials work
        </h1>
        <p className="text-sm text-foreground/70 max-w-xl">
          Everything you need to know to submit music, check in, watch the queue, and run your
          routine. Start at the top if it&rsquo;s your first event, or jump to what you need.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {HELP_TOPICS.map((topic) => (
          <li key={topic.id}>
            <Link
              to={topic.path}
              className="block h-full rounded-xl border border-white/[0.07] bg-card/40 p-5 transition-colors hover:border-primary/40"
            >
              <span
                className="block text-[10px] font-medium tracking-[0.18em] uppercase text-primary/60 tabular-nums mb-2"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                {topic.eyebrow}
              </span>
              <span className="block text-base font-medium text-foreground mb-1">
                {topic.title}
              </span>
              <span className="block text-sm text-foreground/70">{topic.description}</span>
            </Link>
          </li>
        ))}
      </ul>

      <HelpStillStuck />
    </div>
  );
}
