// Where to send someone after they sign in, taken from a link anyone can
// craft. Checking that it starts with a single slash is not enough. In this
// position a browser reads a backslash as a slash, and it drops tabs and
// newlines before parsing, so a value that passes that check can still name
// another site, and the person arrives there straight from the genuine sign-in
// page. So the value is resolved the way the browser will resolve it and kept
// only if it is still on this origin.
export function safeNext(value: string | null | undefined, origin: string) {
  if (!value || !value.startsWith("/")) return "/";
  try {
    const target = new URL(value, origin);
    if (target.origin !== origin) return "/";
    // What comes back is handed to the browser again as a relative reference,
    // and a path that starts with two slashes is read as another host the
    // second time round, even though it resolved to this one the first.
    if (target.pathname.startsWith("//")) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}
