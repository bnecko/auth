import { redirect } from "next/navigation";
import { Eye, Heart, Wallet } from "lucide-react";
import { Row, RowLabel, RowValue, Section } from "@/components/Section";
import { Button } from "@/components/Button";
import { findTonWallet } from "@/lib/server/repositories/tonWallets";
import { getOrCreateDonationMemo } from "@/lib/server/repositories/tonDonations";
import { tonDonationAddress } from "@/lib/server/config";
import { getCurrentSession } from "@/lib/server/session";
import { parseAddress, shortFriendlyAddress } from "@/lib/server/ton/address";
import { TonConnectPanel } from "./TonConnectPanel";
import { DonateSection } from "./DonateSection";
import { WalletDisplayForm } from "./WalletDisplayForm";
import { unlinkTonWalletAction, updateTonDisplayAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TonWalletPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const wallet = await findTonWallet(current.user.id);
  // Parsed rather than trusted: a mistyped address should hide the section,
  // not throw on every render of this page.
  const donationAddress = parseAddress(tonDonationAddress());
  const donateTo = donationAddress?.toString({ urlSafe: true, bounceable: false, testOnly: false });
  // Minted on first visit rather than at sign-up: most accounts never
  // donate, and a memo is only meaningful once someone is looking at it.
  const memo = donateTo ? await getOrCreateDonationMemo(current.user.id) : null;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">TON wallet</h1>
        <p className="text-[13px] text-muted">Prove that you hold a TON address</p>
      </header>

      <Section title="Wallet" icon={Wallet} hint={wallet ? "Verified" : "Not linked"}>
        {wallet ? (
          <>
            <Row>
              <RowLabel>Address</RowLabel>
              <RowValue>
                <code className="text-[12px] text-secondary">
                  {shortFriendlyAddress(wallet.address)}
                </code>
              </RowValue>
              <form action={unlinkTonWalletAction}>
                <Button type="submit" variant="ghost" size="sm">
                  Unlink
                </Button>
              </form>
            </Row>
            <Row>
              <RowLabel>Wallet</RowLabel>
              <RowValue>{wallet.walletVersion}</RowValue>
              <span />
            </Row>
            <Row>
              <RowLabel>Verified</RowLabel>
              <RowValue>
                {wallet.verifiedAt.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </RowValue>
              <span />
            </Row>
          </>
        ) : (
          <TonConnectPanel />
        )}
      </Section>

      {wallet && (
        <div className="mt-6">
          <Section title="Public profile" icon={Eye} hint="Who can see this">
            <WalletDisplayForm
              action={updateTonDisplayAction}
              current={wallet.display}
              currentDomain={wallet.displayDomain}
            />
          </Section>
        </div>
      )}

      {donateTo && memo && (
        <div className="mt-6">
          <Section
            title="Donate"
            icon={Heart}
            hint={current.user.donorSince ? "Donor" : "Optional"}
          >
            {current.user.donorSince ? (
              <Row>
                <RowLabel>Donor since</RowLabel>
                <RowValue>
                  {new Date(current.user.donorSince).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </RowValue>
                <span />
              </Row>
            ) : (
              <DonateSection
                address={donateTo}
                memo={memo}
                transferLink={`ton://transfer/${donateTo}?amount=1000000000&text=${memo}`}
              />
            )}
          </Section>
        </div>
      )}

      <p className="mt-4 text-[13px] text-muted">
        A linked wallet is never shared with a connected app.
      </p>
    </>
  );
}
