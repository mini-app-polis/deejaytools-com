import { useEffect, useRef, useState } from "react";
import { useApiClient } from "@/api/client";
import { call, endpoints } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PERSON_SEARCH_DEBOUNCE_MS,
  PERSON_SEARCH_MIN_CHARS,
  formatPersonLabel,
  personSearchQuery,
} from "@/lib/personSearch";
import { cn } from "@/lib/utils";
import type { ApiEventPerson } from "@/schemas";

type Search =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; results: ApiEventPerson[] }
  | { status: "error"; message: string };

/**
 * Where the event's staff pick the person they act for or add to the staff.
 * A search box over the event's own people search (never the admin user
 * search): it waits for two characters and a pause in typing, then lists
 * matches as a listbox the arrow keys and Enter can pick from. Once someone
 * is picked it shows them, with Change to search again.
 */
export default function PersonPicker({
  id,
  eventId,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  eventId: string;
  label: string;
  value: ApiEventPerson | null;
  onChange: (person: ApiEventPerson | null) => void;
  /** Said after the line about who appears here. */
  hint?: string;
}) {
  const api = useApiClient();
  const [text, setText] = useState("");
  const [search, setSearch] = useState<Search>({ status: "idle" });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const refocus = useRef(false);

  useEffect(() => {
    const q = personSearchQuery(text);
    if (q === null) {
      setSearch({ status: "idle" });
      return;
    }
    let cancelled = false;
    setSearch({ status: "loading" });
    const timer = setTimeout(() => {
      call(api, endpoints.events.people, { params: { id: eventId, q } })
        .then((results) => {
          if (cancelled) return;
          setSearch({ status: "done", results });
          setActive(results.length > 0 ? 0 : -1);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setSearch({ status: "error", message: err instanceof Error ? err.message : "Search failed" });
        });
    }, PERSON_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, eventId, text]);

  useEffect(() => {
    if (value === null && refocus.current) {
      refocus.current = false;
      inputRef.current?.focus();
    }
  }, [value]);

  const results = search.status === "done" ? search.results : [];
  const listboxId = `${id}-results`;
  const statusId = `${id}-status`;
  const helpId = `${id}-help`;
  const showList = open && results.length > 0;

  const pick = (person: ApiEventPerson) => {
    setOpen(false);
    setText("");
    setActive(-1);
    onChange(person);
  };

  const change = () => {
    refocus.current = true;
    onChange(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (results.length > 0) setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length > 0) setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Never submit the surrounding form from the search box.
      e.preventDefault();
      const person = showList ? results[active] : undefined;
      if (person) pick(person);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  let statusText = "";
  if (search.status === "loading") statusText = "Searching…";
  else if (search.status === "error") statusText = `Couldn't search: ${search.message}`;
  else if (search.status === "done" && results.length === 0) statusText = "No one connected to this event matches that.";
  else if (search.status === "idle" && text.trim().length > 0) {
    statusText = `Type at least ${PERSON_SEARCH_MIN_CHARS} characters to search.`;
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={id} id={`${id}-label`}>
        {label}
      </Label>
      {value ? (
        <div
          role="group"
          aria-labelledby={`${id}-label`}
          className="flex items-center justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm"
        >
          <span className="min-w-0 truncate">{formatPersonLabel(value)}</span>
          <Button type="button" variant="outline" size="sm" onClick={change} aria-label={`Change ${label.toLowerCase()}`}>
            Change
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listboxId}
            aria-activedescendant={showList && active >= 0 ? `${id}-option-${active}` : undefined}
            aria-describedby={`${statusId} ${helpId}`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            placeholder="Search by name or email"
            autoComplete="off"
          />
          <ul
            id={listboxId}
            role="listbox"
            aria-label={`${label} search results`}
            hidden={!showList}
            className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
          >
            {results.map((person, i) => (
              <li
                key={person.user_id}
                id={`${id}-option-${i}`}
                role="option"
                aria-selected={i === active}
                className={cn("cursor-pointer px-3 py-2 text-sm", i === active && "bg-accent text-accent-foreground")}
                // Keep focus in the input so its blur doesn't close the list first.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(person)}
              >
                {formatPersonLabel(person)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!value && (
        <p
          id={statusId}
          role="status"
          className={cn("text-xs", search.status === "error" ? "text-destructive" : "text-muted-foreground")}
        >
          {statusText}
        </p>
      )}
      <p id={helpId} className="text-xs text-muted-foreground">
        Only people connected to this event appear here.{hint ? ` ${hint}` : ""}
      </p>
    </div>
  );
}
