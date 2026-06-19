import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { ThemeEasterEgg } from "@/components/ThemeEasterEgg";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "bottleneck / auth",
  description: "Sign in to Bottleneck.",
  icons: {
    icon: "/favicon.svg",
  },
};

// Apply the persisted easter-egg accent before paint. Without this, a reload
// would briefly flash the default accent before useEffect runs.
const themeBootstrap = `(function(){try{if(localStorage.getItem("bn-theme")==="blood"){var s=document.documentElement.style;s.setProperty("--accent","#ff003c");s.setProperty("--accent-strong","#b3002a");}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading x-nonce here causes Next.js to apply the nonce to its own
  // generated inline scripts (hydration bootstrap), which is required for
  // the nonce-based CSP in production to not block the page from loading.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" nonce={nonce} className={inter.variable}>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: themeBootstrap }}
        />
      </head>
      <body className="font-sans">
        <ThemeEasterEgg />
        {children}
      </body>
    </html>
  );
}
