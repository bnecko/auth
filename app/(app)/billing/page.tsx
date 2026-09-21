import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Coins, Download, Upload } from "lucide-react";
import { Button } from "@/components/Button";
import { Row, RowLabel, RowValue, Section } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { QrCode } from "@/components/QrCode";
import { CopyValue } from "@/app/(app)/developers/apps/[slug]/CopyValue";
import { tonDonationAddress } from "@/lib/server/config";
import {
  formatGram,
  getBalanceNano,
  listEntriesForUser,
  type LedgerEntry,
} from "@/lib/server/repositories/billing";
import {
  listWithdrawalsForUser,
  MIN_WITHDRAWAL_NANO,
  OPEN_WITHDRAWAL_STATUSES,
  type WithdrawalStatus,
} from "@/lib/server/repositories/billingWithdrawals";
import { getOrCreateDepositMemo } from "@/lib/server/repositories/tonDonations";
import { findTonWallet } from "@/lib/server/repositories/tonWallets";
import { findKycApplication } from "@/lib/server/repositories/kyc";
import { isDiditConfigured } from "@/lib/server/kyc/didit";
import { VerifyIdentityForm } from "./VerifyIdentityForm";
import { WithdrawForm } from "./WithdrawForm";
import {
  cancelWithdrawalAction,
  requestWithdrawalAction,
  startVerificationAction,
} from "./actions";
import { getCurrentSession } from "@/lib/server/session";
import { parseAddress, shortFriendlyAddress } from "@/lib/server/ton/address";

export const dynamic = "force-dynamic";

const KYC_HINT: Record<string, string> = {
  not_started: "Needed to withdraw",
  in_progress: "Started",
  awaiting_user: "Waiting on you",
  in_review: "Being reviewed",
  approved: "Verified",
  declined: "Declined",
  expired: "Expired",
  abandoned: "Not finished",
};

