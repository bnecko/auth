import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { isAdminStepUpVerified } from "@/lib/server/adminStepUp";
import { getCurrentSession } from "@/lib/server/session";

// Gated admin panel: requires a live Telegram step-up. /admin/verify is a
// sibling route (outside this group), so the redirect below is a real segment
// change that resolves correctly during client-side navigation.
export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") {
    redirect("/");
  }
  if (!(await isAdminStepUpVerified(current.user.id))) {
    redirect("/admin/verify");
  }

  return (
    <AppShell
      variant="admin"
      user={{
        name: current.user.firstName || current.user.username,
        username: current.user.username,
      }}
    >
      {children}
    </AppShell>
  );
}
