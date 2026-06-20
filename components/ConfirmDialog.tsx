"use client";

import { useEffect } from "react";
import { Button } from "./Button";

type Tone = "danger" | "warning" | "neutral";

const confirmVariant: Record<Tone, "danger" | "secondary" | "primary"> = {
  danger: "danger",
  warning: "secondary",
  neutral: "primary",
};

// Controlled confirmation modal. Reuses the SearchPalette overlay treatment
// from AppShell (fixed inset, dimmed backdrop, Esc + backdrop to close,
// stopPropagation on the card). The confirm control is either a plain button
// that calls onConfirm, or - when formId is given - a submit button for that
// form, so it can drive a server-action <form> rendered by the caller.
export function ConfirmDialog({
  open,
  title,
  message,
  preview,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "neutral",
  busy = false,
  formId,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  preview?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  busy?: boolean;
  formId?: string;
  onConfirm?: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="overlay-mount fixed inset-0 z-50 flex items-center justify-center px-5 bg-fg/20 backdrop-blur-sm"
      onClick={() => !busy && onClose()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="palette-mount w-full max-w-[440px] bg-card border border-rule rounded-xl shadow-elevated overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5">
          <h2 className="text-[16px] font-semibold text-fg mb-1.5">{title}</h2>
          <div className="text-[13px] text-secondary leading-snug">{message}</div>
          {preview && (
            <div className="mt-3 rounded-lg border border-rule bg-elevated px-3 py-2.5 text-[13px]">
              {preview}
            </div>
          )}
          {children}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-rule bg-elevated">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type={formId ? "submit" : "button"}
            form={formId}
            variant={confirmVariant[tone]}
            size="sm"
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
