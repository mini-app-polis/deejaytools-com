import { cn } from "@/lib/utils";

export type ChoiceOption<T extends string> = { value: T; label: string };

export function ChoiceGroup<T extends string>({
  options,
  groups,
  value,
  onChange,
  ariaLabel,
  disabled,
  className,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  options?: ChoiceOption<T>[];
  /**
   * Render as separate rows, one per group. Takes precedence over `options`.
   * Empty groups are skipped, so a caller can filter options out without
   * leaving a blank row behind.
   */
  groups?: ChoiceOption<T>[][];
  value: T | "";
  onChange: (v: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  /** Set by FormControl, with the two below, so the field's message describes the group. */
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const groupProps = {
    id,
    role: "radiogroup",
    "aria-label": ariaLabel,
    "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined,
  };

  const renderOption = (opt: ChoiceOption<T>) => {
    const active = opt.value === value;
    return (
      <button
        key={opt.value}
        type="button"
        role="radio"
        aria-checked={active}
        disabled={disabled}
        onClick={() => onChange(opt.value)}
        className={cn(
          "rounded-full border px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none",
          active
            ? "border-primary bg-primary/10 text-primary font-medium"
            : "border-input text-muted-foreground hover:text-foreground hover:border-white/20"
        )}
      >
        {opt.label}
      </button>
    );
  };

  if (groups) {
    const rows = groups.filter((g) => g.length > 0);

    return (
      <div {...groupProps} className={cn("space-y-2", className)}>
        {rows.map((group, i) => (
          // presentation: the rows are visual grouping only — the radios must
          // still read as owned by the single radiogroup above.
          <div key={i} role="presentation" className="flex flex-wrap gap-2">
            {group.map(renderOption)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div {...groupProps} className={cn("flex flex-wrap gap-2", className)}>
      {(options ?? []).map(renderOption)}
    </div>
  );
}
