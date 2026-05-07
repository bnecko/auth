import { forwardRef } from "react";

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, optional, id, className = "", ...props },
  ref,
) {
  const inputId = id ?? props.name;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label
          htmlFor={inputId}
          className="text-micro uppercase text-muted"
        >
          {label}
        </label>
        {optional && (
          <span className="text-micro uppercase text-faint">optional</span>
        )}
      </div>
      <input
        ref={ref}
        id={inputId}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        aria-invalid={!!error}
        className={[
          "w-full bg-bg border px-3 h-10 text-[13.5px] text-fg rounded-sm",
          "placeholder:text-faint font-mono",
          error ? "border-danger/70" : "border-border",
          "focus:outline-none focus:border-fg",
          "transition-colors",
          className,
        ].join(" ")}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-meta text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-meta text-danger">
          x {error}
        </p>
      )}
    </div>
  );
});
