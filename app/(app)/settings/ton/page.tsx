import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { Row, RowLabel, RowValue, Section } from "@/components/Section";
import { Button } from "@/components/Button";
import { findTonWallet } from "@/lib/server/repositories/tonWallets";
import { getCurrentSession } from "@/lib/server/session";
import { toFriendlyAddress } from "@/lib/server/ton/address";
import { TonConnectPanel } from "./TonConnectPanel";
import { unlinkTonWalletAction } from "./actions";

export const dynamic = "force-dynamic";

function shortAddress(address: string) {
  const friendly = toFriendlyAddress(address);
  return `${friendly.slice(0, 6)}...${friendly.slice(-6)}`;
}

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
                <code className="text-[12px] text-secondary">{shortAddress(wallet.address)}</code>
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

      <p className="mt-4 text-[13px] text-muted">
        A linked wallet is private: it is not shown on your public profile and is not shared
        with any connected app.
      </p>
    </>
  );
}
