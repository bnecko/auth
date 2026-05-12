"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { Section } from "@/components/Section";

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
      setResponse(
        pretty({ error: err instanceof Error ? err.message : "request failed" }),
      );
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
    <div className="grid xl:grid-cols-[1fr_360px] gap-10 items-start">
      <div>
        <Section index="1.0" title="client" hint="oauth client config">
          <div className="grid sm:grid-cols-[120px_1fr] gap-3 py-3 px-1 border-b border-rule">
            <span className="text-meta uppercase tracking-wider text-muted">
              server
            </span>
            <span className="text-meta text-fg truncate">
              {cleanBase || "current origin"}
            </span>
          </div>
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-4 py-4 px-1">
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
        </Section>

        <Section index="2.0" title="pkce" hint="proof key for code exchange">
          <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end py-4 px-1">
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
          <div className="py-4 px-1 border-t border-rule">
            <LabText
              label="code challenge"
              value={challenge}
              onChange={setChallenge}
            />
          </div>
        </Section>

        <Section index="3.0" title="authorize url" hint="full request">
          <div className="py-4 px-1">
            <LabText
              label="url"
              value={authorizeUrl}
              onChange={() => undefined}
            />
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => copy(authorizeUrl)}
              >
                copy url
              </Button>
              <a href={authorizeUrl} target="_blank" rel="noreferrer">
                <Button variant="secondary" type="button" className="w-full">
                  open authorize ↗
                </Button>
              </a>
            </div>
          </div>
        </Section>

        <Section index="4.0" title="token operations" hint="exchange / refresh / introspect / revoke">
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-4 py-4 px-1">
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
            <LabSelect
              label="revoke target"
              value={tokenHint}
              onChange={setTokenHint}
              options={[
                { value: "refresh_token", label: "refresh token" },
                { value: "access_token", label: "access token" },
              ]}
            />
          </div>
          <div className="grid sm:grid-cols-4 gap-2 py-4 px-1 border-t border-rule">
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
        </Section>
      </div>

      <aside className="space-y-6 xl:sticky xl:top-16">
        <div className="flex items-baseline gap-2 text-meta uppercase tracking-wider text-faint mb-3">
          <span className="text-faint">[</span>
          <span className="text-accent">aux</span>
          <span className="text-faint">·</span>
          <span className="text-muted">side panels</span>
          <span className="text-faint">]</span>
        </div>

        <Section title="metadata" hint="discovery">
          <div className="grid gap-2 py-4 px-1">
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
              onClick={() =>
                bearerRequest("userinfo", "/api/oauth/userinfo", "GET")
              }
            >
              userinfo
            </Button>
          </div>
        </Section>

        <div>
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="text-[15px] uppercase tracking-wider text-fg">
              response
            </h2>
            <span className="text-meta text-muted">
              <span className="text-faint">// </span>
              last request
            </span>
          </div>
          <pre className="min-h-[320px] max-h-[560px] overflow-auto border-t border-b border-rule bg-bg-soft px-3 py-3 text-[12px] leading-5 text-fg whitespace-pre-wrap">
            <span className="text-faint">{"$ "}</span>
            {response || "(no response yet)"}
          </pre>
        </div>
      </aside>
    </div>
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
    <label className="block">
      <span className="block text-meta uppercase tracking-wider text-muted mb-1.5">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full bg-bg-soft border-0 border-b border-rule px-3 h-9 text-[13px] text-fg placeholder:text-faint focus:outline-none focus:border-accent transition-colors"
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
    <label className="block">
      <span className="block text-meta uppercase tracking-wider text-muted mb-1.5">
        {label}
      </span>
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={4}
        className="w-full resize-y bg-bg-soft border-0 border-b border-rule px-3 py-2 text-[12px] leading-5 text-fg placeholder:text-faint focus:outline-none focus:border-accent transition-colors"
      />
    </label>
  );
}

function LabSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block text-meta uppercase tracking-wider text-muted mb-1.5">
        {label}
      </span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full bg-bg-soft border-0 border-b border-rule px-3 h-9 text-[13px] text-fg focus:outline-none focus:border-accent transition-colors appearance-none cursor-pointer"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
