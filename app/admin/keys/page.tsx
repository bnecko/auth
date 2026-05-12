import { createHash, createPrivateKey, createPublicKey } from "crypto";
import { Section, Row, RowLabel, RowValue } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { Glyph } from "@/components/Glyph";
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
    <main
      className="flex-1 max-w-[1040px] w-full mx-auto px-6 py-10"
      data-mount-stagger
    >
      <header className="mb-10" data-mount-row>
        <div className="flex items-baseline gap-2 mb-2 text-meta">
          <span className="text-danger">$</span>
          <span className="uppercase tracking-wider text-muted">
            admin.keys
          </span>
          <span className="text-faint">·</span>
          <span className="text-meta text-faint tabular-nums">
            {String(keys.length).padStart(2, "0")}
          </span>
        </div>
        <h1 className="text-[32px] tracking-tightest text-fg leading-none mb-3">
          signing keys
        </h1>
        <p className="text-meta text-muted max-w-prose">
          oidc keys are environment-backed. active keys sign new tokens, retired
          keys stay in jwks, and revoked keys are removed from jwks.
        </p>
      </header>

      <div data-mount-row>
        <Section index="1.0" title="keys" hint="oidc signing keys">
          {keys.map(key => (
            <Row key={key.kid}>
              <RowLabel>
                <span className="normal-case tracking-normal text-fg">
                  {key.kid}
                </span>
              </RowLabel>
              <RowValue>
                <span className="text-muted truncate">{key.fingerprint}</span>
                <Glyph kind="dot" />
                <Tag tone={tone(key.status)}>{key.status}</Tag>
              </RowValue>
              <span />
            </Row>
          ))}
        </Section>
      </div>

      <div data-mount-row>
        <Section index="2.0" title="rotation path" hint="env driven">
          <Row>
            <RowLabel>add</RowLabel>
            <RowValue>
              append a new active entry to OIDC_SIGNING_KEYS_JSON
            </RowValue>
            <span />
          </Row>
          <Row>
            <RowLabel>retire</RowLabel>
            <RowValue>mark the previous key retired after deploy</RowValue>
            <span />
          </Row>
          <Row>
            <RowLabel>revoke</RowLabel>
            <RowValue>
              mark compromised keys revoked and redeploy immediately
            </RowValue>
            <span />
          </Row>
        </Section>
      </div>

      <div data-mount-row>
        <Section index="3.0" title="oauth profiles" hint="compatibility">
          {oauthProfileVersions.map(profile => (
            <Row key={profile.version}>
              <RowLabel>
                <span className="normal-case tracking-normal text-fg">
                  {profile.version}
                </span>
              </RowLabel>
              <RowValue>{profile.label}</RowValue>
              <Tag tone={profile.status === "current" ? "success" : "warning"}>
                {profile.status}
              </Tag>
            </Row>
          ))}
        </Section>
      </div>
    </main>
  );
}
