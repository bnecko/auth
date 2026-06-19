import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { getCurrentSession } from "@/lib/server/session";
import {
  findDeviceCodeByUserCode,
  updateDeviceCodeStatus,
} from "@/lib/server/repositories/oauth";

export const dynamic = "force-dynamic";

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ user_code?: string; success?: string }>;
}) {
  const current = await getCurrentSession();
  if (!current) {
    redirect(`/login?next=${encodeURIComponent("/device")}`);
  }

  const resolvedParams = await searchParams;
  const { user_code } = resolvedParams;

  async function submitCode(formData: FormData) {
    "use server";
    const code = formData.get("user_code")?.toString().toUpperCase().trim();
    if (code) {
      redirect(`/device?user_code=${code}`);
    }
  }

  async function approveCode(formData: FormData) {
    "use server";
    const code = formData.get("user_code")?.toString().toUpperCase().trim();
    if (code && current) {
      await updateDeviceCodeStatus(code, "approved", current.user.id);
      redirect("/device?success=true");
    }
  }

  async function denyCode(formData: FormData) {
    "use server";
    const code = formData.get("user_code")?.toString().toUpperCase().trim();
    if (code && current) {
      await updateDeviceCodeStatus(code, "denied", current.user.id);
      redirect("/device");
    }
  }

  const isSuccess = resolvedParams.success === "true";

  if (isSuccess) {
    return (
      <AuthShell tag="auth/device / linked">
        <div className="flex items-baseline gap-3 mb-1">
          <span className="text-[13px] text-ok">Connected</span>
        </div>
        <h1 className="text-[28px] text-fg mb-2 leading-none">
          Device connected
        </h1>
        <p className="text-[14px] text-muted">
          You can close this window and return to your device.
        </p>
      </AuthShell>
    );
  }

  if (user_code) {
    const deviceCode = await findDeviceCodeByUserCode(user_code);
    if (!deviceCode || deviceCode.status !== "pending") {
      return (
        <AuthShell tag="auth/device / invalid">
          <Alert tone="danger">Invalid or expired code</Alert>
          <Link href="/device" className="block mt-5">
            <Button variant="ghost" type="button">
              Try again
            </Button>
          </Link>
        </AuthShell>
      );
    }

    return (
      <AuthShell tag="auth/device / consent">
        <div className="flex items-baseline gap-3 mb-1">
          <span className="text-[13px] text-accent-strong">
            Connect device
          </span>
        </div>
        <h1 className="text-[28px] text-fg mb-2 leading-none">
          {deviceCode.appName}
        </h1>
        <p className="text-[14px] text-secondary mb-5">
          This device is requesting access with the following scopes:
        </p>

        <div className="bg-card border border-rule rounded-lg mb-6 divide-y divide-rule">
          {deviceCode.scopes.map((scope) => (
            <div key={scope} className="flex items-center gap-3 px-4 py-3">
              <span className="text-[13px] text-fg">{scope}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <form action={denyCode}>
            <input type="hidden" name="user_code" value={user_code} />
            <Button variant="ghost" type="submit" className="w-full">
              Deny
            </Button>
          </form>
          <form action={approveCode}>
            <input type="hidden" name="user_code" value={user_code} />
            <Button type="submit" className="w-full">
              Approve
            </Button>
          </form>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell tag="auth/device / enter code">
      <h1 className="text-[28px] text-fg mb-1 leading-none">
        Enter code
      </h1>
      <p className="text-[14px] text-muted mb-7">
        The code is displayed on your device screen
      </p>

      <form action={submitCode} className="space-y-5">
        <div className="border border-rule rounded-md bg-card">
          <input
            name="user_code"
            placeholder="ABCD-EFGH"
            required
            autoFocus
            className="w-full bg-transparent border-0 px-3 py-3 text-fg focus:outline-hidden text-center uppercase tracking-[0.3em] text-[24px] tabular-nums placeholder:text-faint"
          />
        </div>
        <Button type="submit" className="w-full">
          Continue
        </Button>
      </form>
    </AuthShell>
  );
}
