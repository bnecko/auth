import { redirect } from "next/navigation";

// Recent events became Settings -> Activity; keep the old path working.
export default function EventsRedirect() {
  redirect("/settings/activity");
}
