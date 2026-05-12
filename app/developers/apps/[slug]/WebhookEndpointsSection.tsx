"use client";

import { useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Tag } from "@/components/Tag";
import {
  createWebhookEndpointAction,
  deleteWebhookEndpointAction,
  disableWebhookEndpointAction,
} from "./actions";

type Endpoint = {
  publicId: string;
  url: string;
  eventTypes: string[];
  status: "active" | "disabled";
  createdAt: string;
};

const EVENT_OPTIONS = [
  { value: "activation.approved", label: "Activation approved" },
  { value: "activation.denied", label: "Activation denied" },
  { value: "activation.cancelled", label: "Activation cancelled" },
];

export function WebhookEndpointsSection({
  appId,
  endpoints,
}: {
  appId: number;
  endpoints: Endpoint[];
}) {
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(formData: FormData) {
    setBusy(true);
    setError("");
    setRevealedSecret(null);
    try {
      const result = await createWebhookEndpointAction(formData);
      if (result?.secret) {
        setRevealedSecret(result.secret);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create endpoint");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-border bg-surface rounded-sm p-6">
      <h2 className="text-micro uppercase tracking-[0.08em] text-muted mb-4">
        Webhook endpoints
      </h2>

      {error && <Alert tone="danger">{error}</Alert>}
      {revealedSecret && (
        <Alert tone="warning">
          <div className="mb-1">
            This is the only time the signing secret will be shown. Copy it now.
          </div>
          <code className="block font-mono select-all text-[12px] mt-1 break-all">
            {revealedSecret}
          </code>
        </Alert>
      )}

      {endpoints.length === 0 ? (
        <p className="text-meta text-faint mb-4">No webhook endpoints yet.</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {endpoints.map(ep => (
            <li
              key={ep.publicId}
              className="border border-border rounded-sm px-3 py-2 flex items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="text-[12px] text-fg truncate">{ep.url}</code>
                  <Tag tone={ep.status === "active" ? "success" : "neutral"} bracket={false}>
                    {ep.status}
                  </Tag>
                </div>
                <div className="text-meta text-muted mt-1">
                  {ep.eventTypes.join(", ") || "no events"}
                </div>
              </div>
              <div className="flex items-center gap-3 text-meta">
                {ep.status === "active" && (
                  <form action={disableWebhookEndpointAction}>
                    <input type="hidden" name="app_id" value={appId} />
                    <input type="hidden" name="endpoint_id" value={ep.publicId} />
                    <button
                      type="submit"
                      className="text-secondary hover:text-warning transition-colors"
                    >
                      disable
                    </button>
                  </form>
                )}
                <form action={deleteWebhookEndpointAction}>
                  <input type="hidden" name="app_id" value={appId} />
                  <input type="hidden" name="endpoint_id" value={ep.publicId} />
                  <button
                    type="submit"
                    className="text-secondary hover:text-danger transition-colors"
                  >
                    delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={create} className="space-y-3 pt-4 border-t border-border">
        <input type="hidden" name="app_id" value={appId} />
        <div>
          <label className="block text-[13px] font-medium text-fg mb-1.5">
            Endpoint URL
          </label>
          <input
            type="url"
            name="url"
            required
            placeholder="https://app.example.com/webhooks/bottleneck"
            className="w-full rounded-sm border border-border bg-bg px-3 py-2 text-[13px] text-fg focus:outline-none focus:ring-1 focus:ring-border font-mono"
          />
          <p className="text-faint text-[12px] mt-1.5">
            HTTPS required (or http://localhost in development).
          </p>
        </div>
        <div>
          <label className="block text-[13px] font-medium text-fg mb-1.5">
            Events
          </label>
          <div className="space-y-1.5">
            {EVENT_OPTIONS.map(opt => (
              <label key={opt.value} className="flex items-center gap-2 text-[13px] text-fg">
                <input
                  type="checkbox"
                  name="event_types"
                  value={opt.value}
                  defaultChecked
                  className="accent-fg"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Creating..." : "Add endpoint"}
        </Button>
      </form>
    </section>
  );
}
