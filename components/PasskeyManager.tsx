"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Row, RowLabel, RowValue, Empty } from "./Section";
import { Tag } from "./Tag";
import { revokePasskeyAction } from "@/app/dashboard-actions";

export function PasskeyManager({ passkeys }: { passkeys: { id: string, name: string, lastUsed: string }[] }) {
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
      setError(err instanceof Error ? err.message : "Failed to register passkey");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {error && (
        <Row>
          <div className="text-danger text-micro uppercase px-4 py-3">{error}</div>
        </Row>
      )}
      
      {passkeys.length === 0 ? (
        <Empty>no passkeys registered</Empty>
      ) : (
        passkeys.map(key => (
          <Row key={key.id}>
            <RowLabel>{key.name || "Unknown Device"}</RowLabel>
            <RowValue>
              <Tag tone="success">active</Tag>
              <span className="text-faint">/</span>
              <span className="text-muted">last used {key.lastUsed.slice(0, 10)}</span>
            </RowValue>
            <form action={revokePasskeyAction}>
              <input type="hidden" name="credentialId" value={key.id} />
              <button
                type="submit"
                className="text-meta text-secondary hover:text-danger transition-colors"
              >
                revoke
              </button>
            </form>
          </Row>
        ))
      )}

      <div className="px-4 py-3 border-t border-border bg-bg/50">
        <button
          onClick={registerPasskey}
          disabled={loading}
          className="text-micro uppercase tracking-[0.08em] font-medium text-fg hover:text-success transition-colors disabled:text-faint disabled:cursor-not-allowed"
        >
          {loading ? "registering..." : "+ add passkey"}
        </button>
      </div>
    </>
  );
}
