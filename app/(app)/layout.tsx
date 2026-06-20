import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentSession } from "@/lib/server/session";

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

  return (
    <AppShell
      user={{ name: current.user.firstName, username: current.user.username }}
      isAdmin={current.user.role === "admin"}
    >
      {children}
    </AppShell>
  );
}
