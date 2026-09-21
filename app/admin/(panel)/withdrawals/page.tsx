import { redirect } from "next/navigation";
import { ConfirmButton } from "@/components/ConfirmButton";
import { QrCode } from "@/components/QrCode";
import { Empty, Section } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { CopyValue } from "@/app/(app)/developers/apps/[slug]/CopyValue";
import { formatGram } from "@/lib/server/repositories/billing";
import {
  listWithdrawalQueue,
  OPEN_WITHDRAWAL_STATUSES,
  type QueuedWithdrawal,
  type WithdrawalStatus,
} from "@/lib/server/repositories/billingWithdrawals";
import { getCurrentSession } from "@/lib/server/session";
import { toFriendlyAddress } from "@/lib/server/ton/address";
import {
  approveWithdrawalAction,
  markWithdrawalSentAction,
  rejectWithdrawalAction,
} from "./actions";

export const dynamic = "force-dynamic";

const statusTone: Record<WithdrawalStatus, "success" | "danger" | "warning" | "neutral" | "info"> = {
  requested: "warning",
  approved: "info",
  sent: "info",
  confirmed: "success",
  rejected: "danger",
  cancelled: "neutral",
};

function Summary({ withdrawal }: { withdrawal: QueuedWithdrawal }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-fg">{formatGram(withdrawal.amountNano)} GRAM</span>
      <span className="text-muted">{withdrawal.username ? `@${withdrawal.username}` : "deleted account"}</span>
    </span>
  );
}

// Shown only once a request is approved, so there is nothing to pay from until
// the review has happened. The address is the non-bounceable spelling: paying
// the bounceable one to a wallet that is not deployed yet returns the GRAM,
// and the watcher would already have read the payment as made.
function PaymentInstructions({ withdrawal }: { withdrawal: QueuedWithdrawal }) {
  const payTo = toFriendlyAddress(withdrawal.destination);
  return (
    <div className="mt-3 flex flex-col gap-2 text-[12px]">
      <p className="text-[13px] text-secondary">
        Pay this from the deposit wallet, with the memo as the comment. The watcher confirms it
        from the chain by address, amount and memo together, so all three have to be exact.
      </p>
      <div>
        <span className="block text-muted mb-1">Address</span>
        <span className="break-all">
          <CopyValue value={payTo} label="address" />
        </span>
      </div>
      <div>
        <span className="block text-muted mb-1">Amount</span>
        <CopyValue value={formatGram(withdrawal.amountNano)} label="amount" />
      </div>
      <div>
        <span className="block text-muted mb-1">Memo</span>
        <CopyValue value={withdrawal.memo} label="memo" />
      </div>
      <QrCode
        text={`ton://transfer/${payTo}?amount=${withdrawal.amountNano}&text=${withdrawal.memo}`}
        label="Payout QR code"
        size={184}
      />
    </div>
  );
}

function OpenWithdrawal({ withdrawal }: { withdrawal: QueuedWithdrawal }) {
  const gateProblem = !withdrawal.identityApproved
    ? "identity is no longer approved"
    : !withdrawal.walletStillLinked
      ? "the destination is no longer this user's linked wallet"
      : null;
  const fields = { withdrawalId: withdrawal.id };

  return (
    <div className="border-t border-rule first:border-t-0 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[13px]">
          <Summary withdrawal={withdrawal} />
          <Tag tone={statusTone[withdrawal.status]}>{withdrawal.status}</Tag>
          <span className="text-faint tabular-nums">
            #{withdrawal.id} · {withdrawal.createdAt.toISOString().slice(0, 16).replace("T", " ")}
          </span>
        </span>

        <span className="flex items-center gap-2">
          {withdrawal.status === "requested" && (
            <ConfirmButton
              action={approveWithdrawalAction}
              fields={fields}
              label="Approve"
              triggerVariant="primary"
              disabled={gateProblem !== null}
              title="Approve this withdrawal?"
              message="Approving shows the payment details. Nothing is sent until you pay it from your wallet."
              preview={<Summary withdrawal={withdrawal} />}
              confirmLabel="Approve"
            />
          )}
          {withdrawal.status === "approved" && (
            <ConfirmButton
              action={markWithdrawalSentAction}
              fields={fields}
              label="Mark sent"
              title="Mark as sent?"
              message="Only after the payment has left your wallet. From here the request can no longer be rejected: the chain closes it."
              preview={<Summary withdrawal={withdrawal} />}
              confirmLabel="Mark sent"
            />
          )}
          {withdrawal.status !== "sent" && (
            <ConfirmButton
              action={rejectWithdrawalAction}
              fields={fields}
              extraInput={{ name: "reason", label: "Reason, shown to the user", placeholder: "Optional" }}
              label="Reject"
              triggerVariant="ghost"
              tone="danger"
              title="Reject this withdrawal?"
              message="The held amount goes back to the user's balance."
              preview={<Summary withdrawal={withdrawal} />}
              confirmLabel="Reject"
            />
          )}
        </span>
      </div>

      {gateProblem && withdrawal.status === "requested" && (
        <p className="mt-2 text-[12px] text-danger">Cannot be approved: {gateProblem}.</p>
      )}
      {withdrawal.status === "approved" && <PaymentInstructions withdrawal={withdrawal} />}
      {withdrawal.status === "sent" && (
        <p className="mt-2 text-[12px] text-muted">
          Waiting for the watcher to read the payment off the chain. Memo {withdrawal.memo}.
        </p>
      )}
    </div>
  );
}

export default async function AdminWithdrawalsPage() {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") redirect("/");

  const queue = await listWithdrawalQueue();
  const open = queue.filter(w => OPEN_WITHDRAWAL_STATUSES.includes(w.status));
  const closed = queue.filter(w => !OPEN_WITHDRAWAL_STATUSES.includes(w.status));

  return (
    <>
      <header className="mb-10" data-mount-row>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[13px] text-muted tabular-nums">{open.length} open</span>
        </div>
        <h1 className="text-[32px] tracking-tight text-fg leading-none">Withdrawals</h1>
      </header>

      <div data-mount-row>
        <Section index="1.0" title="Open" hint="Oldest first">
          {open.length === 0 ? (
            <Empty>Nothing waiting</Empty>
          ) : (
            open.map(withdrawal => <OpenWithdrawal key={withdrawal.id} withdrawal={withdrawal} />)
          )}
        </Section>
      </div>

      <div data-mount-row>
        <Section index="2.0" title="Closed" hint="Most recent first">
          {closed.length === 0 ? (
            <Empty>No closed withdrawals</Empty>
          ) : (
            closed.map(withdrawal => (
              <div
                key={withdrawal.id}
                className="border-t border-rule first:border-t-0 py-3 px-4 flex flex-wrap items-baseline gap-3 text-[13px]"
              >
                <Summary withdrawal={withdrawal} />
                <Tag tone={statusTone[withdrawal.status]}>{withdrawal.status}</Tag>
                {withdrawal.rejectReason && <span className="text-muted">{withdrawal.rejectReason}</span>}
                {withdrawal.txHash && <span className="text-faint break-all">{withdrawal.txHash}</span>}
                <span className="ml-auto text-faint tabular-nums">#{withdrawal.id}</span>
              </div>
            ))
          )}
        </Section>
      </div>
    </>
  );
}
