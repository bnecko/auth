"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./Button";

type Tone = "danger" | "warning" | "neutral";

const confirmVariant: Record<Tone, "danger" | "secondary" | "primary"> = {
  danger: "danger",
  warning: "secondary",
  neutral: "primary",
};

const inputClass =
  "w-full mt-1 rounded-md bg-card border border-rule px-2.5 py-2 text-[13px] " +
  "text-fg placeholder:text-faint focus:outline-none focus:border-accent transition-colors";

// Confirm + Cancel live inside the <form>, so they read its pending state via
// useFormStatus. When the action settles (success-with-revalidate or error),
// pending falls back to false and we close the dialog. Redirecting actions
// unmount the component instead, which is also fine.
function FormControls({
  confirmLabel,
  tone,
  onCancel,
  onSettled,
}: {
  confirmLabel: string;
  tone: Tone;
  onCancel: () => void;
  onSettled: () => void;
}) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (pending) {
      wasPending.current = true;
    } else if (wasPending.current) {
      wasPending.current = false;
      onSettled();
    }
  }, [pending, onSettled]);

  return (
    <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-rule bg-elevated">
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" variant={confirmVariant[tone]} size="sm" loading={pending}>
        {confirmLabel}
      </Button>
    </div>
  );
}

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

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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

      {open && (
        <div
          className="overlay-mount fixed inset-0 z-50 flex items-center justify-center px-5 bg-fg/20 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            className="palette-mount w-full max-w-[440px] bg-card border border-rule rounded-xl shadow-elevated overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <form action={action}>
              {Object.entries(fields).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={String(v)} />
              ))}
              <div className="p-5">
                <h2 className="text-[16px] font-semibold text-fg mb-1.5">{title}</h2>
                <div className="text-[13px] text-secondary leading-snug">{message}</div>
                {preview && (
                  <div className="mt-3 rounded-lg border border-rule bg-elevated px-3 py-2.5 text-[13px]">
                    {preview}
                  </div>
                )}
                {extraInput && (
                  <label className="mt-3 block text-[13px] text-muted">
                    {extraInput.label}
                    {extraInput.multiline ? (
                      <textarea
                        name={extraInput.name}
                        placeholder={extraInput.placeholder}
                        required={extraInput.required}
                        rows={3}
                        className={inputClass}
                      />
                    ) : (
                      <input
                        name={extraInput.name}
                        placeholder={extraInput.placeholder}
                        required={extraInput.required}
                        className={inputClass}
                      />
                    )}
                  </label>
                )}
              </div>
              <FormControls
                confirmLabel={confirmLabel}
                tone={tone}
                onCancel={() => setOpen(false)}
                onSettled={() => setOpen(false)}
              />
            </form>
          </div>
        </div>
      )}
    </>
  );
}
