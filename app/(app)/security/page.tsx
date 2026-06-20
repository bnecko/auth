import { redirect } from "next/navigation";

// Settings moved under /settings; keep the old path working for bookmarks.
export default function SecurityRedirect() {
  redirect("/settings/security");
}
