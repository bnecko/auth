import { Section, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
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

const statusTone: Record<string, "success" | "warning" | "danger" | "neutral"> = {
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
    <main className="flex-1 max-w-[960px] w-full mx-auto px-6 py-10">
      <header className="mb-7">
        <h1 className="text-[26px] tracking-tightest text-fg leading-none mb-4">
          Users
        </h1>
        <form method="GET">
          <input
            name="q"
            defaultValue={search}
            placeholder="search username or email"
            className="w-full max-w-[360px] bg-surface border border-border rounded-sm px-3 py-2 text-[13px] text-fg placeholder:text-faint focus:outline-none focus:border-secondary"
          />
        </form>
      </header>

      <Section title={`${users.length} user${users.length !== 1 ? "s" : ""}${search ? ` matching "${search}"` : ""}`}>
        {users.length === 0 ? (
          <Empty>no users found</Empty>
        ) : (
          users.map(u => (
            <div
              key={u.id}
              className="border-b border-border last:border-0 px-4 py-3 flex items-center gap-4 text-[13px]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-fg font-medium">@{u.username}</span>
                  <Tag tone={statusTone[u.status] ?? "neutral"}>{u.status}</Tag>
                  {u.role === "admin" && <Tag tone="warning">admin</Tag>}
                </div>
                <div className="text-muted mt-0.5">{u.email}</div>
                <div className="text-faint text-meta mt-0.5">
                  id: {u.id} &middot; tg: {u.telegram_id ?? "none"} &middot;{" "}
                  {u.created_at?.slice(0, 10)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {u.status !== "banned" ? (
                  <form action={banUserAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button
                      type="submit"
                      className="text-meta uppercase tracking-wider text-danger border border-border px-2.5 py-1 rounded-sm hover:bg-surface transition-colors"
                    >
                      Ban
                    </button>
                  </form>
                ) : (
                  <form action={unbanUserAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button
                      type="submit"
                      className="text-meta uppercase tracking-wider text-secondary border border-border px-2.5 py-1 rounded-sm hover:bg-surface transition-colors"
                    >
                      Unban
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))
        )}
      </Section>
    </main>
  );
}
