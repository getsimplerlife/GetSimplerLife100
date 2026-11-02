/**
 * components/FieldError.tsx — SLICE 174: the message, next to the field.
 *
 * A page banner may accompany a validation failure; it may not replace it. This
 * renders the server's sentence directly under the input it names, announced by
 * role="alert", and `fieldErrorProps()` in lib/form-field-error.ts ties the
 * input to it with aria-describedby + aria-invalid.
 */
import type { FieldError } from "~/lib/form-field-error";

export function FieldErrorLine({ error, field, id }: { error: FieldError | null; field: string; id: string }) {
  if (!error || error.field !== field) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs font-medium text-red-600">
      {error.message}
    </p>
  );
}
