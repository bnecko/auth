import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";

type Reason = "invalid" | "expired" | "denied" | "unavailable";

const copy: Record<Reason, { title: string; body: string; tag: string }> = {
  invalid: {
    title: "invalid activation",
    body: "this link is malformed or has already been used.",
    tag: "auth/error / invalid",
  },
  expired: {
    title: "activation expired",
    body: "this request is no longer valid.",
    tag: "auth/error / expired",
  },
  denied: {
    title: "activation denied",
    body: "you denied this request. the app was not authorized.",
    tag: "auth/error / denied",
  },
  unavailable: {
    title: "app unavailable",
    body: "this app is not currently available.",
    tag: "auth/error / unavailable",
  },
};

export default async function ExpiredPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason: reasonParam } = await searchParams;
  const reason: Reason =
    reasonParam === "invalid" ||
    reasonParam === "denied" ||
    reasonParam === "unavailable"
      ? reasonParam
      : "expired";
  const { title, body, tag } = copy[reason];

  return (
    <AuthShell tag={tag}>
      <h1 className="text-[22px] tracking-tightest text-fg mb-2">{title}</h1>
      <p className="text-[13px] text-secondary mb-6">{body}</p>
      <Link href="/">
        <Button variant="secondary" type="button">
          return to dashboard
        </Button>
      </Link>
    </AuthShell>
  );
}
