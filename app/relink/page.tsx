"use client";

import { useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { Field } from "@/components/Field";
import { Cursor } from "@/components/Glyph";

type Step = "send" | "enter_code" | "bot_link" | "success" | "error";

const OTP_TTL = 600;

export default function RelinkPage() {
  const [step, setStep] = useState<Step>("send");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [botUrl, setBotUrl] = useState("");
  const [browserToken, setBrowserToken] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL);

  async function sendCode() {
    setSending(true);
    setError("");
    const res = await fetch("/api/auth/relink/initiate", { method: "POST" });
    const data = await res.json() as { ok?: boolean; error?: string };
    setSending(false);
    if (!res.ok) {
      if (data.error === "no_telegram_linked") {
        setError("No Telegram account is linked to this account yet.");
      } else {
        setError(data.error || "Failed to send code. Try again.");
      }
      return;
    }
    setSecondsLeft(OTP_TTL);
    setStep("enter_code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError("");
    const res = await fetch("/api/auth/relink/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json() as { browserToken?: string; botUrl?: string; error?: string };
    setVerifying(false);
    if (!res.ok) {
      setError(data.error || "Incorrect code. Check your Telegram and try again.");
      return;
    }
    setBrowserToken(data.browserToken!);
    setBotUrl(data.botUrl!);
    setStep("bot_link");
  }

  async function pollStatus() {
    if (!browserToken) return;
    const res = await fetch(`/api/auth/relink/status?t=${encodeURIComponent(browserToken)}`);
    const data = await res.json() as { status?: string };
    if (data.status === "verified") {
      setStep("success");
      setTimeout(() => { window.location.href = "/"; }, 1500);
    } else if (data.status === "conflict") {
      setError("That Telegram account is already linked to a different Bottleneck account.");
      setStep("error");
    } else if (data.status === "expired") {
      setError("The session expired. Start over.");
      setStep("error");
    }
  }

  useEffect(() => {
    if (step !== "bot_link") return;
    const id = setInterval(pollStatus, 2500);
    return () => clearInterval(id);
  }, [step, browserToken]);

  useEffect(() => {
    if (step !== "enter_code") return;
    const id = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(id);
          setError("The code expired. Request a new one.");
          setStep("send");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = (secondsLeft % 60).toString().padStart(2, "0");

  return (
    <AuthShell tag="account/relink">
      <h1 className="text-[28px] tracking-tightest text-fg mb-1 leading-none">
        relink telegram
      </h1>
      <p className="text-meta text-muted mb-7">
        {step === "send" && "confirm ownership of your linked account before relinking"}
        {step === "enter_code" && "enter the code sent to your linked telegram"}
        {step === "bot_link" && "open the bot to complete the relink"}
        {step === "success" && "telegram account relinked — redirecting"}
        {step === "error" && "something went wrong"}
      </p>

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {step === "success" && <Alert tone="success">relinked successfully</Alert>}

      {step === "send" && (
        <Button onClick={sendCode} loading={sending}>
          send code to telegram
        </Button>
      )}

      {step === "enter_code" && (
        <form onSubmit={verifyCode} className="space-y-5">
          <div className="border-t border-rule">
            <div className="flex items-baseline justify-between py-2.5">
              <span className="text-meta uppercase tracking-wider text-muted">
                one-time code
              </span>
              <span className="text-meta text-accent tabular-nums">
                expires {mins}:{secs}
              </span>
            </div>
            <div className="border-t border-rule" />
          </div>
          <Field
            label="10-character code"
            name="code"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXXX"
            autoComplete="one-time-code"
            required
          />
          <Button type="submit" loading={verifying}>
            verify code
          </Button>
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              setError("");
              sendCode();
            }}
          >
            resend code
          </Button>
        </form>
      )}

      {step === "bot_link" && (
        <>
          <div className="border-t border-rule mb-3">
            <div className="flex items-baseline justify-between py-2.5">
              <span className="text-meta uppercase tracking-wider text-muted">
                channel
              </span>
              <span className="text-meta text-fg">telegram</span>
            </div>
            <div className="border-t border-rule" />
          </div>
          <p className="text-meta text-secondary mb-5">
            open the bot link from the telegram account you want to link.
          </p>
          <a href={botUrl} target="_blank" rel="noreferrer" className="block mb-3">
            <Button type="button">open telegram bot</Button>
          </a>
          <div className="flex items-baseline gap-2 text-meta uppercase tracking-wider text-muted my-5">
            <Cursor />
            <span>waiting for telegram</span>
          </div>
        </>
      )}

      {step === "error" && (
        <Button
          onClick={() => {
            setError("");
            setStep("send");
          }}
        >
          start over
        </Button>
      )}

      {(step === "send" || step === "enter_code") && (
        <div className="mt-4">
          <Button
            variant="ghost"
            type="button"
            onClick={() => window.location.assign("/")}
          >
            cancel
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
