"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { Field } from "@/components/Field";
import { Glyph } from "@/components/Glyph";
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
          <Glyph kind="ok" />
          <span className="text-meta uppercase tracking-wider text-ok">
            application created
          </span>
        </div>
        <h2 className="text-[24px] tracking-tightest text-fg mb-2 leading-none">
          credentials issued
        </h2>
        <p className="text-meta text-muted mb-7">
          copy your client secret now — it will never be shown again
        </p>

        <div className="space-y-5 mb-8">
          <div>
            <label className="block text-meta uppercase tracking-wider text-muted mb-1">
              client id
            </label>
            <code className="block px-1 py-2 border-b border-rule text-[13.5px] text-accent select-all break-all">
              {created.clientId}
            </code>
          </div>
          <div>
            <label className="block text-meta uppercase tracking-wider text-muted mb-1">
              client secret
            </label>
            <code className="block px-1 py-2 border-b border-rule text-[13.5px] text-accent select-all break-all">
              {created.clientSecret}
            </code>
            <p className="mt-2 text-meta text-accent flex items-baseline gap-1.5">
              <Glyph kind="warn" />
              <span>shown once — store immediately</span>
            </p>
          </div>
        </div>

        <Link href={`/developers/apps/${created.slug}`}>
          <Button>go to app settings</Button>
        </Link>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      <Field
        label="application name"
        name="name"
        placeholder="my cool app"
        required
        maxLength={50}
        hint="displayed to users on the authorization consent screen"
      />

      <Field
        label="redirect uri"
        name="redirect_uri"
        type="url"
        placeholder="https://yourapp.com/oauth/callback"
        required
        hint="where users are sent after authorizing — https required (except localhost)"
      />

      <div className="pt-4 border-t border-rule flex items-center justify-end gap-4">
        <Link
          href="/developers/apps"
          className="text-meta uppercase tracking-wider text-secondary hover:text-accent transition-colors"
        >
          cancel
        </Link>
        <Button type="submit" loading={loading}>
          create app
        </Button>
      </div>
    </form>
  );
}
