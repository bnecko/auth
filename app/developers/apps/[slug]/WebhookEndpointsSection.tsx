"use client";

import { useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Tag } from "@/components/Tag";
import { Glyph } from "@/components/Glyph";
import { Section, Row, RowLabel, RowValue, Empty } from "@/components/Section";
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
  { value: "activation.approved", label: "activation approved" },
  { value: "activation.denied", label: "activation denied" },
  { value: "activation.cancelled", label: "activation cancelled" },
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

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {revealedSecret && (
        <Alert tone="warning">
          <div className="flex items-baseline gap-2 mb-1.5">
            <Glyph kind="warn" />
            <span className="uppercase tracking-wider">
              signing secret — shown once
            </span>
          </div>
          <code className="block font-mono select-all text-accent break-all">
            {revealedSecret}
          </code>
        </Alert>
      )}

      <Section
        index="3.0"
        title="webhook endpoints"
        hint="event delivery targets"
      >
        {endpoints.length === 0 ? (
          <Empty>no webhook endpoints</Empty>
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
                  {ep.status}
                </Tag>
                <Glyph kind="dot" />
                <span className="text-muted text-meta truncate">
                  {ep.eventTypes.join(", ") || "no events"}
                </span>
              </RowValue>
              <div className="flex items-baseline gap-3 text-meta uppercase tracking-wider">
                {ep.status === "active" && (
                  <form action={disableWebhookEndpointAction}>
                    <input type="hidden" name="app_id" value={appId} />
                    <input type="hidden" name="endpoint_id" value={ep.publicId} />
                    <button
                      type="submit"
                      className="text-secondary hover:text-accent transition-colors"
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
            </Row>
          ))
        )}
      </Section>

      <Section index="3.1" title="add endpoint" hint="register new target">
        <form action={create} className="space-y-5 py-3 px-1">
          <input type="hidden" name="app_id" value={appId} />
          <Field
            label="endpoint url"
            name="url"
            type="url"
            required
            placeholder="https://app.example.com/webhooks/bottleneck"
            hint="https required (or http://localhost in development)"
          />
          <div>
            <label className="block text-meta uppercase tracking-wider text-muted mb-2">
              events
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
                    className="appearance-none w-4 h-4 border border-rule bg-transparent checked:bg-accent checked:border-accent transition-colors shrink-0 translate-y-0.5"
                  />
                  <span className="text-meta text-fg group-hover:text-accent transition-colors">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" loading={busy}>
            add endpoint
          </Button>
        </form>
      </Section>
    </div>
  );
}
