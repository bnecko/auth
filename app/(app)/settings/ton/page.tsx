import { redirect } from "next/navigation";
import { Eye, Wallet } from "lucide-react";
import { Row, RowLabel, RowValue, Section } from "@/components/Section";
import { Button } from "@/components/Button";
import { findTonWallet } from "@/lib/server/repositories/tonWallets";
import { getCurrentSession } from "@/lib/server/session";
import { shortFriendlyAddress } from "@/lib/server/ton/address";
import { TonConnectPanel } from "./TonConnectPanel";
import { WalletDisplayForm } from "./WalletDisplayForm";
import { unlinkTonWalletAction, updateTonDisplayAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TonWalletPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const wallet = await findTonWallet(current.user.id);

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
              options={[
                {
                  value: "hidden",
                  label: "Hide my wallet",
                  description: "Nobody sees the address. It stays linked to your account.",
                },
                {
                  value: "address",
                  label: "Show my address",
                  description:
                    "The TON blockchain is public: anyone who sees this address can read that wallet's whole balance and transaction history, and tie it to your account. Hiding it later does not undo what was already seen.",
                },
              ]}
            />
          </Section>
        </div>
      )}

      <p className="mt-4 text-[13px] text-muted">
        A linked wallet is never shared with a connected app.
      </p>
    </>
  );
}
