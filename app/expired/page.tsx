import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";

type Reason = "invalid" | "expired" | "denied" | "unavailable";

const copy: Record<Reason, { title: string; body: string; tag: string }> = {
  invalid: {
    title: "Invalid activation",
    body: "This link is malformed or has already been used.",
    tag: "auth/error / invalid",
  },
  expired: {
    title: "Activation expired",
    body: "This request is no longer valid.",
    tag: "auth/error / expired",
  },
  denied: {
    title: "Activation denied",
    body: "You denied this request. The app was not authorized.",
    tag: "auth/error / denied",
  },
  unavailable: {
    title: "App unavailable",
    body: "This app is not currently available.",
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
      <h1 className="text-[24px] text-fg mb-2">{title}</h1>
      <p className="text-[13px] text-secondary mb-6">{body}</p>
      <Link href="/">
        <Button variant="secondary" type="button">
          Return to dashboard
        </Button>
      </Link>
    </AuthShell>
  );
}
