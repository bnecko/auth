import { redirect } from "next/navigation";
import {
  MonitorSmartphone,
  Monitor,
  Smartphone,
  Tablet,
  type LucideIcon,
} from "lucide-react";
import { Section, Row, RowLabel, RowValue } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { ConfirmButton } from "@/components/ConfirmButton";
import { getCurrentSession } from "@/lib/server/session";
import { listSessionsForUser } from "@/lib/server/repositories/sessions";
import { parseUserAgent, type DeviceType } from "@/lib/userAgentDisplay";
import { revokeSessionAction } from "@/app/dashboard-actions";
import { revokeOtherSessionsAction } from "@/app/security/actions";

export const dynamic = "force-dynamic";

const deviceIcon: Record<DeviceType, LucideIcon> = {
  mobile: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
  unknown: MonitorSmartphone,
};

function relativeTime(value: string | null) {
  if (!value) return "never";
  const then = Date.parse(value);
  if (Number.isNaN(then)) return "never";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return value.slice(0, 10);
}

export default async function SessionsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const u = current.user;
  const sessions = await listSessionsForUser(u.id);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Sessions</h1>
        <p className="text-[13px] text-muted">Devices currently signed in</p>
      </header>

      <Section
        title="Sessions"
        icon={MonitorSmartphone}
        hint="Signed-in devices"
        action={
          <ConfirmButton
            action={revokeOtherSessionsAction}
            label="Revoke others"
            triggerVariant="danger"
            tone="danger"
            title="Revoke all other sessions?"
            message="Every signed-in device except this one is signed out immediately."
            confirmLabel="Revoke others"
          />
        }
      >
        {sessions.map(session => {
          const ua = parseUserAgent(session.userAgent);
          const Icon = deviceIcon[ua.deviceType];
          const isCurrent = session.id === current.session.id;
          const lastActive = relativeTime(session.lastSeenAt);
          return (
            <Row key={session.id}>
              <RowLabel>
                <span className="flex items-center gap-2 min-w-0">
                  <Icon size={15} className="text-muted shrink-0" />
                  <span className="truncate" title={session.userAgent || undefined}>
                    {ua.label}
                  </span>
                </span>
              </RowLabel>
              <RowValue>
                <span className="text-secondary truncate">{session.ip || "Unknown IP"}</span>
                <span className="text-muted">·</span>
                <span className="text-muted" title={session.lastSeenAt || undefined}>
                  Last active {lastActive}
                </span>
                {isCurrent && <Tag tone="success">This device</Tag>}
              </RowValue>
              {isCurrent ? (
                <span className="text-[12px] text-faint">Current</span>
              ) : (
                <ConfirmButton
                  action={revokeSessionAction}
                  fields={{ sessionId: session.id }}
                  label="Revoke"
                  triggerVariant="danger"
                  tone="danger"
                  title="Revoke this session?"
                  message="This device is signed out immediately."
                  preview={
                    <span className="flex flex-col gap-0.5">
                      <span className="text-fg">{ua.label}</span>
                      <span className="text-muted">
                        {session.ip || "Unknown IP"} · last active {lastActive}
                      </span>
                    </span>
                  }
                  confirmLabel="Revoke session"
                />
              )}
            </Row>
          );
        })}
      </Section>
    </>
  );
}
