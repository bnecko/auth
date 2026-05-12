import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/session";
import {
  telegramBotUsername,
  authBaseUrl,
  adminStepUpTtlSeconds,
} from "@/lib/server/config";
import { Alert } from "@/components/Alert";
import { Glyph } from "@/components/Glyph";
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
    invalid_payload: "telegram verification failed — try again",
    identity_mismatch:
      "the telegram account does not match your linked identity",
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-[440px]">
        <header className="mb-8">
          <div className="flex items-baseline gap-2 mb-2 text-meta">
            <span className="text-danger">$</span>
            <span className="uppercase tracking-wider text-muted">
              admin.verify
            </span>
          </div>
          <h1 className="text-[28px] tracking-tightest text-fg leading-none mb-2">
            verify identity
          </h1>
          <p className="text-meta text-secondary">
            admin access requires telegram verification every{" "}
            <span className="text-danger tabular-nums">
              {adminStepUpTtlSeconds / 60}
            </span>{" "}
            minutes.
          </p>
        </header>

        {error && (
          <div className="mb-5">
            <Alert tone="danger">
              {errorMessages[error] ?? "verification failed — try again"}
            </Alert>
          </div>
        )}

        <div className="border-t border-b border-rule py-6">
          {!current.user.telegramId ? (
            <div className="flex items-baseline gap-3 text-meta">
              <Glyph kind="warn" />
              <span className="text-accent">
                no telegram account is linked — link one from the dashboard first
              </span>
            </div>
          ) : !botUsername ? (
            <div className="flex items-baseline gap-3 text-meta">
              <Glyph kind="error" />
              <span className="text-danger">
                TELEGRAM_BOT_USERNAME is not configured
              </span>
            </div>
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
