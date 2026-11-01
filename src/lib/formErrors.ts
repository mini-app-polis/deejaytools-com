import type { FieldErrors, FieldValues } from "react-hook-form";
import { toast } from "sonner";

/**
 * A refused submit says why in a toast, one problem at a time, in field
 * order: pass it as the invalid handler of react-hook-form's handleSubmit.
 */
export function toastFirstError<T extends FieldValues>(errors: FieldErrors<T>) {
  const first = Object.values(errors).find((e) => e?.message);
  if (typeof first?.message === "string") toast.error(first.message);
}
