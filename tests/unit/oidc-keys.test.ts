import { generateKeyPairSync } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { activeOidcSigningKey, oidcSigningKeys } from "@/lib/server/config";
import { oauthJwks } from "@/lib/server/services/oauth";

function privateKeyPem() {
  return generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("oidc signing keys", () => {
  const originalJson = process.env.OIDC_SIGNING_KEYS_JSON;
  const originalPem = process.env.OIDC_PRIVATE_KEY_PEM;
  const originalKid = process.env.OIDC_KEY_ID;

  afterEach(() => {
    restoreEnv("OIDC_SIGNING_KEYS_JSON", originalJson);
    restoreEnv("OIDC_PRIVATE_KEY_PEM", originalPem);
    restoreEnv("OIDC_KEY_ID", originalKid);
  });

  it("uses the configured active key for signing", () => {
    const active = privateKeyPem();
    const retired = privateKeyPem();
    process.env.OIDC_SIGNING_KEYS_JSON = JSON.stringify([
      { kid: "old", privateKeyPem: retired, status: "retired" },
      { kid: "new", privateKeyPem: active, status: "active" },
    ]);

    expect(activeOidcSigningKey().kid).toBe("new");
  });

  it("keeps retired keys in JWKS and removes revoked keys", () => {
    process.env.OIDC_SIGNING_KEYS_JSON = JSON.stringify([
      { kid: "active", privateKeyPem: privateKeyPem(), status: "active" },
      { kid: "retired", privateKeyPem: privateKeyPem(), status: "retired" },
      { kid: "revoked", privateKeyPem: privateKeyPem(), status: "revoked" },
    ]);

    const kids = oauthJwks().keys.map(key => key.kid);
    expect(kids).toEqual(["active", "retired"]);
  });

  it("falls back to the legacy single key config", () => {
    process.env.OIDC_SIGNING_KEYS_JSON = "";
    process.env.OIDC_PRIVATE_KEY_PEM = privateKeyPem();
    process.env.OIDC_KEY_ID = "legacy";

    expect(oidcSigningKeys()).toMatchObject([{ kid: "legacy", status: "active" }]);
  });
});
