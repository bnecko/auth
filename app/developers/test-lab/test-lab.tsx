"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";

type Method = "GET" | "POST";

const defaultScopes = "openid profile email";

function randomBase64Url(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function TestLab() {
  const [baseUrl, setBaseUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [scopes, setScopes] = useState(defaultScopes);
  const [state, setState] = useState(() => randomBase64Url(16));
  const [nonce, setNonce] = useState(() => randomBase64Url(16));
  const [verifier, setVerifier] = useState(() => randomBase64Url(48));
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [tokenHint, setTokenHint] = useState("refresh_token");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  const cleanBase = baseUrl.replace(/\/+$/, "");
  const authorizeUrl = useMemo(() => {
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    return `${cleanBase}/oauth/authorize?${query.toString()}`;
  }, [challenge, cleanBase, clientId, nonce, redirectUri, scopes, state]);

  async function generatePkce() {
    const nextVerifier = randomBase64Url(48);
    setVerifier(nextVerifier);
    setChallenge(await pkceChallenge(nextVerifier));
  }

  async function refreshChallenge() {
    setChallenge(await pkceChallenge(verifier));
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
  }

  async function request(label: string, path: string, init?: RequestInit) {
    setBusy(label);
    setResponse("");
    try {
      const res = await fetch(`${cleanBase}${path}`, init);
      const text = await res.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      setResponse(pretty({ status: res.status, body }));
    } catch (err) {
      setResponse(pretty({ error: err instanceof Error ? err.message : "request failed" }));
    } finally {
      setBusy("");
    }
  }

  function tokenBody(grantType: string) {
    const body = new URLSearchParams({
      grant_type: grantType,
      client_id: clientId,
    });

    if (clientSecret) body.set("client_secret", clientSecret);
    if (grantType === "authorization_code") {
      body.set("code", code);
      body.set("redirect_uri", redirectUri);
      body.set("code_verifier", verifier);
    }
    if (grantType === "refresh_token") {
      body.set("refresh_token", refreshToken);
    }

    return body;
  }

  async function exchangeCode() {
    await request("exchange", "/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody("authorization_code"),
    });
  }

  async function refreshAccess() {
    await request("refresh", "/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody("refresh_token"),
    });
  }

  async function bearerRequest(label: string, path: string, method: Method) {
    await request(label, path, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  async function introspect() {
    const body = new URLSearchParams({
      client_id: clientId,
      token: accessToken,
    });
    if (clientSecret) body.set("client_secret", clientSecret);

    await request("introspect", "/api/oauth/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  }

  async function revoke() {
    const body = new URLSearchParams({
      client_id: clientId,
      token: tokenHint === "access_token" ? accessToken : refreshToken,
      token_type_hint: tokenHint,
    });
    if (clientSecret) body.set("client_secret", clientSecret);

    await request("revoke", "/api/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  }

  return (
    <div className="grid xl:grid-cols-[1fr_380px] gap-6 items-start">
      <div className="space-y-6">
        <Panel title="client">
          <div className="mb-4 border border-border bg-bg rounded-sm px-3 py-2">
            <div className="text-micro uppercase text-faint mb-1">
              server
            </div>
            <div className="text-[13px] text-fg truncate">
              {cleanBase || "current origin"}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <LabField label="client id" value={clientId} onChange={setClientId} />
            <LabField
              label="client secret"
              value={clientSecret}
              onChange={setClientSecret}
              type="password"
            />
            <LabField
              label="redirect uri"
              value={redirectUri}
              onChange={setRedirectUri}
            />
            <LabField label="scopes" value={scopes} onChange={setScopes} />
            <LabField label="state" value={state} onChange={setState} />
            <LabField label="nonce" value={nonce} onChange={setNonce} />
          </div>
        </Panel>

        <Panel title="pkce">
          <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
            <LabField
              label="code verifier"
              value={verifier}
              onChange={setVerifier}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" type="button" onClick={refreshChallenge}>
                derive
              </Button>
              <Button variant="ghost" type="button" onClick={generatePkce}>
                reset
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <LabText label="code challenge" value={challenge} onChange={setChallenge} />
          </div>
        </Panel>

        <Panel title="authorize url">
          <LabText label="url" value={authorizeUrl} onChange={() => undefined} />
          <div className="grid sm:grid-cols-2 gap-2 mt-3">
            <Button variant="secondary" type="button" onClick={() => copy(authorizeUrl)}>
              copy url
            </Button>
            <a
              href={authorizeUrl}
              target="_blank"
              rel="noreferrer"
              className="h-10 rounded-sm text-[13px] border border-border text-fg hover:border-border-strong hover:bg-hover transition-colors inline-flex items-center justify-center"
            >
              open authorize
            </a>
          </div>
        </Panel>

        <Panel title="token operations">
          <div className="grid md:grid-cols-2 gap-4">
            <LabField label="authorization code" value={code} onChange={setCode} />
            <LabField
              label="refresh token"
              value={refreshToken}
              onChange={setRefreshToken}
              type="password"
            />
            <LabField
              label="access token"
              value={accessToken}
              onChange={setAccessToken}
              type="password"
            />
            <label className="space-y-1.5">
              <span className="text-micro uppercase text-muted">
                revoke target
              </span>
              <select
                value={tokenHint}
                onChange={event => setTokenHint(event.target.value)}
                className="w-full bg-bg border border-border px-3 h-10 text-[13.5px] text-fg rounded-sm font-mono focus:outline-none focus:border-fg"
              >
                <option value="refresh_token">refresh token</option>
                <option value="access_token">access token</option>
              </select>
            </label>
          </div>
          <div className="grid sm:grid-cols-4 gap-2 mt-4">
            <Button
              variant="secondary"
              type="button"
              loading={busy === "exchange"}
              onClick={exchangeCode}
            >
              exchange
            </Button>
            <Button
              variant="secondary"
              type="button"
              loading={busy === "refresh"}
              onClick={refreshAccess}
            >
              refresh
            </Button>
            <Button
              variant="ghost"
              type="button"
              loading={busy === "introspect"}
              onClick={introspect}
            >
              introspect
            </Button>
            <Button
              variant="danger"
              type="button"
              loading={busy === "revoke"}
              onClick={revoke}
            >
              revoke
            </Button>
          </div>
        </Panel>
      </div>

      <aside className="space-y-6 xl:sticky xl:top-16">
        <Panel title="metadata">
          <div className="grid gap-2">
            <Button
              variant="secondary"
              type="button"
              loading={busy === "discovery"}
              onClick={() =>
                request("discovery", "/.well-known/openid-configuration")
              }
            >
              openid config
            </Button>
            <Button
              variant="secondary"
              type="button"
              loading={busy === "jwks"}
              onClick={() => request("jwks", "/oauth/jwks")}
            >
              jwks
            </Button>
            <Button
              variant="secondary"
              type="button"
              loading={busy === "userinfo"}
              onClick={() => bearerRequest("userinfo", "/api/oauth/userinfo", "GET")}
            >
              userinfo
            </Button>
          </div>
        </Panel>

        <Panel title="response">
          <pre className="min-h-[320px] max-h-[560px] overflow-auto rounded-sm border border-border bg-bg px-3 py-3 text-[12px] leading-5 text-fg whitespace-pre-wrap">
            {response || "{ }"}
          </pre>
        </Panel>
      </aside>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="flex items-baseline gap-3 mb-2.5">
        <h2 className="text-micro uppercase tracking-[0.08em] text-muted">
          {title}
        </h2>
      </header>
      <div className="border border-border bg-surface rounded-sm p-4">
        {children}
      </div>
    </section>
  );
}

function LabField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-micro uppercase text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full bg-bg border border-border px-3 h-10 text-[13.5px] text-fg rounded-sm placeholder:text-faint font-mono focus:outline-none focus:border-fg transition-colors"
      />
    </label>
  );
}

function LabText({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-micro uppercase text-muted">{label}</span>
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={4}
        className="w-full resize-y bg-bg border border-border px-3 py-2 text-[12px] leading-5 text-fg rounded-sm placeholder:text-faint font-mono focus:outline-none focus:border-fg transition-colors"
      />
    </label>
  );
}
