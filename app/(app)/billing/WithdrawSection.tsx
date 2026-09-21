import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/Button";
import { Section } from "@/components/Section";
import { Tag, type Tone } from "@/components/Tag";
import { formatGram } from "@/lib/server/repositories/billing";
import {
  MIN_WITHDRAWAL_NANO,
  OPEN_WITHDRAWAL_STATUSES,
  type Withdrawal,
  type WithdrawalStatus,
} from "@/lib/server/repositories/billingWithdrawals";
import { shortFriendlyAddress } from "@/lib/server/ton/address";
import { VerifyIdentityForm } from "./VerifyIdentityForm";
import { WithdrawForm } from "./WithdrawForm";
import { cancelWithdrawalAction, requestWithdrawalAction, startVerificationAction } from "./actions";

const WITHDRAWAL_STATUS: Record<WithdrawalStatus, { label: string; tone: Tone }> = {
  requested: { label: "Waiting for review", tone: "warning" },
  approved: { label: "Approved, being sent", tone: "info" },
  sent: { label: "Sent, confirming", tone: "info" },
  confirmed: { label: "Paid", tone: "success" },
  rejected: { label: "Declined", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

// The indexer reports transaction hashes in base64 and explorers want hex.
const transactionUrl = (hash: string) =>
  `https://tonviewer.com/transaction/${Buffer.from(hash, "base64").toString("hex")}`;

const shortDate = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

function IdentityGate({
  isFirstAttempt,
  canStartVerification,
  isVerificationConfigured,
}: {
  isFirstAttempt: boolean;
  canStartVerification: boolean;
  isVerificationConfigured: boolean;
}) {
  if (canStartVerification) {
    return (
      <VerifyIdentityForm
        action={startVerificationAction}
        label={isFirstAttempt ? "Verify identity" : "Try again"}
      />
    );
  }
  return (
    <p className="px-4 py-4 text-[13px] text-secondary">
      {isVerificationConfigured
        ? "Your submission is with our verification partner. Nothing more to do."
        : "Identity verification is not available yet."}
    </p>
  );
}

function WithdrawalItem({ withdrawal }: { withdrawal: Withdrawal }) {
  const status = WITHDRAWAL_STATUS[withdrawal.status];
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3 border-t border-rule first:border-t-0">
      <div className="min-w-0">
        <div className="text-[14px] text-fg tabular-nums">{formatGram(withdrawal.amountNano)} GRAM</div>
        <div className="text-[12px] text-muted">
          to {shortFriendlyAddress(withdrawal.destination)}, {shortDate(withdrawal.createdAt)}
          {withdrawal.txHash && (
            <>
              {", "}
              <a
                href={transactionUrl(withdrawal.txHash)}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                view transaction
              </a>
            </>
          )}
        </div>
        {withdrawal.rejectReason && (
          <div className="text-[12px] text-muted mt-0.5">{withdrawal.rejectReason}</div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Tag tone={status.tone}>{status.label}</Tag>
        {withdrawal.status === "requested" && (
          <form action={cancelWithdrawalAction}>
            <input type="hidden" name="withdrawalId" value={withdrawal.id} />
            <Button type="submit" variant="ghost" size="sm">
              Cancel
            </Button>
          </form>
        )}
      </div>
    </li>
  );
}

export function WithdrawSection({
  isIdentityVerified,
  isFirstAttempt,
  canStartVerification,
  isVerificationConfigured,
  walletAddress,
  withdrawals,
}: {
  isIdentityVerified: boolean;
  isFirstAttempt: boolean;
  canStartVerification: boolean;
  isVerificationConfigured: boolean;
  walletAddress: string | null;
  withdrawals: Withdrawal[];
}) {
  const hasOpenWithdrawal = withdrawals.some(w => OPEN_WITHDRAWAL_STATUSES.includes(w.status));

  return (
    <Section title="Withdraw" icon={Upload} hint="To your verified wallet">
      {!isIdentityVerified ? (
        <IdentityGate
          isFirstAttempt={isFirstAttempt}
          canStartVerification={canStartVerification}
          isVerificationConfigured={isVerificationConfigured}
        />
      ) : !walletAddress ? (
        <p className="px-4 py-4 text-[13px] text-secondary">
          Withdrawals are only paid to a wallet you have proved is yours.{" "}
          <Link href="/settings/ton" className="text-accent hover:underline">
            Link a TON wallet
          </Link>
        </p>
      ) : (
        !hasOpenWithdrawal && (
          <WithdrawForm
            action={requestWithdrawalAction}
            destination={shortFriendlyAddress(walletAddress)}
            minimum={formatGram(MIN_WITHDRAWAL_NANO.toString())}
          />
        )
      )}

      {withdrawals.length > 0 && (
        <ul className="border-t border-rule first:border-t-0">
          {withdrawals.map(withdrawal => (
            <WithdrawalItem key={withdrawal.id} withdrawal={withdrawal} />
          ))}
        </ul>
      )}
    </Section>
  );
}
