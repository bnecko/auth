import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/session";

// Admin area gate: require an admin account. The Telegram step-up check lives in
// the (panel) layout so that /admin/verify is reachable without being gated —
// gating it caused a redirect-to-self / blank page on client-side navigation.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") {
    redirect("/");
  }
  return <>{children}</>;
}
