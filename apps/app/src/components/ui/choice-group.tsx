import { cn } from "@/lib/utils";

export type ChoiceOption<T extends string> = { value: T; label: string };

export function ChoiceGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled,
  className,
}: {
  options: ChoiceOption<T>[];
  value: T | "";
  onChange: (v: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => {
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
      })}
    </div>
  );
}
