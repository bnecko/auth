"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Row, RowLabel, RowValue, Empty } from "./Section";
import { Tag } from "./Tag";
import { revokePasskeyAction } from "@/app/dashboard-actions";
import { Button } from "@/components/Button";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PasswordField } from "@/components/PasswordField";

export function PasskeyManager({
  passkeys,
}: {
  passkeys: { id: string; name: string; lastUsed: string }[];
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");

  async function registerPasskey() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/webauthn/register/generate-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword }),
      });
      const options = await res.json();
      if (!res.ok) throw new Error(options.error || "Failed to initialize registration");

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
        <div className="border-t border-rule first:border-t-0 px-4 py-2.5 text-[13px] flex items-baseline gap-2">
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
            <ConfirmButton
              action={revokePasskeyAction}
              fields={{ credentialId: key.id }}
              label="Revoke"
              triggerVariant="danger"
              tone="danger"
              title={`Revoke ${key.name || "this passkey"}?`}
              message="This passkey can no longer be used to sign in."
              confirmLabel="Revoke passkey"
            />
          </Row>
        ))
      )}

      <div className="border-t border-rule px-4 py-3">
        {adding ? (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-secondary">
              A passkey signs in without your password or the Telegram step, so adding one needs
              your password.
            </p>
            <PasswordField
              label="Current password"
              name="currentPassword"
              autoComplete="current-password"
              fillOnRequest
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={registerPasskey}
                disabled={loading || !currentPassword}
                loading={loading}
              >
                {loading ? "Registering…" : "Continue"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)}>
            Add passkey
          </Button>
        )}
      </div>
    </>
  );
}
