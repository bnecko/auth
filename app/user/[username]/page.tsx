import { notFound } from "next/navigation";
import { findUserByIdentifier } from "@/lib/server/repositories/users";
import { TopNav } from "@/components/TopNav";
import { Tag } from "@/components/Tag";
import { Section, Row, RowLabel, RowValue } from "@/components/Section";

export const dynamic = "force-dynamic";

export default async function UserProfilePage(props: {
  params: Promise<{ username: string }>;
}) {
  const params = await props.params;
  const username = decodeURIComponent(params.username);

  const user = await findUserByIdentifier(username);
  if (!user || user.username.toLowerCase() !== username.toLowerCase()) {
    notFound();
  }

  const joinedAt = new Date(user.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  const initials = (user.firstName || user.username).slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col min-h-screen bg-bg">
      <TopNav trail={`user / ${user.username}`} />

      <main
        className="flex-1 max-w-[720px] w-full mx-auto px-6 py-12"
        data-mount-stagger
      >
        <header className="mb-12" data-mount-row>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[12px] text-muted">User profile</span>
            {user.role === "admin" && <Tag tone="danger">Admin</Tag>}
            <Tag tone={user.status === "active" ? "success" : "warning"}>
              {user.status}
            </Tag>
          </div>

          <div className="flex items-start gap-5">
            <div
              className="h-16 w-16 rounded-lg border border-accent bg-card flex items-center justify-center text-accent-strong text-[20px] shrink-0"
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[36px] tracking-tight text-fg leading-none mb-2">
                {user.firstName}
              </h1>
              <p className="text-[16px] text-secondary">@{user.username}</p>
            </div>
          </div>
        </header>

        <div data-mount-row>
          <Section index="1.0" title="About" hint="Public info">
            <Row>
              <RowLabel>Bio</RowLabel>
              <RowValue>
                {user.bio || (
                  <span className="text-muted italic">No bio provided</span>
                )}
              </RowValue>
              <span />
            </Row>
            <Row>
              <RowLabel>Joined</RowLabel>
              <RowValue>{joinedAt}</RowValue>
              <span />
            </Row>
            {user.telegramUsername && (
              <Row>
                <RowLabel>Telegram</RowLabel>
                <RowValue>
                  <a
                    href={`https://t.me/${user.telegramUsername}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent-strong hover:text-fg transition-colors flex items-baseline gap-1.5"
                  >
                    <span>@{user.telegramUsername}</span>
                    <span className="text-[12px] text-faint">↗</span>
                  </a>
                </RowValue>
                <span />
              </Row>
            )}
          </Section>
        </div>

        <div data-mount-row>
          <p className="text-[12px] text-faint">End of profile</p>
        </div>
      </main>
    </div>
  );
}
