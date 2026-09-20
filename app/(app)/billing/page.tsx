import { redirect } from "next/navigation";
import { Coins, Download } from "lucide-react";
import { Row, RowLabel, RowValue, Section } from "@/components/Section";
import { QrCode } from "@/components/QrCode";
import { CopyValue } from "@/app/(app)/developers/apps/[slug]/CopyValue";
import { tonDonationAddress } from "@/lib/server/config";
import {
  formatGram,
  getBalanceNano,
  listEntriesForUser,
} from "@/lib/server/repositories/billing";
import { getOrCreateDepositMemo } from "@/lib/server/repositories/tonDonations";
import { getCurrentSession } from "@/lib/server/session";
import { parseAddress } from "@/lib/server/ton/address";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  deposit: "Deposit",
  charge: "Charge",
  refund: "Refund",
  withdrawal: "Withdrawal",
  forfeit: "Moved to public pool",
  pool_donation: "Donated to public pool",
  adjustment: "Adjustment",
};

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

  const [balanceNano, entries] = await Promise.all([
    getBalanceNano(current.user.id),
    listEntriesForUser(current.user.id),
  ]);

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
                <RowLabel>{LABELS[entry.kind] ?? entry.kind}</RowLabel>
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
