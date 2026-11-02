import type { FieldErrors, FieldValues } from "react-hook-form";
import { toast } from "sonner";

/**
 * A refused submit also says why in a toast, naming the first problem in
 * field order, in case its field is out of view. Each field's own
 * FormMessage is where the problem shows. Pass it as the invalid handler of
 * react-hook-form's handleSubmit.
 */
export function toastFirstError<T extends FieldValues>(errors: FieldErrors<T>) {
  const first = Object.values(errors).find((e) => e?.message);
  if (typeof first?.message === "string") toast.error(first.message);
}
