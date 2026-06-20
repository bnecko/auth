import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/session";
import {
  telegramBotUsername,
  authBaseUrl,
  adminStepUpTtlSeconds,
} from "@/lib/server/config";
import { Alert } from "@/components/Alert";
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
    invalid_payload: "Telegram verification failed - try again",
    identity_mismatch:
      "The Telegram account does not match your linked identity",
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-[440px]">
        <header className="mb-8">
          <p className="text-[12px] text-muted mb-2">admin / verify</p>
          <h1 className="text-[28px] tracking-tight text-fg leading-none mb-2">
            Verify identity
          </h1>
          <p className="text-[14px] text-secondary">
            Admin access requires Telegram verification every{" "}
            <span className="text-fg tabular-nums font-medium">
              {adminStepUpTtlSeconds / 60}
            </span>{" "}
            minutes.
          </p>
        </header>

        {error && (
          <div className="mb-5">
            <Alert tone="danger">
              {errorMessages[error] ?? "Verification failed - try again"}
            </Alert>
          </div>
        )}

        <div className="bg-card border border-rule rounded-lg p-6">
          {!current.user.telegramId ? (
            <Alert tone="warning">
              No Telegram account is linked - link one from the dashboard first
            </Alert>
          ) : !botUsername ? (
            <Alert tone="danger">
              TELEGRAM_BOT_USERNAME is not configured
            </Alert>
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
