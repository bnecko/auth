import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { isAdminStepUpVerified } from "@/lib/server/adminStepUp";
import { getCurrentSession } from "@/lib/server/session";

const TRAILS: Record<string, string> = {
  "/admin": "Overview",
  "/admin/users": "Users",
  "/admin/oauth-clients": "OAuth clients",
  "/admin/keys": "Signing keys",
  "/admin/activation-requests": "Activation requests",
  "/admin/webhooks": "Webhook deliveries",
  "/admin/bans": "Bans",
  "/admin/security": "Security events",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") {
    redirect("/");
  }

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";

  // The step-up gate renders its own minimal shell; everything else gets the
  // admin app shell once the live Telegram step-up is verified.
  if (pathname === "/admin/verify") {
    return <>{children}</>;
  }

  const verified = await isAdminStepUpVerified(current.user.id);
  if (!verified) {
    redirect("/admin/verify");
  }

  return (
    <AppShell
      variant="admin"
      user={{
        name: current.user.firstName || current.user.username,
        username: current.user.username,
      }}
      trail={TRAILS[pathname] ?? "Admin"}
    >
      {children}
    </AppShell>
  );
}
