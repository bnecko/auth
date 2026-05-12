import { forwardRef } from "react";
import { Glyph } from "./Glyph";

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
};

// Form fields drop the box. The input is a baseline-aligned strip
// with a single 1px rule beneath it; the rule glows amber on focus.
// Label sits in uppercase above; hint and error sit below in meta
// type. Compare to the previous `bg-bg border px-3 h-10` shape — far
// more bordered-form-on-the-web than tool-in-a-terminal.
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, optional, id, className = "", ...props },
  ref,
) {
  const inputId = id ?? props.name;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label
          htmlFor={inputId}
          className="text-micro uppercase tracking-wider text-muted"
        >
          {label}
        </label>
        {optional && (
          <span className="text-micro uppercase tracking-wider text-faint">
            optional
          </span>
        )}
      </div>
      <input
        ref={ref}
        id={inputId}
        aria-describedby={
          [hintId, errorId].filter(Boolean).join(" ") || undefined
        }
        aria-invalid={!!error}
        className={[
          "w-full bg-transparent px-0 h-9 text-[14px] text-fg",
          "placeholder:text-faint border-0 border-b",
          error ? "border-danger" : "border-rule",
          "focus:outline-none focus:border-accent",
          "transition-colors",
          className,
        ].join(" ")}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="mt-1 text-meta text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-meta text-danger flex items-baseline gap-1.5">
          <Glyph kind="error" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
});
