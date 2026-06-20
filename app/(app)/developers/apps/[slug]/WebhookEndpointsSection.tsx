"use client";

import { useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Tag } from "@/components/Tag";
import { Section, Row, RowLabel, RowValue, Empty } from "@/components/Section";
import {
  createWebhookEndpointAction,
  deleteWebhookEndpointAction,
  disableWebhookEndpointAction,
  rotateWebhookSecretAction,
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
  { value: "activation.expired", label: "Activation expired" },
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
      setError(
        err instanceof Error ? err.message : "failed to create endpoint",
      );
    } finally {
      setBusy(false);
    }
  }

  async function rotate(formData: FormData) {
    setError("");
    setRevealedSecret(null);
    try {
      const result = await rotateWebhookSecretAction(formData);
      if (result?.secret) {
        setRevealedSecret(result.secret);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to rotate secret");
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {revealedSecret && (
        <Alert tone="warning">
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-[13px] font-medium text-muted">
              Signing secret - shown once
            </span>
          </div>
          <code className="block font-mono select-all text-accent-strong break-all">
            {revealedSecret}
          </code>
        </Alert>
      )}

      <Section
        index="3.0"
        title="Webhook endpoints"
        hint="Event delivery targets"
      >
        {endpoints.length === 0 ? (
          <Empty>No webhook endpoints</Empty>
        ) : (
          endpoints.map((ep) => (
            <Row key={ep.publicId}>
              <RowLabel>
                <span className="normal-case tracking-normal text-fg truncate">
                  {ep.url}
                </span>
              </RowLabel>
              <RowValue>
                <Tag tone={ep.status === "active" ? "success" : "neutral"}>
                  {ep.status === "active" ? "Active" : "Disabled"}
                </Tag>
                <span className="text-muted text-[13px] truncate">
                  {ep.eventTypes.join(", ") || "No events"}
                </span>
              </RowValue>
              <div className="flex items-baseline gap-3 text-[13px]">
                {ep.status === "active" && (
                  <form action={rotate}>
                    <input type="hidden" name="app_id" value={appId} />
                    <input type="hidden" name="endpoint_id" value={ep.publicId} />
                    <Button type="submit" variant="secondary" size="sm">
                      Rotate secret
                    </Button>
                  </form>
                )}
                {ep.status === "active" && (
                  <form action={disableWebhookEndpointAction}>
                    <input type="hidden" name="app_id" value={appId} />
                    <input type="hidden" name="endpoint_id" value={ep.publicId} />
                    <Button type="submit" variant="danger" size="sm">
                      Disable
                    </Button>
                  </form>
                )}
                <form action={deleteWebhookEndpointAction}>
                  <input type="hidden" name="app_id" value={appId} />
                  <input type="hidden" name="endpoint_id" value={ep.publicId} />
                  <Button type="submit" variant="danger" size="sm">
                    Delete
                  </Button>
                </form>
              </div>
            </Row>
          ))
        )}
      </Section>

      <Section index="3.1" title="Add endpoint" hint="Register new target">
        <form action={create} className="space-y-5 py-3 px-1">
          <input type="hidden" name="app_id" value={appId} />
          <Field
            label="Endpoint URL"
            name="url"
            type="url"
            required
            placeholder="https://app.example.com/webhooks/bottleneck"
            hint="https required (or http://localhost in development)"
          />
          <div>
            <label className="block text-[13px] text-muted mb-2">
              Events
            </label>
            <div className="border-t border-rule">
              {EVENT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-baseline gap-3 py-2.5 border-b border-rule cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    name="event_types"
                    value={opt.value}
                    defaultChecked
                    className="appearance-none w-4 h-4 rounded border border-rule bg-transparent checked:bg-accent checked:border-accent transition-colors shrink-0 translate-y-0.5"
                  />
                  <span className="text-[13px] text-fg group-hover:text-accent-strong transition-colors">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" loading={busy}>
            Add endpoint
          </Button>
        </form>
      </Section>
    </div>
  );
}
