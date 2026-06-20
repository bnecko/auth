"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";

type Status = "idle" | "submitting" | "submitted" | "error";

export default function RequestBearerPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [appName, setAppName] = useState("");
  const [reason, setReason] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    try {
      const response = await fetch("/api/bearer-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appName, reason }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error || "request failed");
        setStatus("error");
        return;
      }

      setStatus("submitted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
      setStatus("error");
    }
  }

  return (
    <>
      <div className="max-w-[640px]">
          <header className="mb-9">
            <p className="text-[12px] text-muted mb-2">Bearer request</p>
            <h1 className="text-[32px] tracking-tight text-fg leading-none mb-3">
              Request bearer key
            </h1>
            <p className="text-[14px] text-muted max-w-prose">
              Describe your app and why it needs an API bearer. An admin
              reviews each request manually - you'll see the result on
              your dashboard.
            </p>
          </header>

          {status === "submitted" ? (
            <>
              <Alert tone="success" className="mb-5">
                <p className="font-medium mb-1">Request queued</p>
                <p>
                  Your request is waiting for admin review. Once approved
                  the bearer will appear on your dashboard.
                </p>
              </Alert>
              <Link href="/">
                <Button variant="secondary">Back to dashboard</Button>
              </Link>
            </>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6">
              <Field
                label="App name"
                name="appName"
                value={appName}
                onChange={e => setAppName(e.target.value)}
                placeholder="my-cli-tool"
                maxLength={60}
                required
              />

              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <label
                    htmlFor="reason"
                    className="text-[13px] text-muted"
                  >
                    Reason
                  </label>
                  <span className="text-[12px] text-faint tabular-nums">
                    {reason.length}/600
                  </span>
                </div>
                <textarea
                  id="reason"
                  name="reason"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="What does this app do, who uses it, why does it need an API bearer?"
                  maxLength={600}
                  required
                  rows={8}
                  className="w-full bg-card border border-rule rounded-md px-3 py-2 text-[13.5px] text-fg placeholder:text-faint focus:outline-hidden focus:border-accent transition-colors resize-y leading-relaxed"
                />
              </div>

              {error && <Alert tone="danger">{error}</Alert>}

              <div className="flex gap-3 pt-2">
                <Button type="submit" loading={status === "submitting"}>
                  Send request
                </Button>
                <Link href="/" className="flex-1">
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </Link>
              </div>
            </form>
          )}
      </div>
    </>
  );
}
