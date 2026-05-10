"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
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
      <div className="border border-border bg-surface rounded-sm p-6 lg:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-success/10 text-success mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <h2 className="text-[20px] text-fg font-medium tracking-tight">
            Application Created
          </h2>
          <p className="text-muted text-[13px] mt-2">
            Please copy your client secret now. For security reasons, it will never be shown again.
          </p>
        </div>

        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-micro uppercase text-faint mb-1">Client ID</label>
            <code className="block px-3 py-2 bg-bg border border-border rounded-sm text-[13px] text-fg font-mono select-all">
              {created.clientId}
            </code>
          </div>
          <div>
            <label className="block text-micro uppercase text-faint mb-1">Client Secret</label>
            <code className="block px-3 py-2 bg-bg border border-border rounded-sm text-[13px] text-fg font-mono select-all">
              {created.clientSecret}
            </code>
          </div>
        </div>

        <div className="flex justify-center">
          <Link href={`/developers/apps/${created.slug}`} className="inline-flex items-center justify-center h-9 px-4 rounded-sm bg-fg text-bg font-medium text-[13px] hover:bg-fg/90 transition-colors">
            Go to App Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="border border-border bg-surface rounded-sm p-6 lg:p-8 space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      
      <div>
        <label className="block text-[13px] font-medium text-fg mb-1.5">
          Application Name
        </label>
        <input 
          name="name" 
          placeholder="e.g. My Cool App" 
          required 
          maxLength={50}
          className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-fg focus:outline-none focus:ring-1 focus:ring-border"
        />
        <p className="text-faint text-[12px] mt-1.5">
          This will be displayed to users on the authorization consent screen.
        </p>
      </div>

      <div>
        <label className="block text-[13px] font-medium text-fg mb-1.5">
          Redirect URI
        </label>
        <input 
          name="redirect_uri" 
          type="url"
          placeholder="https://yourapp.com/oauth/callback" 
          required 
          className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-fg focus:outline-none focus:ring-1 focus:ring-border"
        />
        <p className="text-faint text-[12px] mt-1.5">
          Where users will be sent after authorizing. Must use HTTPS unless localhost.
        </p>
      </div>

      <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
        <Link href="/developers/apps" className="text-secondary hover:text-fg text-[13px] font-medium">
          Cancel
        </Link>
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create App"}
        </Button>
      </div>
    </form>
  );
}
