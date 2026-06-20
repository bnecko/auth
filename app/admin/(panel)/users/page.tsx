import { Section, Empty, Row, RowLabel, RowValue } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { ConfirmButton } from "@/components/ConfirmButton";
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
    <>
      <header className="mb-10" data-mount-row>
        <p className="text-[12px] text-muted mb-2 tabular-nums">
          Admin / Users &middot; {users.length} records
        </p>
        <h1 className="text-[32px] tracking-tight text-fg leading-none mb-5">
          Users
        </h1>
        <form method="GET" className="max-w-[420px]">
          <input
            name="q"
            defaultValue={search}
            placeholder="Search username or email"
            className="w-full bg-card border border-rule rounded-md px-3 h-9 text-[13px] text-fg placeholder:text-faint focus:outline-hidden focus:border-accent transition-colors"
          />
        </form>
      </header>

      <div data-mount-row>
        <Section
          index="1.0"
          title="Users"
          hint={
            search
              ? `${users.length} matching "${search}"`
              : `${users.length} most recent`
          }
        >
          {users.length === 0 ? (
            <Empty>No users found</Empty>
          ) : (
            users.map(u => (
              <Row key={u.id}>
                <RowLabel>
                  <span className="flex items-baseline gap-2">
                    <span className="text-fg">
                      @{u.username}
                    </span>
                    {u.role === "admin" && <Tag tone="danger">Admin</Tag>}
                  </span>
                </RowLabel>
                <RowValue>
                  <Tag tone={statusTone[u.status] ?? "neutral"}>{u.status}</Tag>
                  <span className="text-muted truncate">{u.email}</span>
                  <span className="text-faint tabular-nums">
                    {u.created_at?.slice(0, 10)}
                  </span>
                </RowValue>
                <div>
                  {String(current.user.id) === u.id ? (
                    <span className="text-[12px] text-faint">You</span>
                  ) : u.status !== "banned" ? (
                    <ConfirmButton
                      action={banUserAction}
                      fields={{ userId: u.id }}
                      extraInput={{
                        name: "reason",
                        label: "Reason (optional)",
                        placeholder: "Why is this account being banned?",
                        multiline: true,
                      }}
                      label="Ban"
                      triggerVariant="danger"
                      tone="danger"
                      title={`Ban @${u.username}?`}
                      message="They will be signed out everywhere and blocked from signing in. You can unban them later."
                      preview={
                        <span className="flex items-center gap-2">
                          <span className="text-fg">@{u.username}</span>
                          <span className="text-muted truncate">{u.email}</span>
                          <Tag tone={statusTone[u.status] ?? "neutral"}>{u.status}</Tag>
                        </span>
                      }
                      confirmLabel="Ban account"
                    />
                  ) : (
                    <ConfirmButton
                      action={unbanUserAction}
                      fields={{ userId: u.id }}
                      label="Unban"
                      triggerVariant="secondary"
                      tone="warning"
                      title={`Unban @${u.username}?`}
                      message="They will be able to sign in again."
                      confirmLabel="Unban account"
                    />
                  )}
                </div>
              </Row>
            ))
          )}
        </Section>
      </div>
    </>
  );
}
