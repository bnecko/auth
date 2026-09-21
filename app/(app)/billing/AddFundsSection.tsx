import { Download } from "lucide-react";
import { Button } from "@/components/Button";
import { QrCode } from "@/components/QrCode";
import { Section } from "@/components/Section";
import { CopyValue } from "@/app/(app)/developers/apps/[slug]/CopyValue";

export function AddFundsSection({ address, memo }: { address: string; memo: string }) {
  const transferLink = `ton://transfer/${address}?text=${memo}`;

  return (
    <Section title="Add funds" icon={Download} hint="From any TON wallet">
      <div className="flex flex-col gap-4 px-4 py-4">
        <p className="text-[13px] text-secondary">
          Send GRAM to the address below with this memo. The memo is how the payment is matched to
          your account, so it has to be included exactly. One GRAM becomes one btGRAM.
        </p>

        <div className="flex flex-col sm:flex-row gap-5">
          <div className="flex flex-col items-center gap-3 shrink-0 self-start">
            <QrCode text={transferLink} label="Deposit QR code" size={168} />
            {/* A phone cannot scan its own screen, so the same link is also
                offered as something to tap. */}
            <a href={transferLink}>
              <Button variant="secondary" size="sm">
                Open in wallet
              </Button>
            </a>
          </div>

          <div className="flex flex-col gap-3 min-w-0 text-[12px]">
            <div>
              <span className="block text-muted mb-1">Address</span>
              <span className="break-all">
                <CopyValue value={address} label="address" />
              </span>
            </div>
            <div>
              <span className="block text-muted mb-1">Memo</span>
              <CopyValue value={memo} label="memo" />
            </div>
            <p className="text-muted">
              This memo is different from your donation memo, and the two are not interchangeable:
              a donation is a gift, a deposit is a balance you can spend. Send the memo as ordinary
              text, because an encrypted comment cannot be read.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
