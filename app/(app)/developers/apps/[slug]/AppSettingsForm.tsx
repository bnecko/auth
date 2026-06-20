"use client";

import { useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Section } from "@/components/Section";
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
    <div className="space-y-2">
      {error && <Alert tone="danger">{error}</Alert>}
      {secret && (
        <Alert tone="warning">
          <div className="mb-1.5 text-[13px] font-medium">New client secret</div>
          <code className="block font-mono select-all text-accent-strong break-all">
            {secret}
          </code>
        </Alert>
      )}

      <Section index="2.0" title="Configuration" hint="OAuth client details">
        <form action={save} className="space-y-5 py-3 px-1">
          <input type="hidden" name="app_id" value={appId} />

          <div>
            <label className="block text-[13px] text-muted mb-1">
              Allowed redirect URIs
            </label>
            <textarea
              name="redirect_uris"
              rows={4}
              defaultValue={redirectUris.join("\n")}
              className="w-full bg-card border border-rule rounded-md px-3 py-2 text-[13px] text-fg placeholder:text-faint focus:outline-hidden focus:border-accent transition-colors resize-y leading-relaxed"
            />
            <p className="text-[12px] text-muted mt-2">
              One per line. Strict HTTPS required (except localhost).
            </p>
          </div>

          <div>
            <Button type="submit" loading={busy === "save"}>
              Save changes
            </Button>
          </div>
        </form>
      </Section>

      <Section
        index="2.1"
        title="OAuth version"
        hint="Compatibility profile"
      >
        <form action={save} className="space-y-5 py-3 px-1">
          <input type="hidden" name="app_id" value={appId} />
          <input type="hidden" name="action" value="update_oauth_version" />
          <div>
            <label className="block text-[13px] text-muted mb-1">
              Compatibility profile
            </label>
            <select
              name="oauth_profile_version"
              defaultValue={oauthProfileVersion}
              className="w-full bg-card border border-rule rounded-md px-3 py-2 text-[14px] text-fg focus:outline-hidden focus:border-accent transition-colors appearance-none cursor-pointer"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, transparent 50%, var(--fg) 50%), linear-gradient(135deg, var(--fg) 50%, transparent 50%)",
                backgroundPosition:
                  "calc(100% - 12px) calc(50% - 3px), calc(100% - 8px) calc(50% - 3px)",
                backgroundSize: "4px 4px",
                backgroundRepeat: "no-repeat",
              }}
            >
              <option value="bn-oauth-2026-05">bottleneck OAuth 2026.05</option>
              <option value="bn-oauth-2026-01">bottleneck OAuth 2026.01</option>
            </select>
            <p className="text-[12px] text-muted mt-2">
              Both versions behave identically today - new apps should stay on 2026.05.
            </p>
          </div>

          <Button type="submit" loading={busy === "save"}>
            Save OAuth version
          </Button>
        </form>
      </Section>

      <Section index="2.2" title="Danger zone" hint="Destructive operations">
        <div className="flex items-center justify-between py-3 px-1 gap-4">
          <div className="min-w-0">
            <div className="text-[14px] text-fg mb-1">Rotate client secret</div>
            <div className="text-[13px] text-muted">
              The previous secret remains valid for 7 days.
            </div>
          </div>
          <form action={rotate}>
            <input type="hidden" name="app_id" value={appId} />
            <input type="hidden" name="action" value="rotate_secret" />
            <Button
              type="submit"
              variant="danger"
              loading={busy === "rotate"}
            >
              {busy === "rotate" ? "Rotating…" : "Rotate"}
            </Button>
          </form>
        </div>
      </Section>
    </div>
  );
}
