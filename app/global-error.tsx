"use client";

import "./globals.css";

// Last-resort boundary: it replaces the root layout, so it ships its own html
// and body and cannot use anything from the app shell. Next pre-renders this
// route at build time without a CSP nonce, so under the production policy its
// script may never hydrate: the recovery path is the plain link, and the
// button is a bonus for when hydration does happen.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="font-sans bg-canvas text-fg">
        <main className="min-h-screen flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-[400px] bg-card border border-rule rounded-lg shadow-card p-7">
            <h1 className="text-[20px] tracking-tight text-fg mb-1.5">
              Something went wrong
            </h1>
            <p className="text-[13px] text-secondary mb-5">
              The page could not be loaded.
            </p>
            {error.digest && (
              <p className="text-[12px] text-muted mb-5">
                Reference <code className="font-mono text-fg">{error.digest}</code>
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={reset}
                className="h-10 px-4 text-[14px] font-medium rounded-md bg-card text-fg border border-rule hover:bg-hover transition"
              >
                Try again
              </button>
              <a href="/" className="text-[13px] text-accent-strong hover:underline">
                Go home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
