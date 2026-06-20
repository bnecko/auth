import { redirect } from "next/navigation";

// Settings moved under /settings; keep the old path working for bookmarks.
export default function ProfileRedirect() {
  redirect("/settings/profile");
}
