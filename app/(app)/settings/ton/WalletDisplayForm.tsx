"use client";

import { useActionState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";

export type DisplayState = { ok?: boolean; error?: string; domains?: string[] } | null;

const ADDRESS_NOTE =
  "The TON blockchain is public: anyone who sees this address can read that wallet's whole balance and transaction history, and tie it to your account. Hiding it later does not undo what was already seen.";

function Choice({
  value,
  current,
  label,
  description,
}: {
  value: string;
  current: string;
  label: string;
  description: string;
}) {
  return (
    <label className="flex items-start gap-3 py-2.5 cursor-pointer select-none group">
      <input
        type="radio"
        name="display"
        value={value}
        defaultChecked={value === current}
        className="appearance-none w-4 h-4 rounded-full border border-rule bg-transparent checked:bg-accent checked:border-accent transition-colors shrink-0 translate-y-0.5"
      />
      <span className="min-w-0">
        <span className="block text-[13px] text-fg">{label}</span>
        <span className="block text-[12px] text-muted">{description}</span>
      </span>
    </label>
  );
}

export function WalletDisplayForm({
  action,
  current,
  currentDomain,
}: {
  action: (state: DisplayState, formData: FormData) => Promise<DisplayState>;
  current: "hidden" | "address" | "domain";
  currentDomain: string | null;
}) {
  const [state, formAction, pending] = useActionState<DisplayState, FormData>(action, null);

  // Whatever is already on display stays listed after a reload, so the form
  // always shows the live choice without having to call the indexer first.
  const loaded = state?.domains ?? (currentDomain ? [currentDomain] : []);

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

      <Choice
        value="hidden"
        current={current}
        label="Hide my wallet"
        description="Nobody sees it. The wallet stays linked to your account."
      />
      <Choice value="address" current={current} label="Show my address" description={ADDRESS_NOTE} />

      {loaded.length > 0 && (
        <>
          <Choice
            value="domain"
            current={current}
            label="Show a .ton domain"
            description="Shows the name instead of the address. It is re-checked periodically and hidden automatically if it stops belonging to this wallet."
          />
          <select
            name="domain"
            defaultValue={currentDomain ?? loaded[0]}
            className="ml-7 mt-1 mb-2 h-9 max-w-[320px] rounded-md border border-rule bg-transparent px-2 text-[13px] text-fg"
          >
            {loaded.map(domain => (
              <option key={domain} value={domain}>
                {domain}.ton
              </option>
            ))}
          </select>
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="save" size="sm" loading={pending}>
          Save
        </Button>
        <Button type="submit" name="intent" value="load" variant="secondary" size="sm">
          Find my .ton domains
        </Button>
      </div>
    </form>
  );
}
