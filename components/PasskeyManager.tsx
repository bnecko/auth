"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Row, RowLabel, RowValue, Empty } from "./Section";
import { Tag } from "./Tag";
import { revokePasskeyAction } from "@/app/dashboard-actions";
import { Button } from "@/components/Button";

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
        <div className="border-t border-rule first:border-t-0 px-1 py-2.5 text-[13px] flex items-baseline gap-2">
          <span className="text-danger">{error}</span>
        </div>
      )}

      {passkeys.length === 0 ? (
        <Empty>No passkeys registered</Empty>
      ) : (
        passkeys.map(key => (
          <Row key={key.id}>
            <RowLabel>{key.name || "Unknown device"}</RowLabel>
            <RowValue>
              <Tag tone="success">Active</Tag>
              <span className="text-faint">·</span>
              <span className="text-muted">
                Last used {key.lastUsed.slice(0, 10)}
              </span>
            </RowValue>
            <form action={revokePasskeyAction}>
              <input type="hidden" name="credentialId" value={key.id} />
              <Button type="submit" variant="danger" size="sm">
                Revoke
              </Button>
            </form>
          </Row>
        ))
      )}

      <div className="border-t border-rule px-1 py-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={registerPasskey}
          disabled={loading}
          loading={loading}
        >
          {loading ? "Registering…" : "Add passkey"}
        </Button>
      </div>
    </>
  );
}
