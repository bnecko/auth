"use client";

import { useActionState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import type { WithdrawState } from "./actions";

export function WithdrawForm({
  action,
  destination,
  minimum,
}: {
  action: (state: WithdrawState, formData: FormData) => Promise<WithdrawState>;
  destination: string;
  minimum: string;
}) {
  const [state, formAction, pending] = useActionState<WithdrawState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 px-4 py-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <p className="text-[13px] text-secondary">
        Withdrawals are paid in GRAM to your verified wallet, {destination}. Each one is reviewed
        and sent by a person, so it is not instant. The amount leaves your balance as soon as you
        ask and comes back if the request is cancelled or declined.
      </p>
      <Field
        label="Amount"
        name="amount"
        inputMode="decimal"
        autoComplete="off"
        placeholder="1.5"
        hint={`In GRAM, ${minimum} or more`}
        required
      />
      <div>
        <Button type="submit" size="sm" loading={pending}>
          Request withdrawal
        </Button>
      </div>
    </form>
  );
}
