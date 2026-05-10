import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { getCurrentSession } from "@/lib/server/session";
import { findDeviceCodeByUserCode, updateDeviceCodeStatus } from "@/lib/server/repositories/oauth";

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
      <AuthShell tag="auth/device">
        <div className="text-center py-6">
          <div className="text-[22px] tracking-tightest text-fg mb-2">
            Device Connected
          </div>
          <p className="text-muted text-[14px]">
            You can now close this window and return to your device.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (user_code) {
    const deviceCode = await findDeviceCodeByUserCode(user_code);
    if (!deviceCode || deviceCode.status !== "pending") {
      return (
        <AuthShell tag="auth/device">
          <Alert tone="danger">Invalid or expired code.</Alert>
          <div className="mt-4 text-center">
            <Link href="/device" className="text-meta text-secondary hover:text-fg">
              Try Again
            </Link>
          </div>
        </AuthShell>
      );
    }

    return (
      <AuthShell tag="auth/device">
        <div className="text-center mb-6">
          <div className="text-micro uppercase text-faint mb-1">
            Connect Device
          </div>
          <h1 className="text-[22px] tracking-tightest text-fg">
            {deviceCode.appName}
          </h1>
          <p className="mt-2 text-muted text-[13px]">
            This device is requesting access to your account with the following permissions:
          </p>
        </div>

        <ul className="border border-border rounded-sm divide-y divide-border bg-bg mb-6">
          {deviceCode.scopes.map(scope => (
            <li key={scope} className="px-3 py-2 text-[13px] text-fg">
              {scope}
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-2">
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
    <AuthShell tag="auth/device">
      <div className="mb-5">
        <div className="text-micro uppercase text-faint mb-1">
          Connect Device
        </div>
        <h1 className="text-[22px] tracking-tightest text-fg">
          Enter Code
        </h1>
        <p className="mt-2 text-muted text-[13px]">
          Enter the code displayed on your device screen to grant it access to your account.
        </p>
      </div>

      <form action={submitCode} className="space-y-4">
        <input
          name="user_code"
          placeholder="ABCD-EFGH"
          required
          autoFocus
          className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-fg focus:outline-none focus:ring-1 focus:ring-border text-center uppercase tracking-widest text-[18px]"
        />
        <Button type="submit" className="w-full">
          Continue
        </Button>
      </form>
    </AuthShell>
  );
}
