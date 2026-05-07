"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
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
        <main className="max-w-[640px] mx-auto px-6 py-10">
          <header className="mb-7">
            <div className="text-micro uppercase text-faint mb-2">
              api access
            </div>
            <h1 className="text-[24px] tracking-tightest text-fg leading-none mb-3">
              request bearer key
            </h1>
            <p className="text-meta text-muted max-w-prose">
              describe your app and why it needs an api bearer. an admin
              reviews each request manually; you'll see the result on
              your dashboard.
            </p>
          </header>

          {status === "submitted" ? (
            <div className="border border-border bg-surface rounded-sm p-6">
              <div className="text-micro uppercase text-success mb-2">
                request sent
              </div>
              <p className="text-[13.5px] text-secondary mb-5">
                your request is waiting for admin review. once approved
                the bearer will appear on your dashboard.
              </p>
              <Link href="/" className="inline-block">
                <Button variant="secondary">back to dashboard</Button>
              </Link>
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              className="border border-border bg-surface rounded-sm p-6 space-y-4"
            >
              <Field
                label="app name"
                name="appName"
                value={appName}
                onChange={e => setAppName(e.target.value)}
                placeholder="e.g. my-cli-tool"
                maxLength={60}
                required
              />
              <div className="space-y-1.5">
                <label
                  htmlFor="reason"
                  className="text-micro uppercase text-muted"
                >
                  reason
                </label>
                <textarea
                  id="reason"
                  name="reason"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="what does this app do, who uses it, why does it need an api bearer?"
                  maxLength={600}
                  required
                  rows={6}
                  className="w-full bg-bg border border-border px-3 py-2 text-[13.5px] text-fg rounded-sm placeholder:text-faint font-mono focus:outline-none focus:border-fg transition-colors resize-y"
                />
                <p className="text-meta text-muted">
                  {reason.length}/600
                </p>
              </div>
              {error && <Alert tone="danger">{error}</Alert>}
              <div className="flex gap-2 pt-2">
                <Button type="submit" loading={status === "submitting"}>
                  send request
                </Button>
                <Link href="/" className="block flex-1">
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
