import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Gift, HandCoins } from "lucide-react";
import { Row, RowLabel, RowValue, Section } from "@/components/Section";
import { randomToken } from "@/lib/server/crypto";
import { formatGram, getBalanceNano, getPoolBalanceNano } from "@/lib/server/repositories/billing";
import { getCurrentSession } from "@/lib/server/session";
import { ContributeForm } from "./ContributeForm";
import { contributeToPoolAction } from "./actions";

export const metadata: Metadata = {
  title: "Public pool — bottleneck",
  description: "The shared btGRAM pool: what funds it, what it is for, and how much it holds.",
};

// The figure is the point of the page, and it is promised to be public, so it
// is read on every request rather than cached into a number that was true once.
export const dynamic = "force-dynamic";

export default async function PoolPage() {
  const [poolNano, current] = await Promise.all([getPoolBalanceNano(), getCurrentSession()]);
  const balanceNano = current ? await getBalanceNano(current.user.id) : null;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Public pool</h1>
        <p className="text-[13px] text-muted">A shared btGRAM balance, shown to everyone</p>
      </header>

      <Section title="Balance" icon={Coins} hint="btGRAM">
        <Row>
          <RowLabel>In the pool</RowLabel>
          <RowValue>
            <span className="text-[18px] text-fg">{formatGram(poolNano)}</span>
            <span className="text-[13px] text-muted"> btGRAM</span>
          </RowValue>
          <span />
        </Row>
      </Section>

      <Section title="What it is" icon={Gift}>
        <div className="flex flex-col gap-3 px-4 py-4 text-[13px] text-secondary leading-relaxed">
          <p>
            The pool is funded two ways: by voluntary contributions, and by balances left behind
            when an account is deleted. Anything still held when a deletion completes moves here,
            as the <Link href="/terms" className="text-accent hover:underline">Terms</Link> set
            out.
          </p>
          <p>
            It is used at our discretion for giveaways and similar activities. Nobody can withdraw
            from it, and the total above is the live ledger figure, not a number we type in.
          </p>
        </div>
      </Section>

      <Section title="Contribute" icon={HandCoins} hint="From your balance">
        {current && balanceNano !== null ? (
          <ContributeForm
            action={contributeToPoolAction}
            submission={randomToken(24)}
            balance={formatGram(balanceNano)}
          />
        ) : (
          <Row>
            <RowLabel>Signed out</RowLabel>
            <RowValue>
              <Link href="/login" className="text-accent hover:underline">
                Sign in
              </Link>{" "}
              to contribute from your btGRAM balance.
            </RowValue>
            <span />
          </Row>
        )}
      </Section>
    </>
  );
}
