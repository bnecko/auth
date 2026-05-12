import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { Tag } from "@/components/Tag";
import { Glyph } from "@/components/Glyph";
import { getCurrentSession } from "@/lib/server/session";
import { mintActivationCsrf } from "@/lib/server/activationCsrf";
import { getActivationForUser } from "@/lib/server/services/activation";

export const dynamic = "force-dynamic";

const scopeLabels: Record<string, { label: string; sensitive?: boolean }> = {
  "profile:read": { label: "public profile" },
  "email:read": { label: "email address", sensitive: true },
  "dob:read": { label: "date of birth", sensitive: true },
  "subscription:read": { label: "subscription status" },
};

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    redirect("/");
  }

  const current = await getCurrentSession();
  if (!current) {
    redirect(`/login?next=${encodeURIComponent(`/activate?token=${token}`)}`);
  }

  const view = await getActivationForUser(token, current.user);
  if (!view) {
    redirect("/expired?reason=invalid");
  }

  const { activation, expired, requiredProduct, subscriptionOk } = view;
  const blocked = !subscriptionOk;
  const csrfToken = mintActivationCsrf({
    sessionId: current.session.id,
    activationId: activation.publicId,
  });

  const sensitiveScopes = activation.scopes.filter(
    (s) => scopeLabels[s]?.sensitive,
  );
  const standardScopes = activation.scopes.filter(
    (s) => !scopeLabels[s]?.sensitive,
  );

  return (
    <AuthShell tag="auth/authorize">
      <div className="flex items-start gap-4 mb-7">
        <div
          className="h-12 w-12 border border-accent flex items-center justify-center text-accent text-meta uppercase tracking-wider shrink-0"
          aria-hidden
        >
          {activation.app.name.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-meta uppercase tracking-wider text-muted mb-1">
            authorize app
          </div>
          <h1 className="text-[26px] tracking-tightest text-fg truncate leading-none">
            {activation.app.name}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            {expired ? (
              <Tag tone="danger">expired</Tag>
            ) : (
              <span className="text-meta text-muted">
                expires {activation.expiresAt.slice(0, 16).replace("T", " ")}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-rule mb-5">
        <DetailRow label="signed in" value={current.user.username} />
        <DetailRow label="email" value={current.user.email} />
        <DetailRow
          label="origin"
          value={`${activation.userAgent || "unknown device"} · ${activation.ip || "unknown ip"}`}
        />
        {requiredProduct && (
          <DetailRow
            label="requires"
            value={requiredProduct}
            right={
              <Tag tone={blocked ? "warning" : "success"}>
                {blocked ? "missing" : "active"}
              </Tag>
            }
          />
        )}
        <div className="border-t border-rule" />
      </div>

      <div className="mb-5">
        <div className="text-meta uppercase tracking-wider text-muted mb-2">
          will share
        </div>
        <div className="border-t border-rule">
          {standardScopes.map((scope) => {
            const item = scopeLabels[scope] || { label: scope };
            return (
              <div
                key={scope}
                className="flex items-baseline gap-3 py-2.5 border-b border-rule"
              >
                <Glyph kind="ok" />
                <span className="text-meta text-fg flex-1">{item.label}</span>
                <input
                  type="hidden"
                  name="scopes"
                  value={scope}
                  form="approve-form"
                />
              </div>
            );
          })}
          {sensitiveScopes.map((scope) => {
            const item = scopeLabels[scope] || { label: scope };
            return (
              <label
                key={scope}
                className="flex items-baseline gap-3 py-2.5 border-b border-rule cursor-pointer group"
              >
                <input
                  type="checkbox"
                  name="scopes"
                  value={scope}
                  defaultChecked
                  form="approve-form"
                  className="appearance-none w-4 h-4 border border-rule bg-transparent checked:bg-accent checked:border-accent transition-colors shrink-0 translate-y-0.5"
                />
                <span className="text-meta text-fg flex-1 group-hover:text-accent transition-colors">
                  {item.label}
                </span>
                <span className="text-micro uppercase tracking-wider text-accent">
                  optional
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {blocked && !expired && requiredProduct && (
        <div className="mb-5">
          <Alert tone="warning">
            active {requiredProduct} subscription required to approve
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-2">
        <form
          action={`/api/activations/${activation.publicId}/deny`}
          method="post"
        >
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <Button variant="ghost" type="submit" disabled={expired}>
            deny
          </Button>
        </form>
        <form
          id="approve-form"
          action={`/api/activations/${activation.publicId}/approve`}
          method="post"
        >
          <input type="hidden" name="csrf_token" value={csrfToken} />
          <Button type="submit" disabled={expired || blocked}>
            approve
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}

function DetailRow({
  label,
  value,
  right,
}: {
  label: string;
  value: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-rule last:border-b-0">
      <span className="text-meta uppercase tracking-wider text-muted shrink-0">
        {label}
      </span>
      <span className="text-meta text-right truncate flex-1 flex items-center justify-end gap-2">
        <span className="truncate text-fg">{value}</span>
        {right}
      </span>
    </div>
  );
}
