import { notFound } from "next/navigation";
import { findUserByIdentifier } from "@/lib/server/repositories/users";
import { TopNav } from "@/components/TopNav";
import { Tag } from "@/components/Tag";
import { Section, Row, RowLabel, RowValue } from "@/components/Section";
import { Glyph } from "@/components/Glyph";

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
          <div className="flex items-baseline gap-2 mb-2 text-meta">
            <span className="text-accent">$</span>
            <span className="uppercase tracking-wider text-muted">
              user.profile
            </span>
            {user.role === "admin" && (
              <>
                <span className="text-faint">·</span>
                <Tag tone="danger">admin</Tag>
              </>
            )}
            <span className="text-faint">·</span>
            <Tag tone={user.status === "active" ? "success" : "warning"}>
              {user.status}
            </Tag>
          </div>

          <div className="flex items-start gap-5">
            <div
              className="h-16 w-16 border border-accent flex items-center justify-center text-accent text-[20px] tracking-wider shrink-0"
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[36px] tracking-tightest text-fg leading-none mb-2">
                {user.firstName}
              </h1>
              <p className="text-[16px] text-secondary">@{user.username}</p>
            </div>
          </div>
        </header>

        <div data-mount-row>
          <Section index="1.0" title="about" hint="public info">
            <Row>
              <RowLabel>bio</RowLabel>
              <RowValue>
                {user.bio || (
                  <span className="text-muted italic">no bio provided</span>
                )}
              </RowValue>
              <span />
            </Row>
            <Row>
              <RowLabel>joined</RowLabel>
              <RowValue>{joinedAt}</RowValue>
              <span />
            </Row>
            {user.telegramUsername && (
              <Row>
                <RowLabel>telegram</RowLabel>
                <RowValue>
                  <a
                    href={`https://t.me/${user.telegramUsername}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:text-fg transition-colors flex items-baseline gap-1.5"
                  >
                    <span>@{user.telegramUsername}</span>
                    <span className="text-meta text-faint">↗</span>
                  </a>
                </RowValue>
                <span />
              </Row>
            )}
          </Section>
        </div>

        <div data-mount-row>
          <div className="text-meta text-faint flex items-baseline gap-2">
            <Glyph kind="prompt" muted />
            <span>end of profile</span>
          </div>
        </div>
      </main>
    </div>
  );
}
