"use client";

import { useActionState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import type { ToggleFormState } from "../SettingsToggleForm";

export type DisplayOption = {
  value: string;
  label: string;
  description: string;
};

export function WalletDisplayForm({
  action,
  options,
  current,
}: {
  action: (state: ToggleFormState, formData: FormData) => Promise<ToggleFormState>;
  options: DisplayOption[];
  current: string;
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

      {options.map(option => (
        <label
          key={option.value}
          className="flex items-start gap-3 py-2.5 cursor-pointer select-none group"
        >
          <input
            type="radio"
            name="display"
            value={option.value}
            defaultChecked={option.value === current}
            className="appearance-none w-4 h-4 rounded-full border border-rule bg-transparent checked:bg-accent checked:border-accent transition-colors shrink-0 translate-y-0.5"
          />
          <span className="min-w-0">
            <span className="block text-[13px] text-fg">{option.label}</span>
            <span className="block text-[12px] text-muted">{option.description}</span>
          </span>
        </label>
      ))}

      <div className="mt-3">
        <Button type="submit" size="sm" loading={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
