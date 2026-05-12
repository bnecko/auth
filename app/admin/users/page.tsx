import { Section, Empty, Row, RowLabel, RowValue } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { Glyph } from "@/components/Glyph";
import { query } from "@/lib/server/db";
import { getCurrentSession } from "@/lib/server/session";
import { redirect } from "next/navigation";
import { banUserAction, unbanUserAction } from "./actions";

export const dynamic = "force-dynamic";

async function getUsers(search: string) {
  if (search) {
    return query<{
      id: string;
      username: string;
      email: string;
      status: string;
      telegram_id: string | null;
      role: string;
      created_at: string;
    }>(
      `select id, username, email, status, telegram_id, role, created_at::text
         from users
        where username_normalized ilike $1 or email_normalized ilike $1
        order by created_at desc
        limit 100`,
      [`%${search.toLowerCase()}%`],
    );
  }
  return query<{
    id: string;
    username: string;
    email: string;
    status: string;
    telegram_id: string | null;
    role: string;
    created_at: string;
  }>(
    `select id, username, email, status, telegram_id, role, created_at::text
       from users
      order by created_at desc
      limit 100`,
  );
}

const statusTone: Record<
  string,
  "success" | "warning" | "danger" | "neutral"
> = {
  active: "success",
  limited: "warning",
  banned: "danger",
  pending: "neutral",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const current = await getCurrentSession();
  if (!current || current.user.role !== "admin") redirect("/");

  const params = await searchParams;
  const search = params.q?.trim() || "";
  const users = await getUsers(search);

  return (
    <main
      className="flex-1 max-w-[1040px] w-full mx-auto px-6 py-10"
      data-mount-stagger
    >
      <header className="mb-10" data-mount-row>
        <div className="flex items-baseline gap-2 mb-2 text-meta">
          <span className="text-danger">$</span>
          <span className="uppercase tracking-wider text-muted">
            admin.users
          </span>
          <span className="text-faint">·</span>
          <span className="text-meta text-faint tabular-nums">
            {String(users.length).padStart(2, "0")}
          </span>
        </div>
        <h1 className="text-[32px] tracking-tightest text-fg leading-none mb-5">
          users
        </h1>
        <form method="GET" className="flex items-baseline gap-2 max-w-[420px]">
          <span className="text-danger">$</span>
          <input
            name="q"
            defaultValue={search}
            placeholder="grep username|email"
            className="flex-1 bg-transparent border-0 border-b border-rule px-1 h-8 text-[13px] text-fg placeholder:text-faint focus:outline-none focus:border-accent transition-colors"
          />
        </form>
      </header>

      <div data-mount-row>
        <Section
          index="1.0"
          title="users"
          hint={
            search
              ? `${users.length} matching "${search}"`
              : `${users.length} most recent`
          }
        >
          {users.length === 0 ? (
            <Empty>no users found</Empty>
          ) : (
            users.map(u => (
              <Row key={u.id}>
                <RowLabel>
                  <span className="flex items-baseline gap-2">
                    <span className="text-fg normal-case tracking-normal">
                      @{u.username}
                    </span>
                    {u.role === "admin" && <Tag tone="danger">admin</Tag>}
                  </span>
                </RowLabel>
                <RowValue>
                  <Tag tone={statusTone[u.status] ?? "neutral"}>{u.status}</Tag>
                  <Glyph kind="dot" />
                  <span className="text-muted truncate">{u.email}</span>
                  <Glyph kind="dot" />
                  <span className="text-faint tabular-nums">
                    {u.created_at?.slice(0, 10)}
                  </span>
                </RowValue>
                <div className="text-meta uppercase tracking-wider">
                  {u.status !== "banned" ? (
                    <form action={banUserAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button
                        type="submit"
                        className="text-secondary hover:text-danger transition-colors"
                      >
                        ban
                      </button>
                    </form>
                  ) : (
                    <form action={unbanUserAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button
                        type="submit"
                        className="text-secondary hover:text-accent transition-colors"
                      >
                        unban
                      </button>
                    </form>
                  )}
                </div>
              </Row>
            ))
          )}
        </Section>
      </div>
    </main>
  );
}
