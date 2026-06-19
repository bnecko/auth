import { forwardRef } from "react";

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
};

// A bordered, rounded input with the label sitting above it. The border picks
// up the accent on focus with a soft ring; the error state swaps to danger and
// wires the message to the input for screen readers.
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, optional, id, className = "", ...props },
  ref,
) {
  const inputId = id ?? props.name;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label htmlFor={inputId} className="text-[13px] font-medium text-fg">
          {label}
        </label>
        {optional && <span className="text-[12px] text-muted">Optional</span>}
      </div>
      <input
        ref={ref}
        id={inputId}
        aria-describedby={
          [hintId, errorId].filter(Boolean).join(" ") || undefined
        }
        aria-invalid={!!error}
        className={[
          "w-full h-10 px-3 text-[14px] rounded-md bg-card text-fg",
          "placeholder:text-faint border",
          error ? "border-danger" : "border-rule",
          "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25",
          "transition",
          className,
        ].join(" ")}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-[12px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
