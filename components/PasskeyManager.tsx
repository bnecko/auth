"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Row, RowLabel, RowValue, Empty } from "./Section";
import { Tag } from "./Tag";
import { Glyph } from "./Glyph";
import { revokePasskeyAction } from "@/app/dashboard-actions";

export function PasskeyManager({
  passkeys,
}: {
  passkeys: { id: string; name: string; lastUsed: string }[];
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function registerPasskey() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/webauthn/register/generate-options");
      if (!res.ok) throw new Error("Failed to initialize registration");
      const options = await res.json();

      const attResp = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attResp),
      });

      if (!verifyRes.ok) {
        const errorData = await verifyRes.json();
        throw new Error(errorData.error || "Verification failed");
      }

      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to register passkey",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {error && (
        <div className="border-t border-rule first:border-t-0 px-1 py-2.5 text-meta flex items-baseline gap-2">
          <Glyph kind="error" />
          <span className="text-danger">{error}</span>
        </div>
      )}

      {passkeys.length === 0 ? (
        <Empty>no passkeys registered</Empty>
      ) : (
        passkeys.map(key => (
          <Row key={key.id}>
            <RowLabel>{key.name || "unknown device"}</RowLabel>
            <RowValue>
              <Tag tone="success">active</Tag>
              <Glyph kind="dot" />
              <span className="text-muted">
                last used {key.lastUsed.slice(0, 10)}
              </span>
            </RowValue>
            <form action={revokePasskeyAction}>
              <input type="hidden" name="credentialId" value={key.id} />
              <button
                type="submit"
                className="text-meta uppercase tracking-wider text-secondary hover:text-danger transition-colors"
              >
                revoke
              </button>
            </form>
          </Row>
        ))
      )}

      <div className="border-t border-rule px-1 py-3">
        <button
          onClick={registerPasskey}
          disabled={loading}
          className="text-meta uppercase tracking-wider text-accent hover:text-fg transition-colors disabled:text-faint disabled:cursor-not-allowed flex items-baseline gap-2"
        >
          {loading ? (
            <>
              <span className="cursor-blink">▌</span>
              <span>registering</span>
            </>
          ) : (
            <>
              <Glyph kind="ok" />
              <span>add passkey</span>
            </>
          )}
        </button>
      </div>
    </>
  );
}
