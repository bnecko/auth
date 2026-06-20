"use client";

import { useId, useState } from "react";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";

type Tone = "danger" | "warning" | "neutral";

// A trigger Button that gates a server-action <form> behind ConfirmDialog. The
// form is rendered (hidden) with its hidden inputs; an optional extra input
// (e.g. a ban reason or an invite username) is rendered inside the dialog and
// associated back to the form via the HTML `form=` attribute, so it submits
// even though it lives in a different part of the DOM.
export function ConfirmButton({
  action,
  fields = {},
  extraInput,
  label,
  triggerVariant = "secondary",
  triggerSize = "sm",
  triggerClassName,
  disabled,
  title,
  message,
  preview,
  confirmLabel = "Confirm",
  tone = "neutral",
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields?: Record<string, string | number>;
  extraInput?: {
    name: string;
    label: string;
    placeholder?: string;
    required?: boolean;
    multiline?: boolean;
  };
  label: React.ReactNode;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger";
  triggerSize?: "sm" | "md";
  triggerClassName?: string;
  disabled?: boolean;
  title: string;
  message: React.ReactNode;
  preview?: React.ReactNode;
  confirmLabel?: string;
  tone?: Tone;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const formId = useId();

  const inputClass =
    "w-full mt-1 rounded-md bg-card border border-rule px-2.5 py-2 text-[13px] " +
    "text-fg placeholder:text-faint focus:outline-none focus:border-accent transition-colors";

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>

      {/* The form lives outside the dialog so it survives the dialog unmount on
          close; controls inside the dialog target it via form={formId}. */}
      <form id={formId} action={action} className="hidden" onSubmit={() => setBusy(true)}>
        {Object.entries(fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={String(v)} />
        ))}
      </form>

      <ConfirmDialog
        open={open}
        title={title}
        message={message}
        preview={preview}
        confirmLabel={confirmLabel}
        tone={tone}
        busy={busy}
        formId={formId}
        onConfirm={() => setBusy(true)}
        onClose={() => !busy && setOpen(false)}
      >
        {extraInput && (
          <label className="mt-3 block text-[13px] text-muted">
            {extraInput.label}
            {extraInput.multiline ? (
              <textarea
                form={formId}
                name={extraInput.name}
                placeholder={extraInput.placeholder}
                required={extraInput.required}
                rows={3}
                className={inputClass}
              />
            ) : (
              <input
                form={formId}
                name={extraInput.name}
                placeholder={extraInput.placeholder}
                required={extraInput.required}
                className={inputClass}
              />
            )}
          </label>
        )}
      </ConfirmDialog>
    </>
  );
}
