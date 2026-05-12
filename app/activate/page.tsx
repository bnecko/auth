import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { Tag } from "@/components/Tag";
import { getCurrentSession } from "@/lib/server/session";
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

  return (
    <AuthShell tag="auth/authorize">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="text-micro uppercase text-faint mb-1">
            authorize app
          </div>
          <h1 className="text-[24px] tracking-tightest text-fg truncate">
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
        <div
          className="h-10 w-10 rounded-sm bg-elevated border border-border flex items-center justify-center text-secondary text-meta shrink-0"
          aria-hidden
        >
          {activation.app.name.slice(0, 2).toUpperCase()}
        </div>
      </div>

      <div className="space-y-2.5 mb-4">
        <Row label="signed in" value={`${current.user.username} / ${current.user.email}`} />
        <Row
          label="origin"
          value={`${activation.userAgent || "unknown device"} / ${activation.ip || "unknown ip"}`}
        />
        <Row
          label="requires"
          value={requiredProduct || "none"}
          right={
            requiredProduct ? (
              <Tag tone={blocked ? "warning" : "success"}>
                {blocked ? "missing" : "active"}
              </Tag>
            ) : undefined
          }
        />
      </div>

      <div className="mb-4">
        <div className="text-micro uppercase text-faint mb-2">
          will share
        </div>
        <ul className="border border-border rounded-sm divide-y divide-border bg-bg">
          {activation.scopes.map(scope => {
            const item = scopeLabels[scope] || { label: scope };
            return (
              <li
                key={scope}
                className="flex items-center justify-between px-3 py-2 text-[13px]"
              >
                {item.sensitive ? (
                  <label className="flex items-center gap-2 cursor-pointer text-fg">
                    <input 
                      type="checkbox" 
                      name="scopes" 
                      value={scope} 
                      defaultChecked 
                      form="approve-form"
                      className="rounded-sm border-border bg-transparent focus:ring-1 focus:ring-border accent-fg"
                    />
                    <span>{item.label}</span>
                  </label>
                ) : (
                  <>
                    <span className="text-fg">{item.label}</span>
                    <input type="hidden" name="scopes" value={scope} form="approve-form" />
                  </>
                )}
                {item.sensitive && (
                  <span className="text-micro uppercase text-warning">
                    optional
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {blocked && !expired && requiredProduct && (
        <div className="mb-4">
          <Alert tone="warning">
            active {requiredProduct} subscription required to approve.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-2">
        <form action={`/api/activations/${activation.publicId}/deny`} method="post">
          <Button variant="ghost" type="submit" disabled={expired}>
            deny
          </Button>
        </form>
        <form id="approve-form" action={`/api/activations/${activation.publicId}/approve`} method="post">
          <Button type="submit" disabled={expired || blocked}>
            approve
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}

function Row({
  label,
  value,
  right,
}: {
  label: string;
  value: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[13px]">
      <span className="text-meta text-muted shrink-0">{label}</span>
      <span className="text-fg text-right truncate flex-1 flex items-center justify-end gap-2">
        <span className="truncate">{value}</span>
        {right}
      </span>
    </div>
  );
}
