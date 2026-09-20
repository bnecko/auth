"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TonConnect, { type IStorage, type Wallet } from "@tonconnect/sdk";
import { encode } from "uqr";
import { Button } from "@/components/Button";
import { TON_CONNECT_WALLETS, type TonConnectWallet } from "@/lib/tonConnectWallets";

// Keeps the protocol session out of localStorage. Linking is a one-shot
// action, so nothing about it should outlive the page, and a session left
// behind would be restored on the next visit by code that then has to fetch
// the remote wallet list to do it.
class MemoryStorage implements IStorage {
  private readonly entries = new Map<string, string>();

  async setItem(key: string, value: string) {
    this.entries.set(key, value);
  }

  async getItem(key: string) {
    return this.entries.get(key) ?? null;
  }

  async removeItem(key: string) {
    this.entries.delete(key);
  }
}

// Drawn as one path of 1x1 squares rather than through the library's SVG
// renderer, because the production style-src has no 'unsafe-inline' and any
// style attribute in the markup would be dropped.
function QrCode({ text }: { text: string }) {
  const { size, data } = encode(text, { ecc: "M" });
  const quiet = 2;
  const extent = size + quiet * 2;

  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y][x]) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${extent} ${extent}`}
      width={216}
      height={216}
      shapeRendering="crispEdges"
      role="img"
      aria-label="TON Connect QR code"
      className="rounded-md"
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}

type Phase = "idle" | "waiting" | "verifying";

export function TonConnectPanel() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [qrLink, setQrLink] = useState<string | null>(null);
  const [cspBlocked, setCspBlocked] = useState(false);
  const connector = useRef<TonConnect | null>(null);

  // A soft navigation keeps the CSP of whichever document loaded first, so
  // arriving here from another settings tab leaves the bridge origins out of
  // connect-src and every attempt fails. Offer the reload that fixes it
  // instead of letting the user retry into the same wall.
  useEffect(() => {
    const onViolation = (event: SecurityPolicyViolationEvent) => {
      if (event.violatedDirective.startsWith("connect-src")) setCspBlocked(true);
    };
    document.addEventListener("securitypolicyviolation", onViolation);
    return () => document.removeEventListener("securitypolicyviolation", onViolation);
  }, []);

  const teardown = useCallback(() => {
    connector.current?.disconnect().catch(() => {});
    connector.current = null;
    setQrLink(null);
    setPhase("idle");
  }, []);

  useEffect(() => teardown, [teardown]);

  const submit = useCallback(
    async (connected: Wallet) => {
      const reply = connected.connectItems?.tonProof;
      if (!reply || !("proof" in reply)) {
        setError("That wallet did not return a signature. Try another wallet.");
        teardown();
        return;
      }

      setPhase("verifying");
      try {
        const res = await fetch("/api/ton/proof/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            address: connected.account.address,
            network: connected.account.chain,
            walletStateInit: connected.account.walletStateInit,
            proof: reply.proof,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not verify that wallet.");
        teardown();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not verify that wallet.");
        teardown();
      }
    },
    [router, teardown],
  );

  const start = useCallback(
    async (wallet: TonConnectWallet | null) => {
      setError(null);
      setCspBlocked(false);
      connector.current?.disconnect().catch(() => {});

      let payload: string;
      try {
        const res = await fetch("/api/ton/proof/payload", { method: "POST" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not start a connection.");
        payload = body.payload;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start a connection.");
        return;
      }

      const session = new TonConnect({
        manifestUrl: `${window.location.origin}/tonconnect-manifest.json`,
        storage: new MemoryStorage(),
        // Defaults to sending technical events to analytics.ton.org, and
        // inside Telegram those carry the viewer's Telegram id.
        analytics: { mode: "off" },
      });
      connector.current = session;
      session.onStatusChange(
        connected => {
          if (connected) void submit(connected);
        },
        () => setError("The wallet connection failed. Try again."),
      );

      const request = { request: { tonProof: payload } };
      const link = wallet
        ? session.connect({ universalLink: wallet.universalLink, bridgeUrl: wallet.bridgeUrl }, request)
        : session.connect(
            TON_CONNECT_WALLETS.map(entry => ({ bridgeUrl: entry.bridgeUrl })),
            request,
          );

      setPhase("waiting");
      if (wallet) {
        window.location.href = link;
      } else {
        setQrLink(link);
      }
    },
    [submit],
  );

  if (cspBlocked) {
    return (
      <div className="text-[13px] text-secondary">
        <p className="mb-3">
          This page needs to be loaded directly before it can reach a wallet.
        </p>
        <Button size="sm" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-secondary">
        Connect a wallet to sign a one-off message proving you hold its key. Nothing is sent
        and no transaction is made.
      </p>

      <div className="flex flex-wrap gap-2">
        {TON_CONNECT_WALLETS.map(wallet => (
          <Button key={wallet.id} variant="secondary" size="sm" onClick={() => void start(wallet)}>
            {wallet.name}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => void start(null)}>
          Show QR code
        </Button>
      </div>

      {qrLink && (
        <div className="flex flex-col items-start gap-2">
          <QrCode text={qrLink} />
          <p className="text-[12px] text-muted">
            Scan with any TON wallet, then approve the signature request.
          </p>
        </div>
      )}

      {phase === "waiting" && !qrLink && (
        <p className="text-[13px] text-muted">Waiting for the wallet to respond...</p>
      )}
      {phase === "verifying" && <p className="text-[13px] text-muted">Verifying the signature...</p>}

      {phase !== "idle" && (
        <div>
          <Button variant="ghost" size="sm" onClick={teardown}>
            Cancel
          </Button>
        </div>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}
    </div>
  );
}
