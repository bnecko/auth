import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Section, Row, RowLabel, RowValue } from "@/components/Section";
import { getCurrentSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const u = current.user;

  return (
    <AppShell
      user={{ name: u.firstName, username: u.username }}
      trail="Profile"
      isAdmin={u.role === "admin"}
    >
      <header data-mount-row className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Profile</h1>
        <p className="text-[13px] text-muted">Your account details</p>
      </header>

      <Section title="Profile" hint="Account fields">
        <Row><RowLabel>First name</RowLabel><RowValue>{u.firstName}</RowValue><span /></Row>
        <Row><RowLabel>Username</RowLabel><RowValue>@{u.username}</RowValue><span /></Row>
        <Row>
          <RowLabel>Bio</RowLabel>
          <RowValue>{u.bio || "Not set"}</RowValue>
          <span className="text-[12px] text-ok">Public</span>
        </Row>
        <Row><RowLabel>Email</RowLabel><RowValue privateField>{u.email}</RowValue><span /></Row>
        <Row>
          <RowLabel>Date of birth</RowLabel>
          <RowValue privateField>{u.dob || "Not set"}</RowValue>
          <span />
        </Row>
        <Row>
          <RowLabel>Telegram</RowLabel>
          <RowValue>
            {u.telegramUsername ? `@${u.telegramUsername}` : u.telegramId || "Not linked"}
          </RowValue>
          <a href="/relink" className="text-[13px] text-secondary hover:text-accent-strong transition-colors">
            Relink
          </a>
        </Row>
      </Section>
    </AppShell>
  );
}
