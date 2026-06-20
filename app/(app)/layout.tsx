import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentSession } from "@/lib/server/session";
import { canHandleSecurity } from "@/lib/server/supporterAuth";

// Shared shell for the authenticated account area. Rendering AppShell here (not
// per page) keeps the header and sidebar mounted across navigation - only the
// content swaps, which is what lets loading.tsx ghost just the content.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentSession();
  if (!current) {
    redirect("/login");
  }
  // A restricted account may only reach the security conversation at /restricted.
  if (current.user.restricted) {
    redirect("/restricted");
  }

  const isSecurity = await canHandleSecurity(current.user);

  return (
    <AppShell
      user={{ name: current.user.firstName, username: current.user.username }}
      isAdmin={current.user.role === "admin"}
      isSecurity={isSecurity}
    >
      {children}
    </AppShell>
  );
}
