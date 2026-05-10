import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/AdminSidebar";
import { isAdminStepUpVerified } from "@/lib/server/adminStepUp";
import { getCurrentSession } from "@/lib/server/session";

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

  if (pathname !== "/admin/verify") {
    const verified = await isAdminStepUpVerified(current.user.id);
    if (!verified) {
      redirect("/admin/verify");
    }
  }

  return (
    <div className="flex min-h-screen bg-bg">
      {pathname !== "/admin/verify" && (
        <AdminSidebar username={current.user.username} />
      )}
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
