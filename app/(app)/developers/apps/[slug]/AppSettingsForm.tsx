"use client";

import { useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Section } from "@/components/Section";
import { updateAppAction } from "./actions";

const SCOPE_OPTIONS = [
  { value: "openid", label: "OpenID Connect (issues ID tokens)" },
  { value: "profile", label: "Public profile" },
  { value: "email", label: "Email address" },
  { value: "birthdate", label: "Date of birth" },
  { value: "telegram", label: "Telegram identity" },
  { value: "profile:read", label: "Public profile (API read)" },
  { value: "email:read", label: "Email address (API read)" },
  { value: "dob:read", label: "Date of birth (API read)" },
  { value: "subscription:read", label: "Subscription status (API read)" },
  { value: "telegram:read", label: "Telegram identity (API read)" },
];

const GRANT_OPTIONS = [
  { value: "authorization_code", label: "Authorization code" },
  { value: "refresh_token", label: "Refresh token" },
  { value: "client_credentials", label: "Client credentials" },
  { value: "urn:ietf:params:oauth:grant-type:device_code", label: "Device code" },
];

const checkboxClass =
  "appearance-none w-4 h-4 rounded border border-rule bg-transparent " +
  "checked:bg-accent checked:border-accent transition-colors shrink-0 translate-y-0.5";

export function AppSettingsForm({
  appId,
  name,
  redirectUris,
  postLogoutRedirectUris,
  oauthProfileVersion,
  allowedScopes,
  allowedGrantTypes,
  issueRefreshTokens,
}: {
  appId: number;
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  oauthProfileVersion: string;
  allowedScopes: string[];
  allowedGrantTypes: string[];
  issueRefreshTokens: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  function save(key: string) {
    return async (formData: FormData) => {
      setBusy(key);
      setError("");
      try {
        await updateAppAction(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "failed to save app");
      } finally {
        setBusy("");
      }
    };
  }

  return (
    <div className="space-y-2">
      {error && <Alert tone="danger">{error}</Alert>}

      <Section index="2.0" title="Configuration" hint="OAuth client details">
        <form action={save("config")} className="space-y-5 py-3 px-1">
          <input type="hidden" name="app_id" value={appId} />

          <Field
            label="App name"
            name="name"
            defaultValue={name}
            required
            maxLength={50}
            hint="Shown to users on the consent screen. The slug and client ID do not change."
          />

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
            <label className="block text-[13px] text-muted mb-1">
              Post-logout redirect URIs
            </label>
            <textarea
              name="post_logout_redirect_uris"
              rows={2}
              defaultValue={postLogoutRedirectUris.join("\n")}
              className="w-full bg-card border border-rule rounded-md px-3 py-2 text-[13px] text-fg placeholder:text-faint focus:outline-hidden focus:border-accent transition-colors resize-y leading-relaxed"
            />
            <p className="text-[12px] text-muted mt-2">
              One per line. Where users may land after RP-initiated logout. Optional.
            </p>
          </div>

          <div>
            <Button type="submit" loading={busy === "config"}>
              Save changes
            </Button>
          </div>
        </form>
      </Section>

      <Section
        index="2.1"
        title="Permissions"
        hint="Scopes and grant types this client may use"
      >
        <form action={save("permissions")} className="space-y-5 py-3 px-1">
          <input type="hidden" name="app_id" value={appId} />
          <input type="hidden" name="action" value="update_permissions" />

          <div>
            <label className="block text-[13px] text-muted mb-2">
              Allowed scopes
            </label>
            <div className="border-t border-rule sm:grid sm:grid-cols-2 sm:gap-x-6">
              {SCOPE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className="flex items-baseline gap-3 py-2.5 border-b border-rule cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    name="scopes"
                    value={opt.value}
                    defaultChecked={allowedScopes.includes(opt.value)}
                    className={checkboxClass}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] text-fg group-hover:text-accent-strong transition-colors">
                      {opt.label}
                    </span>
                    <code className="block text-[11px] text-muted font-mono">
                      {opt.value}
                    </code>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[12px] text-muted mt-2">
              Authorization requests outside this list are rejected with invalid_scope.
              Removing a scope does not revoke grants users already approved.
            </p>
          </div>

          <div>
            <label className="block text-[13px] text-muted mb-2">
              Allowed grant types
            </label>
            <div className="border-t border-rule">
              {GRANT_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className="flex items-baseline gap-3 py-2.5 border-b border-rule cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    name="grant_types"
                    value={opt.value}
                    defaultChecked={allowedGrantTypes.includes(opt.value)}
                    className={checkboxClass}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] text-fg group-hover:text-accent-strong transition-colors">
                      {opt.label}
                    </span>
                    <code className="block text-[11px] text-muted font-mono break-all">
                      {opt.value}
                    </code>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-baseline gap-3 cursor-pointer group">
            <input
              type="checkbox"
              name="issue_refresh_tokens"
              defaultChecked={issueRefreshTokens}
              className={checkboxClass}
            />
            <span className="min-w-0">
              <span className="block text-[13px] text-fg group-hover:text-accent-strong transition-colors">
                Issue refresh tokens
              </span>
              <span className="block text-[12px] text-muted">
                Also requires the refresh token grant. Turning this off stops new
                refresh tokens; existing ones keep rotating until revoked.
              </span>
            </span>
          </label>

          <Button type="submit" loading={busy === "permissions"}>
            Save permissions
          </Button>
        </form>
      </Section>

      <Section
        index="2.2"
        title="OAuth version"
        hint="Compatibility profile"
      >
        <form action={save("version")} className="space-y-5 py-3 px-1">
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

          <Button type="submit" loading={busy === "version"}>
            Save OAuth version
          </Button>
        </form>
      </Section>
    </div>
  );
}
