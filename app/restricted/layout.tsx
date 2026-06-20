import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/session";
import { signOutAction } from "./actions";

// The only surface a restricted account can reach. Outside (app) so the
// restricted-redirect there does not loop. Gated so non-restricted users never
// land here.
export default async function RestrictedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.user.restricted) redirect("/");

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="h-[58px] shrink-0 sticky top-0 z-30 bg-canvas border-b border-rule flex items-center px-4 gap-3">
        <span className="flex items-center gap-2 select-none">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 1 V7 L8 12 V19" stroke="var(--danger)" strokeWidth="1.5" />
            <path d="M17 1 V7 L12 12 V19" stroke="var(--danger)" strokeWidth="1.5" />
            <path d="M8 12 H12" stroke="var(--danger)" strokeWidth="1.5" />
          </svg>
          <span className="text-[15px] font-semibold tracking-tight text-fg">bottleneck</span>
        </span>
        <span className="inline-flex items-center rounded bg-[#fdecec] px-1.5 py-0.5 text-[11px] font-medium text-danger">
          Restricted
        </span>
        <form action={signOutAction} className="ml-auto">
          <button
            type="submit"
            className="h-8 px-3 inline-flex items-center rounded-md text-[13px] text-secondary hover:bg-hover hover:text-danger transition-colors"
          >
            Sign out
          </button>
        </form>
      </header>
      <main className="flex-1 min-w-0">
        <div className="mx-auto w-full max-w-[760px] px-6 md:px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