const WITHDRAWAL_STATUS: Record<WithdrawalStatus, { label: string; tone: "neutral" | "success" | "danger" | "warning" | "info" }> = {
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

const LABELS: Record<string, string> = {
  deposit: "Deposit",
  charge: "Charge",
  refund: "Refund",
  withdrawal: "Withdrawal",
  forfeit: "Moved to public pool",
  pool_donation: "Donated to public pool",
  adjustment: "Adjustment",
};

// A withdrawal has two legs on the user's account: the hold going out, and the
// same amount coming back if the request was cancelled or declined.
function entryLabel(entry: LedgerEntry) {
  if (entry.kind === "withdrawal" && !entry.amountNano.startsWith("-")) return "Withdrawal returned";
  return LABELS[entry.kind] ?? entry.kind;
}

export default async function BillingPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");

  // Parsed rather than trusted, so a mistyped address hides the deposit panel
  // instead of throwing on every render.
  const address = parseAddress(tonDonationAddress());
  const depositTo = address?.toString({ urlSafe: true, bounceable: false, testOnly: false });
  // Minted on first visit: most accounts never deposit, and a memo only means
  // something once someone is looking at it.
  const memo = depositTo ? await getOrCreateDepositMemo(current.user.id) : null;

  const [balanceNano, entries, kyc, wallet, withdrawals] = await Promise.all([
    getBalanceNano(current.user.id),
    listEntriesForUser(current.user.id),
    findKycApplication(current.user.id),
    findTonWallet(current.user.id),
    listWithdrawalsForUser(current.user.id, 5),
  ]);

  const kycStatus = kyc?.status ?? "not_started";
  const hasOpenWithdrawal = withdrawals.some(w => OPEN_WITHDRAWAL_STATUSES.includes(w.status));
  // Re-verifying after passing only risks losing the approval, and a finished
  // submission is waiting on a reviewer rather than on the user.
  const canStartVerification =
    isDiditConfigured() && !["approved", "in_review", "awaiting_user"].includes(kycStatus);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Billing</h1>
        <p className="text-[13px] text-muted">Your btGRAM balance</p>
      </header>

      <Section title="Balance" icon={Coins} hint="btGRAM">
        <Row>
          <RowLabel>Available</RowLabel>
          <RowValue>
            <span className="text-[18px] text-fg">{formatGram(balanceNano)}</span>
            <span className="text-[13px] text-muted"> btGRAM</span>
          </RowValue>
          <span />
        </Row>
        <Row>
          <RowLabel>Public pool</RowLabel>
          <RowValue>
            <Link href="/pool" className="text-accent hover:underline">
              See what the shared pool holds, or contribute to it
            </Link>
          </RowValue>
          <span />
        </Row>
      </Section>

      {depositTo && memo && (
        <div className="mt-6">
          <Section title="Add funds" icon={Download} hint="From any TON wallet">
            <div className="flex flex-col gap-3 px-4 py-4">
              <p className="text-[13px] text-secondary">
                Send GRAM to the address below with this memo. The memo is how the payment is
                matched to your account, so it has to be included exactly. One GRAM becomes one
                btGRAM.
              </p>

              <div className="flex flex-col gap-2 text-[12px]">
                <div>
                  <span className="block text-muted mb-1">Address</span>
                  <span className="break-all">
                    <CopyValue value={depositTo} label="address" />
                  </span>
                </div>
                <div>
                  <span className="block text-muted mb-1">Memo</span>
                  <CopyValue value={memo} label="memo" />
                </div>
              </div>

              <p className="text-[12px] text-muted">
                This memo is different from your donation memo, and the two are not
                interchangeable: a donation is a gift, a deposit is a balance you can spend. Send
                the memo as ordinary text, because an encrypted comment cannot be read.
              </p>

              <QrCode
                text={`ton://transfer/${depositTo}?text=${memo}`}
                label="Deposit QR code"
                size={184}
              />
            </div>
          </Section>
        </div>
      )}

      <div className="mt-6">
        <Section title="Withdraw" icon={Upload} hint="To your verified wallet">
          {kycStatus !== "approved" ? (
            <Row>
              <RowLabel>Not yet</RowLabel>
              <RowValue>Verify your identity below and withdrawals open up.</RowValue>
              <span />
            </Row>
          ) : !wallet ? (
            <Row>
              <RowLabel>No wallet</RowLabel>
              <RowValue>
                Withdrawals are only paid to a wallet you have proved is yours.{" "}
                <Link href="/settings/ton" className="text-accent hover:underline">
                  Link a TON wallet
                </Link>
              </RowValue>
              <span />
            </Row>
          ) : (
            !hasOpenWithdrawal && (
              <WithdrawForm
                action={requestWithdrawalAction}
                destination={shortFriendlyAddress(wallet.address)}
                minimum={formatGram(MIN_WITHDRAWAL_NANO.toString())}
              />
            )
          )}

          {withdrawals.map(withdrawal => (
            <Row key={withdrawal.id}>
              <RowLabel>
                <Tag tone={WITHDRAWAL_STATUS[withdrawal.status].tone}>
                  {WITHDRAWAL_STATUS[withdrawal.status].label}
                </Tag>
              </RowLabel>
              <RowValue>
                <span className="text-fg">{formatGram(withdrawal.amountNano)} GRAM</span>
                <span className="text-[12px] text-muted">
                  {" "}
                  to {shortFriendlyAddress(withdrawal.destination)}
                </span>
                {withdrawal.txHash && (
                  <a
                    href={transactionUrl(withdrawal.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] text-accent hover:underline"
                  >
                    {" "}
                    view transaction
                  </a>
                )}
                {withdrawal.rejectReason && (
                  <span className="block text-[12px] text-muted">{withdrawal.rejectReason}</span>
                )}
              </RowValue>
              {withdrawal.status === "requested" ? (
                <form action={cancelWithdrawalAction}>
                  <input type="hidden" name="withdrawalId" value={withdrawal.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Cancel
                  </Button>
                </form>
              ) : (
                <span className="text-[12px] text-muted">
                  {withdrawal.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </Row>
          ))}
        </Section>
      </div>

      <div className="mt-6">
        <Section title="Identity" icon={BadgeCheck} hint={KYC_HINT[kycStatus] ?? kycStatus}>
          {kycStatus === "approved" ? (
            <Row>
              <RowLabel>Status</RowLabel>
              <RowValue>Verified, so withdrawals are available to you.</RowValue>
              <span />
            </Row>
          ) : canStartVerification ? (
            <VerifyIdentityForm
              action={startVerificationAction}
              label={kycStatus === "not_started" ? "Verify identity" : "Try again"}
            />
          ) : (
            <Row>
              <RowLabel>Status</RowLabel>
              <RowValue>
                {isDiditConfigured()
                  ? "Your submission is with our verification partner. Nothing more to do."
                  : "Identity verification is not available yet."}
              </RowValue>
              <span />
            </Row>
          )}
        </Section>
      </div>

      <div className="mt-6">
        <Section title="History" icon={Coins} hint="Most recent first">
          {entries.length === 0 ? (
            <Row>
              <RowLabel>Nothing yet</RowLabel>
              <RowValue>
                <span className="text-muted italic">Deposits and charges appear here.</span>
              </RowValue>
              <span />
            </Row>
          ) : (
            entries.map((entry, index) => (
              <Row key={index}>
                <RowLabel>{entryLabel(entry)}</RowLabel>
                <RowValue>
                  <span className={entry.amountNano.startsWith("-") ? "text-secondary" : "text-fg"}>
                    {formatGram(entry.amountNano)} btGRAM
                  </span>
                  {entry.appName && <span className="text-[12px] text-muted"> via {entry.appName}</span>}
                </RowValue>
                <span className="text-[12px] text-muted">
                  {entry.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </Row>
            ))
          )}
        </Section>
      </div>
    </>
  );
}
