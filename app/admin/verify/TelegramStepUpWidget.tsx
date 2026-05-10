"use client";

import Script from "next/script";

export function TelegramStepUpWidget({
  botUsername,
  callbackUrl,
}: {
  botUsername: string;
  callbackUrl: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-[13px] text-secondary text-center">
        Confirm you are the linked Telegram account to continue.
      </p>
      <div id="tg-step-up-widget" />
      <Script
        src="https://telegram.org/js/telegram-widget.js?22"
        data-telegram-login={botUsername}
        data-size="large"
        data-auth-url={callbackUrl}
        data-request-access="write"
        data-userpic="false"
        strategy="afterInteractive"
      />
    </div>
  );
}
