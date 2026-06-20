import { notFound } from "next/navigation";
import { findUserByPublicId } from "@/lib/server/repositories/users";
import { telegramPublicRef } from "@/lib/server/telegramRef";
import { TopNav } from "@/components/TopNav";
import { Tag } from "@/components/Tag";
import { Identicon } from "@/components/Identicon";
import { Section, Row, RowLabel, RowValue } from "@/components/Section";

export const dynamic = "force-dynamic";

// Canonical public profile, keyed on the stable public_id so the URL survives a
// username change. /user/[username] redirects here.
export default async function PublicProfilePage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const user = await findUserByPublicId(id);
  if (!user) notFound();

  const joinedAt = new Date(user.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
  const ref = telegramPublicRef(user.telegramId);

  return (
    <div className="flex flex-col min-h-screen bg-bg">
      <TopNav trail={`user / ${user.username}`} />

      <main className="flex-1 max-w-[720px] w-full mx-auto px-6 py-12" data-mount-stagger>
        <header className="mb-12" data-mount-row>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[12px] text-muted">User profile</span>
            {user.role === "admin" && <Tag tone="danger">Admin</Tag>}
            <Tag tone={user.status === "active" ? "success" : "warning"}>{user.status}</Tag>
          </div>

          <div className="flex items-start gap-5">
            <Identicon seed={user.publicId} preset={user.avatarPreset} size={64} />
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
                {user.bio || <span className="text-muted italic">No bio provided</span>}
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
            {ref && (
              <Row>
                <RowLabel>Telegram ref</RowLabel>
                <RowValue>
                  <code className="text-[12px] text-secondary">{ref}</code>
                </RowValue>
                <span />
              </Row>
            )}
          </Section>
        </div>
      </main>
    </div>
  );
}
