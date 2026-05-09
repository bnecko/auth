import { notFound } from "next/navigation";
import { findUserByIdentifier } from "@/lib/server/repositories/users";
import { TopNav } from "@/components/TopNav";
import { Tag } from "@/components/Tag";
import { Section, Row, RowLabel, RowValue } from "@/components/Section";

export const dynamic = "force-dynamic";

export default async function UserProfilePage(props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  const username = decodeURIComponent(params.username);
  
  const user = await findUserByIdentifier(username);
  if (!user || user.username.toLowerCase() !== username.toLowerCase()) {
    notFound();
  }

  // Intentionally expose only safe public fields.
  const joinedAt = new Date(user.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  return (
    <div className="flex flex-col min-h-screen bg-bg">
      <TopNav trail={`user / ${user.username}`} />
      
      <main className="flex-1 max-w-[640px] w-full mx-auto px-6 py-12">
        <header className="mb-10">
          <div className="flex items-baseline gap-3 mb-2">
            <span className="text-micro uppercase text-faint">public profile</span>
            {user.role === "admin" && (
              <Tag tone="danger">admin</Tag>
            )}
            <Tag tone={user.status === "active" ? "success" : "warning"}>
              {user.status}
            </Tag>
          </div>
          <h1 className="text-[28px] tracking-tightest text-fg leading-none mb-3">
            {user.firstName}
          </h1>
          <p className="text-meta text-secondary">
            @{user.username}
          </p>
        </header>

        <Section title="about" hint="// public info">
          <Row>
            <RowLabel>bio</RowLabel>
            <RowValue>{user.bio || "no bio provided"}</RowValue>
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
                  className="text-secondary hover:text-fg transition-colors"
                >
                  @{user.telegramUsername}
                </a>
              </RowValue>
              <span />
            </Row>
          )}
        </Section>
      </main>
    </div>
  );
}
