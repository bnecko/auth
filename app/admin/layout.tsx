import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentSession();
  
  if (!current || current.user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-bg">
      {children}
    </div>
  );
}
