"use client";

import { useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { updateAppAction } from "./actions";

export function AppSettingsForm({
  appId,
  redirectUris,
  oauthProfileVersion,
}: {
  appId: number;
  redirectUris: string[];
  oauthProfileVersion: string;
}) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function save(formData: FormData) {
    setBusy("save");
    setError("");
    try {
      await updateAppAction(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save app");
    } finally {
      setBusy("");
    }
  }

  async function rotate(formData: FormData) {
    setBusy("rotate");
    setError("");
    setSecret("");
    try {
      const result = await updateAppAction(formData);
      if (result?.clientSecret) {
        setSecret(result.clientSecret);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to rotate secret");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      {secret && (
        <Alert tone="success">
          New client secret: <span className="font-mono select-all">{secret}</span>
        </Alert>
      )}

      <section className="border border-border bg-surface rounded-sm p-6">
        <h2 className="text-micro uppercase tracking-[0.08em] text-muted mb-4">
          Configuration
        </h2>

        <form action={save} className="space-y-4">
          <input type="hidden" name="app_id" value={appId} />

          <div>
            <label className="block text-[13px] font-medium text-fg mb-1.5">
              Allowed Redirect URIs (one per line)
            </label>
            <textarea
              name="redirect_uris"
              rows={4}
              defaultValue={redirectUris.join("\n")}
              className="w-full rounded-sm border border-border bg-bg px-3 py-2 text-[13px] text-fg focus:outline-none focus:ring-1 focus:ring-border font-mono"
            />
            <p className="text-faint text-[12px] mt-1.5">
              Must be strict HTTPS URLs where you expect to receive authorization codes.
            </p>
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={busy === "save"}>
              {busy === "save" ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </section>

      <section className="border border-border bg-surface rounded-sm p-6">
        <h2 className="text-micro uppercase tracking-[0.08em] text-muted mb-4">
          OAuth Version
        </h2>
        <form action={save} className="space-y-4">
          <input type="hidden" name="app_id" value={appId} />
          <input type="hidden" name="action" value="update_oauth_version" />
          <div>
            <label className="block text-[13px] font-medium text-fg mb-1.5">
              Compatibility profile
            </label>
            <select
              name="oauth_profile_version"
              defaultValue={oauthProfileVersion}
              className="w-full rounded-sm border border-border bg-bg px-3 py-2 text-[13px] text-fg focus:outline-none focus:ring-1 focus:ring-border"
            >
              <option value="bn-oauth-2026-05">Bottleneck OAuth 2026.05</option>
              <option value="bn-oauth-2026-01">Bottleneck OAuth 2026.01</option>
            </select>
            <p className="text-faint text-[12px] mt-1.5">
              Downgrade only for client compatibility. New apps should stay on 2026.05.
            </p>
          </div>

          <Button type="submit" disabled={busy === "save"}>
            {busy === "save" ? "Saving..." : "Save OAuth Version"}
          </Button>
        </form>
      </section>

      <section className="border border-border bg-surface rounded-sm p-6">
        <h2 className="text-micro uppercase tracking-[0.08em] text-muted mb-4">
          Danger Zone
        </h2>
        <div className="flex items-center justify-between py-2 gap-4">
          <div>
            <div className="text-[14px] text-fg font-medium">Rotate Client Secret</div>
            <div className="text-[13px] text-muted">
              The previous secret remains valid for 7 days.
            </div>
          </div>
          <form action={rotate}>
            <input type="hidden" name="app_id" value={appId} />
            <input type="hidden" name="action" value="rotate_secret" />
            <Button
              variant="ghost"
              type="submit"
              className="text-danger hover:bg-danger/10"
              disabled={busy === "rotate"}
            >
              {busy === "rotate" ? "Rotating..." : "Rotate"}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
