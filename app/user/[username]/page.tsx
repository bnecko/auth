import { notFound, redirect } from "next/navigation";
import { findUserByIdentifier } from "@/lib/server/repositories/users";

export const dynamic = "force-dynamic";

// Username-keyed alias. Usernames are mutable, so the canonical public profile
// lives at /u/[publicId]; this resolves the handle and redirects there.
export default async function UserProfileAlias(props: {
  params: Promise<{ username: string }>;
}) {
  const params = await props.params;
  const username = decodeURIComponent(params.username);

  const user = await findUserByIdentifier(username);
  if (!user || user.username.toLowerCase() !== username.toLowerCase()) {
    notFound();
  }

  redirect(`/u/${user.publicId}`);
}
