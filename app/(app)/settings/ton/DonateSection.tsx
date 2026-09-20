"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { QrCode } from "@/components/QrCode";
import { CopyValue } from "@/app/(app)/developers/apps/[slug]/CopyValue";

// Long enough that a payment has usually settled, short enough that nobody
// sits staring at it. Polling stops either way; the badge also appears on the
// next page load.
const POLL_INTERVAL_MS = 5000;
const POLL_ATTEMPTS = 36;

export function DonateSection({
  address,
  memo,
  transferLink,
}: {
  address: string;
  memo: string;
  transferLink: string;
}) {
  const router = useRouter();
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    if (!watching) return;
    let attempts = 0;
    let cancelled = false;

    const timer = setInterval(async () => {
      attempts += 1;
      if (attempts > POLL_ATTEMPTS) {
        setWatching(false);
        return;
      }
      try {
        const res = await fetch("/api/ton/donation/status");
        if (!res.ok) return;
        const body = await res.json();
        if (body.donor && !cancelled) {
          setWatching(false);
          router.refresh();
        }
      } catch {
        // A failed poll is not worth reporting: the next tick tries again and
        // the badge shows on reload regardless.
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [watching, router]);

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <p className="text-[13px] text-secondary">
        Send at least 1 GRAM to the address below with this memo. The memo is how the payment is
        matched to your account, so it has to be included exactly.
      </p>

      <div className="flex flex-col gap-2 text-[12px]">
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
      </div>

      <p className="text-[12px] text-muted">
        Donations add up, so several smaller ones reach the badge just as well. An encrypted
        comment cannot be read, so send the memo as ordinary text.
      </p>

      <QrCode text={transferLink} label="Donation QR code" size={184} />

      <div className="flex flex-wrap items-center gap-2">
        <a href={transferLink}>
          <Button size="sm">Open in wallet</Button>
        </a>
        <Button variant="ghost" size="sm" onClick={() => setWatching(true)} disabled={watching}>
          {watching ? "Watching for it..." : "I have sent it"}
        </Button>
      </div>
    </div>
  );
}
