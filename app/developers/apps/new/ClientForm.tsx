"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { Field } from "@/components/Field";
import { createAppAction } from "./actions";

export function ClientForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{
    name: string;
    slug: string;
    clientId: string;
    clientSecret: string;
  } | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const result = await createAppAction(formData);
      if (result.error) {
        setError(result.error);
      } else if (result.app) {
        setCreated(result.app);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create app");
    } finally {
      setLoading(false);
    }
  }

  if (created) {
    return (
      <div>
        <div className="flex items-baseline gap-3 mb-1">
          <span className="inline-block w-2 h-2 rounded-full bg-ok" />
          <span className="text-[12px] text-ok">
            Application created
          </span>
        </div>
        <h2 className="text-[24px] text-fg mb-2 leading-none">
          Credentials issued
        </h2>
        <p className="text-[13px] text-muted mb-7">
          Copy your client secret now — it will never be shown again
        </p>

        <div className="bg-card border border-rule rounded-lg divide-y divide-rule mb-8">
          <div className="px-4 py-3">
            <label className="block text-[12px] text-muted mb-1">
              Client ID
            </label>
            <code className="block text-[13.5px] text-accent-strong select-all break-all">
              {created.clientId}
            </code>
          </div>
          <div className="px-4 py-3">
            <label className="block text-[12px] text-muted mb-1">
              Client secret
            </label>
            <code className="block text-[13.5px] text-accent-strong select-all break-all">
              {created.clientSecret}
            </code>
            <p className="mt-2 text-[12px] text-accent-strong flex items-baseline gap-1.5">
              <span>Shown once — store immediately</span>
            </p>
          </div>
        </div>

        <Link href={`/developers/apps/${created.slug}`}>
          <Button>Go to app settings</Button>
        </Link>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      <Field
        label="Application name"
        name="name"
        placeholder="My cool app"
        required
        maxLength={50}
        hint="Displayed to users on the authorization consent screen"
      />

      <Field
        label="Redirect URI"
        name="redirect_uri"
        type="url"
        placeholder="https://yourapp.com/oauth/callback"
        required
        hint="Where users are sent after authorizing — https required (except localhost)"
      />

      <div className="pt-4 border-t border-rule flex items-center justify-end gap-4">
        <Link
          href="/developers/apps"
          className="text-[13px] text-secondary hover:text-accent-strong transition-colors"
        >
          Cancel
        </Link>
        <Button type="submit" loading={loading}>
          Create app
        </Button>
      </div>
    </form>
  );
}
