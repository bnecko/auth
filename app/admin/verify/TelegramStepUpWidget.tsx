"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Alert } from "@/components/Alert";

export function TelegramStepUpWidget({
  botUsername: _botUsername,
  callbackUrl: _callbackUrl,
}: {
  botUsername: string;
  callbackUrl: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"send" | "enter">("send");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendCode() {
    setError("");
    setLoading(true);
    const res = await fetch("/api/admin/step-up/initiate", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(
        data.error === "no_telegram"
          ? "No Telegram account linked to this admin account."
          : data.error || "Failed to send code.",
      );
      return;
    }
    setStep("enter");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/admin/step-up/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Invalid code.");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-secondary text-center">
        A one-time code will be sent to your linked Telegram account.
      </p>

      {error && <Alert tone="danger">{error}</Alert>}

      {step === "send" ? (
        <Button onClick={sendCode} loading={loading}>
          send code via telegram
        </Button>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-3">
          <Field
            label="verification code"
            name="code"
            type="text"
            autoComplete="one-time-code"
            placeholder="XXXXXXXX"
            value={code}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCode(e.target.value.toUpperCase())
            }
            required
          />
          <Button type="submit" loading={loading}>
            verify
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep("send");
              setCode("");
              setError("");
            }}
            className="text-meta text-muted hover:text-secondary transition-colors text-center"
          >
            resend code
          </button>
        </form>
      )}
    </div>
  );
}
