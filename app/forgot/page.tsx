import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";

export default function ForgotPasswordPage() {
  return (
    <AuthShell tag="auth/recovery">
      <h1 className="text-[22px] tracking-tightest text-fg mb-1">
        recover access
      </h1>
      <p className="text-meta text-muted mb-5">
        password reset is handled manually while account recovery is tied to
        Telegram verification.
      </p>

      <div className="mb-4">
        <Alert tone="warning">
          only request recovery from the Telegram account linked to your
          Bottleneck account.
        </Alert>
      </div>

      <div className="border border-border bg-bg rounded-sm divide-y divide-border mb-5">
        <div className="px-3 py-3">
          <div className="text-micro uppercase text-faint mb-1">
            step 1
          </div>
          <p className="text-[13px] text-secondary">
            Open Telegram support and send your Bottleneck username or email.
          </p>
        </div>
        <div className="px-3 py-3">
          <div className="text-micro uppercase text-faint mb-1">
            step 2
          </div>
          <p className="text-[13px] text-secondary">
            Wait for the admin verification prompt. Do not share passwords,
            session cookies, API keys, or OAuth tokens.
          </p>
        </div>
      </div>

      <a
        href="https://t.me/bottleneck_help"
        target="_blank"
        rel="noreferrer"
        className="block mb-3"
      >
        <Button type="button">open telegram support</Button>
      </a>

      <Link href="/login" className="block">
        <Button variant="ghost" type="button">
          return to sign in
        </Button>
      </Link>
    </AuthShell>
  );
}
