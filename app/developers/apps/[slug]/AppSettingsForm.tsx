"use client";

import { useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Glyph } from "@/components/Glyph";
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
          <div className="flex items-baseline gap-2 mb-1.5">
            <Glyph kind="warn" />
            <span className="uppercase tracking-wider">new client secret</span>
          </div>
          <code className="block font-mono select-all text-accent break-all">
            {secret}
          </code>
        </Alert>
      )}

      <Section index="2.0" title="configuration" hint="oauth client details">
        <form action={save} className="space-y-5 py-3 px-1">
          <input type="hidden" name="app_id" value={appId} />

          <div>
            <label className="block text-meta uppercase tracking-wider text-muted mb-1">
              allowed redirect uris
            </label>
            <textarea
              name="redirect_uris"
              rows={4}
              defaultValue={redirectUris.join("\n")}
              className="w-full bg-transparent border-0 border-b border-rule px-1 py-2 text-[13px] text-fg placeholder:text-faint focus:outline-none focus:border-accent transition-colors resize-y leading-relaxed"
            />
            <p className="text-meta text-muted mt-2">
              one per line. strict https required (except localhost).
            </p>
          </div>

          <div>
            <Button type="submit" loading={busy === "save"}>
              save changes
            </Button>
          </div>
        </form>
      </Section>

      <Section
        index="2.1"
        title="oauth version"
        hint="compatibility profile"
      >
        <form action={save} className="space-y-5 py-3 px-1">
          <input type="hidden" name="app_id" value={appId} />
          <input type="hidden" name="action" value="update_oauth_version" />
          <div>
            <label className="block text-meta uppercase tracking-wider text-muted mb-1">
              compatibility profile
            </label>
            <div className="border-b border-rule">
              <select
                name="oauth_profile_version"
                defaultValue={oauthProfileVersion}
                className="w-full bg-transparent border-0 px-1 py-2 text-[14px] text-fg focus:outline-none focus:text-accent transition-colors appearance-none cursor-pointer"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, transparent 50%, var(--fg) 50%), linear-gradient(135deg, var(--fg) 50%, transparent 50%)",
                  backgroundPosition:
                    "calc(100% - 12px) calc(50% - 3px), calc(100% - 8px) calc(50% - 3px)",
                  backgroundSize: "4px 4px",
                  backgroundRepeat: "no-repeat",
                }}
              >
                <option value="bn-oauth-2026-05">bottleneck oauth 2026.05</option>
                <option value="bn-oauth-2026-01">bottleneck oauth 2026.01</option>
              </select>
            </div>
            <p className="text-meta text-muted mt-2">
              both versions behave identically today — new apps should stay on 2026.05.
            </p>
          </div>

          <Button type="submit" loading={busy === "save"}>
            save oauth version
          </Button>
        </form>
      </Section>

      <Section index="2.2" title="danger zone" hint="destructive operations">
        <div className="flex items-baseline justify-between py-3 px-1 gap-4">
          <div className="min-w-0">
            <div className="text-[14px] text-fg mb-1">rotate client secret</div>
            <div className="text-meta text-muted">
              the previous secret remains valid for 7 days.
            </div>
          </div>
          <form action={rotate}>
            <input type="hidden" name="app_id" value={appId} />
            <input type="hidden" name="action" value="rotate_secret" />
            <button
              type="submit"
              disabled={busy === "rotate"}
              className="text-meta uppercase tracking-wider text-secondary hover:text-danger transition-colors disabled:text-faint disabled:cursor-not-allowed"
            >
              {busy === "rotate" ? "rotating" : "rotate"}
            </button>
          </form>
        </div>
      </Section>
    </div>
  );
}
