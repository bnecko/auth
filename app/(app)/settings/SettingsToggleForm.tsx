"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";

export type ToggleFormState = { ok?: boolean; error?: string } | null;

export type ToggleField = {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
};

export function SettingsToggleForm({
  action,
  toggles,
  saveLabel = "Save preferences",
}: {
  action: (state: ToggleFormState, formData: FormData) => Promise<ToggleFormState>;
  toggles: ToggleField[];
  saveLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-1 px-4 py-4">
      {state?.error && (
        <div className="mb-3">
          <Alert tone="danger">{state.error}</Alert>
        </div>
      )}
      {state?.ok && (
        <div className="mb-3">
          <Alert tone="success">Saved</Alert>
        </div>
      )}

      {toggles.map(t => (
        <label
          key={t.name}
          className="flex items-start gap-3 py-2.5 cursor-pointer select-none group"
        >
          <input
            type="checkbox"
            name={t.name}
            defaultChecked={t.defaultChecked}
            className="appearance-none w-4 h-4 border border-rule bg-transparent checked:bg-accent checked:border-accent transition-colors shrink-0 translate-y-0.5 rounded-md"
          />
          <span className="min-w-0">
            <span className="block text-[13px] text-fg group-hover:text-fg">{t.label}</span>
            <span className="block text-[12px] text-muted">{t.description}</span>
          </span>
        </label>
      ))}

      <div className="mt-3">
        <Button type="submit" size="sm" loading={pending}>
          {saveLabel}
        </Button>
      </div>
    </form>
  );
}
