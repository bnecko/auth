import { Coins } from "lucide-react";
import { Empty, Section } from "@/components/Section";
import { formatGram, type LedgerEntry } from "@/lib/server/repositories/billing";

const LABELS: Record<string, string> = {
  deposit: "Deposit",
  charge: "Charge",
  refund: "Refund",
  withdrawal: "Withdrawal",
  forfeit: "Moved to public pool",
  pool_donation: "Donated to public pool",
  adjustment: "Adjustment",
};

const isDebit = (entry: LedgerEntry) => entry.amountNano.startsWith("-");

// A withdrawal has two legs on the user's account: the hold going out, and the
// same amount coming back if the request was cancelled or declined.
function entryLabel(entry: LedgerEntry) {
  if (entry.kind === "withdrawal" && !isDebit(entry)) return "Withdrawal returned";
  return LABELS[entry.kind] ?? entry.kind;
}

export function HistorySection({ entries }: { entries: LedgerEntry[] }) {
  return (
    <Section title="History" icon={Coins} hint="Most recent first">
      {entries.length === 0 ? (
        <Empty>Deposits and charges appear here.</Empty>
      ) : (
        <ul>
          {entries.map((entry, index) => (
            <li
              key={index}
              className="grid grid-cols-[56px_1fr_auto] items-baseline gap-4 px-4 py-2.5 border-t border-rule first:border-t-0 text-[14px]"
            >
              <span className="text-[12px] text-muted">
                {entry.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              <span className="min-w-0 truncate text-fg">
                {entryLabel(entry)}
                {entry.appName && <span className="text-[12px] text-muted"> via {entry.appName}</span>}
              </span>
              <span className={`tabular-nums text-right ${isDebit(entry) ? "text-secondary" : "text-fg"}`}>
                {isDebit(entry) ? "" : "+"}
                {formatGram(entry.amountNano)}
                <span className="text-[12px] text-muted"> btGRAM</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
