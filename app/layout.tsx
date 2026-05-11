import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "bottleneck / auth",
  description: "Sign in to Bottleneck.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading x-nonce here causes Next.js to apply the nonce to its own
  // generated inline scripts (hydration bootstrap), which is required for
  // the nonce-based CSP in production to not block the page from loading.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" nonce={nonce}>
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="font-mono">{children}</body>
    </html>
  );
}
