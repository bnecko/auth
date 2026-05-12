import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { Glyph } from "@/components/Glyph";
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
          <Glyph kind="ok" />
          <span className="text-meta uppercase tracking-wider text-ok">
            connected
          </span>
        </div>
        <h1 className="text-[28px] tracking-tightest text-fg mb-2 leading-none">
          device connected
        </h1>
        <p className="text-meta text-muted">
          you can close this window and return to your device.
        </p>
      </AuthShell>
    );
  }

  if (user_code) {
    const deviceCode = await findDeviceCodeByUserCode(user_code);
    if (!deviceCode || deviceCode.status !== "pending") {
      return (
        <AuthShell tag="auth/device / invalid">
          <Alert tone="danger">invalid or expired code</Alert>
          <Link href="/device" className="block mt-5">
            <Button variant="ghost" type="button">
              try again
            </Button>
          </Link>
        </AuthShell>
      );
    }

    return (
      <AuthShell tag="auth/device / consent">
        <div className="flex items-baseline gap-3 mb-1">
          <span className="text-meta uppercase tracking-wider text-accent">
            connect device
          </span>
        </div>
        <h1 className="text-[28px] tracking-tightest text-fg mb-2 leading-none">
          {deviceCode.appName}
        </h1>
        <p className="text-meta text-secondary mb-5">
          this device is requesting access with the following scopes:
        </p>

        <div className="border-t border-rule mb-6">
          {deviceCode.scopes.map((scope, i) => (
            <div
              key={scope}
              className={`flex items-baseline gap-3 py-2.5 ${
                i > 0 ? "border-t border-rule" : ""
              }`}
            >
              <Glyph kind="ok" />
              <span className="text-meta text-fg">{scope}</span>
            </div>
          ))}
          <div className="border-t border-rule" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <form action={denyCode}>
            <input type="hidden" name="user_code" value={user_code} />
            <Button variant="ghost" type="submit" className="w-full">
              deny
            </Button>
          </form>
          <form action={approveCode}>
            <input type="hidden" name="user_code" value={user_code} />
            <Button type="submit" className="w-full">
              approve
            </Button>
          </form>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell tag="auth/device / enter code">
      <h1 className="text-[28px] tracking-tightest text-fg mb-1 leading-none">
        enter code
      </h1>
      <p className="text-meta text-muted mb-7">
        the code is displayed on your device screen
      </p>

      <form action={submitCode} className="space-y-5">
        <div className="border-b border-rule">
          <input
            name="user_code"
            placeholder="ABCD-EFGH"
            required
            autoFocus
            className="w-full bg-transparent border-0 px-1 py-2 text-fg focus:outline-none text-center uppercase tracking-[0.3em] text-[24px] tabular-nums placeholder:text-faint"
          />
        </div>
        <Button type="submit" className="w-full">
          continue
        </Button>
      </form>
    </AuthShell>
  );
}
