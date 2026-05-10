import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/session";
import { telegramBotUsername, authBaseUrl, adminStepUpTtlSeconds } from "@/lib/server/config";
import { TelegramStepUpWidget } from "./TelegramStepUpWidget";

export const dynamic = "force-dynamic";

export default async function AdminVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") {
    redirect("/");
  }

  const params = await searchParams;
  const error = params.error;
  const botUsername = telegramBotUsername();
  const callbackUrl = `${authBaseUrl()}/api/admin/telegram-step-up`;

  const errorMessages: Record<string, string> = {
    invalid_payload: "Telegram verification failed. Try again.",
    identity_mismatch: "The Telegram account does not match your linked identity.",
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-8">
          <div className="text-meta text-muted mb-1">bottleneck / admin</div>
          <h1 className="text-[26px] tracking-tightest text-fg leading-none mb-2">
            Verify identity
          </h1>
          <p className="text-[13px] text-secondary">
            Admin access requires Telegram verification every{" "}
            {adminStepUpTtlSeconds / 60} minutes.
          </p>
        </div>

        {error && (
          <div className="mb-5 px-4 py-3 rounded-sm bg-surface border border-border text-[13px] text-danger">
            {errorMessages[error] ?? "Verification failed. Try again."}
          </div>
        )}

        <div className="border border-border bg-surface rounded-sm p-6">
          {!current.user.telegramId ? (
            <p className="text-[13px] text-muted text-center">
              No Telegram account is linked to this admin account. Link one from
              the dashboard first.
            </p>
          ) : !botUsername ? (
            <p className="text-[13px] text-muted text-center">
              TELEGRAM_BOT_USERNAME is not configured.
            </p>
          ) : (
            <TelegramStepUpWidget
              botUsername={botUsername}
              callbackUrl={callbackUrl}
            />
          )}
        </div>
      </div>
    </div>
  );
}
