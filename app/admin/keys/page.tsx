import { createHash, createPrivateKey, createPublicKey } from "crypto";
import { Section, Row, RowLabel, RowValue } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { oauthProfileVersions, oidcSigningKeys } from "@/lib/server/config";

export const dynamic = "force-dynamic";

function fingerprint(privateKeyPem: string) {
  const publicKey = createPublicKey(createPrivateKey(privateKeyPem)).export({
    type: "spki",
    format: "der",
  });
  return createHash("sha256").update(publicKey).digest("hex").slice(0, 24);
}

function tone(status: string) {
  if (status === "active") return "success";
  if (status === "revoked") return "danger";
  return "warning";
}

export default function AdminKeysPage() {
  const keys = oidcSigningKeys().map(key => ({
    kid: key.kid,
    status: key.status,
    fingerprint: fingerprint(key.privateKeyPem),
  }));

  return (
    <main className="flex-1 max-w-[960px] w-full mx-auto px-6 py-10">
      <header className="mb-7">
        <h1 className="text-[26px] tracking-tightest text-fg leading-none">
          Signing Keys
        </h1>
        <p className="mt-3 text-meta text-muted max-w-prose">
          OIDC keys are environment-backed. Active keys sign new tokens, retired keys stay in JWKS, and revoked keys are removed from JWKS.
        </p>
      </header>

      <Section title={`keys ${keys.length}`}>
        {keys.map(key => (
          <Row key={key.kid}>
            <RowLabel>{key.kid}</RowLabel>
            <RowValue>
              <span className="text-secondary">{key.fingerprint}</span>
              <span className="text-faint">/</span>
              <Tag tone={tone(key.status)}>{key.status}</Tag>
            </RowValue>
            <span />
          </Row>
        ))}
      </Section>

      <Section title="rotation path" hint="// env driven">
        <Row>
          <RowLabel>add</RowLabel>
          <RowValue>append a new active entry to OIDC_SIGNING_KEYS_JSON</RowValue>
          <span />
        </Row>
        <Row>
          <RowLabel>retire</RowLabel>
          <RowValue>mark the previous key retired after deploy</RowValue>
          <span />
        </Row>
        <Row>
          <RowLabel>revoke</RowLabel>
          <RowValue>mark compromised keys revoked and redeploy immediately</RowValue>
          <span />
        </Row>
      </Section>

      <Section title="oauth profiles" hint="// compatibility">
        {oauthProfileVersions.map(profile => (
          <Row key={profile.version}>
            <RowLabel>{profile.version}</RowLabel>
            <RowValue>{profile.label}</RowValue>
            <Tag tone={profile.status === "current" ? "success" : "warning"}>
              {profile.status}
            </Tag>
          </Row>
        ))}
      </Section>
    </main>
  );
}
