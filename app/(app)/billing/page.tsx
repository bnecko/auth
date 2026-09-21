import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Coins } from "lucide-react";
import { Section } from "@/components/Section";
import { Tag, type Tone } from "@/components/Tag";
import { cryptoEnabled, tonDonationAddress } from "@/lib/server/config";
import { formatGram, getBalanceNano, listEntriesForUser } from "@/lib/server/repositories/billing";
import { listWithdrawalsForUser } from "@/lib/server/repositories/billingWithdrawals";
import { getOrCreateDepositMemo } from "@/lib/server/repositories/tonDonations";
import { findTonWallet } from "@/lib/server/repositories/tonWallets";
import { findKycApplication, type KycStatus } from "@/lib/server/repositories/kyc";
import { isDiditConfigured } from "@/lib/server/kyc/didit";
import { getCurrentSession } from "@/lib/server/session";
import { parseAddress, shortFriendlyAddress } from "@/lib/server/ton/address";
import { AddFundsSection } from "./AddFundsSection";
import { HistorySection } from "./HistorySection";
import { WithdrawSection } from "./WithdrawSection";

export const dynamic = "force-dynamic";

const KYC_STATUS: Record<KycStatus, { label: string; tone: Tone }> = {
  not_started: { label: "Needed to withdraw", tone: "neutral" },
  in_progress: { label: "Started", tone: "info" },
  awaiting_user: { label: "Waiting on you", tone: "warning" },
  in_review: { label: "Being reviewed", tone: "info" },
  approved: { label: "Verified", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  expired: { label: "Expired", tone: "warning" },
  abandoned: { label: "Not finished", tone: "neutral" },
};

export default async function BillingPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!cryptoEnabled()) notFound();

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
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 px-4 py-4">
          <div>
            <span className="block text-[13px] text-muted mb-1.5">Available</span>
            <span className="text-[30px] leading-none tracking-tight text-fg tabular-nums">
              {formatGram(balanceNano)}
            </span>
            <span className="text-[14px] text-muted"> btGRAM</span>
          </div>

          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-[13px]">
            <dt className="text-muted">Identity</dt>
            <dd>
              <Tag tone={KYC_STATUS[kycStatus].tone}>{KYC_STATUS[kycStatus].label}</Tag>
            </dd>
            <dt className="text-muted">Payout wallet</dt>
            <dd className="text-fg">
              {wallet ? (
                shortFriendlyAddress(wallet.address)
              ) : (
                <Link href="/settings/ton" className="text-accent hover:underline">
                  Link a TON wallet
                </Link>
              )}
            </dd>
            <dt className="text-muted">Public pool</dt>
            <dd>
              <Link href="/pool" className="text-accent hover:underline">
                See what it holds, or contribute
              </Link>
            </dd>
          </dl>
        </div>
      </Section>

      {/* Source order is the narrow-screen order: money in, money out, then
          the record of both. From xl up, withdrawing becomes a rail beside
          the other two. The second row takes any spare height, so a tall rail
          never opens a gap between the panels on the left. */}
      <div className="grid items-start gap-x-5 xl:grid-cols-[3fr_2fr] xl:grid-rows-[auto_1fr]">
        {depositTo && memo && (
          <div className="min-w-0 xl:col-start-1">
            <AddFundsSection address={depositTo} memo={memo} />
          </div>
        )}
        <div className="min-w-0 xl:col-start-2 xl:row-start-1 xl:row-span-2">
          <WithdrawSection
            isIdentityVerified={kycStatus === "approved"}
            isFirstAttempt={kycStatus === "not_started"}
            canStartVerification={canStartVerification}
            isVerificationConfigured={isDiditConfigured()}
            walletAddress={wallet?.address ?? null}
            withdrawals={withdrawals}
          />
        </div>
        <div className="min-w-0 xl:col-start-1">
          <HistorySection entries={entries} />
        </div>
      </div>
    </>
  );
}
