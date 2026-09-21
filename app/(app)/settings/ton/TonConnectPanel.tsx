"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TonConnect, { type IStorage, type Wallet } from "@tonconnect/sdk";
import { Button } from "@/components/Button";
import { PasswordField } from "@/components/PasswordField";
import { QrCode } from "@/components/QrCode";
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

type Phase = "idle" | "waiting" | "verifying";

export function TonConnectPanel() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [qrLink, setQrLink] = useState<string | null>(null);
  const [cspBlocked, setCspBlocked] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
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
        const res = await fetch("/api/ton/proof/payload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ currentPassword }),
        });
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
    [submit, currentPassword],
  );

  if (cspBlocked) {
    return (
      <div className="flex flex-col gap-3 px-4 py-4 text-[13px] text-secondary">
        <p>This page needs to be loaded directly before it can reach a wallet.</p>
        <div>
          <Button size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }

  // Padding lives here rather than on the Section, because a Section's other
  // children are Rows that supply their own.
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <p className="text-[13px] text-secondary">
        Connect a wallet to sign a one-off message proving you hold its key. Nothing is sent
        and no transaction is made. Withdrawals are paid to the wallet you link, so linking
        one needs your password.
      </p>

      <PasswordField
        label="Current password"
        name="currentPassword"
        autoComplete="current-password"
        fillOnRequest
        value={currentPassword}
        onChange={event => setCurrentPassword(event.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        {TON_CONNECT_WALLETS.map(wallet => (
          <Button
            key={wallet.id}
            variant="secondary"
            size="sm"
            disabled={!currentPassword}
            onClick={() => void start(wallet)}
          >
            {wallet.name}
          </Button>
        ))}
        <Button variant="ghost" size="sm" disabled={!currentPassword} onClick={() => void start(null)}>
          Show QR code
        </Button>
      </div>

      {qrLink && (
        <div className="flex flex-col items-start gap-2">
          <QrCode text={qrLink} label="TON Connect QR code" />
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
