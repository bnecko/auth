"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Glyph } from "@/components/Glyph";
import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";

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
    <div className="flex min-h-screen">
      <Sidebar user={{ name: "you", username: "you" }} />
      <div className="flex-1 min-w-0">
        <TopNav trail="account / request bearer" />
        <main className="max-w-[720px] mx-auto px-6 py-10">
          <header className="mb-9">
            <div className="flex items-baseline gap-2 mb-2 text-meta">
              <span className="text-accent">$</span>
              <span className="uppercase tracking-wider text-muted">
                bearer.request
              </span>
            </div>
            <h1 className="text-[32px] tracking-tightest text-fg leading-none mb-3">
              request bearer key
            </h1>
            <p className="text-meta text-muted max-w-prose">
              describe your app and why it needs an api bearer. an admin
              reviews each request manually — you'll see the result on
              your dashboard.
            </p>
          </header>

          {status === "submitted" ? (
            <>
              <div className="border-t border-b border-rule py-5 mb-5">
                <div className="flex items-baseline gap-3 mb-2">
                  <Glyph kind="ok" />
                  <span className="text-meta uppercase tracking-wider text-ok">
                    request queued
                  </span>
                </div>
                <p className="text-meta text-secondary">
                  your request is waiting for admin review. once approved
                  the bearer will appear on your dashboard.
                </p>
              </div>
              <Link href="/">
                <Button variant="secondary">back to dashboard</Button>
              </Link>
            </>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6">
              <Field
                label="app name"
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
                    className="text-meta uppercase tracking-wider text-muted"
                  >
                    reason
                  </label>
                  <span className="text-meta text-faint tabular-nums">
                    {reason.length}/600
                  </span>
                </div>
                <textarea
                  id="reason"
                  name="reason"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="what does this app do, who uses it, why does it need an api bearer?"
                  maxLength={600}
                  required
                  rows={8}
                  className="w-full bg-transparent border-0 border-b border-rule px-1 py-2 text-[13.5px] text-fg placeholder:text-faint focus:outline-none focus:border-accent transition-colors resize-y leading-relaxed"
                />
              </div>

              {error && <Alert tone="danger">{error}</Alert>}

              <div className="flex gap-3 pt-2">
                <Button type="submit" loading={status === "submitting"}>
                  send request
                </Button>
                <Link href="/" className="flex-1">
                  <Button type="button" variant="ghost">
                    cancel
                  </Button>
                </Link>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
